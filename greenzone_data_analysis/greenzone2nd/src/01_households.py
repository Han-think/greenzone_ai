"""1단계: 건축물대장 표제부 → 신월1동 세대 필지 (생활권을 나눌 '점')

정제 규칙
  1) 세대 = 세대수(세대) + 가구수(가구)
     - 공동주택(다세대·연립)은 '세대수', 단독·다가구는 '가구수'에 값이 들어감 → 더하면 건물의 주거 단위 수
  2) 아파트 제외: 기타용도에 '아파트'가 있는 건물, 그리고 그 건물이 있는 필지 전체
     (아파트 단지는 자체 분리수거장이 있어 그린존 대상이 아님)
  3) 상가주택 포함: 주용도가 근린생활시설이어도 세대·가구가 있으면 주민이 사는 건물이므로 포함
  4) 주용도가 단독·공동주택인데 세대·가구가 모두 0이면 1세대로 봄 (빈 값 보정)
  5) 지번으로 전자지도 건물에 연결: '11470'+'103'+'00'+대지구분코드+번(4자리)+지(4자리)
     = SIG_CD+EMD_CD+LI_CD+MNTN_YN+LNBR_MNNM+LNBR_SLNO
  6) 신월1동 경계 안 건물만, 필지(지번) 단위로 합쳐 대표점 1개
출력: build/households.geojson (필지별 세대·주택유형), build/households_stats.json
"""
import numpy as np
import pandas as pd
from gzlib import *

D = dong()

p = pd.read_excel(os.path.join(RAW, "pyojebu.xlsx"), dtype=str)
n_rows = len(p)
for c in ["세대수(세대)", "가구수(가구)"]:
    p[c] = pd.to_numeric(p[c], errors="coerce").fillna(0).astype(int)
p["기타용도"] = p["기타용도"].fillna("")
p["아파트"] = p["기타용도"].str.contains("아파트")
p["주거용도"] = p["주용도코드명"].isin(["단독주택", "공동주택"])
p["세대"] = p["세대수(세대)"] + p["가구수(가구)"]
p["보정1세대"] = p["주거용도"] & (p["세대"] == 0) & ~p["아파트"]
p.loc[p["보정1세대"], "세대"] = 1
p.loc[p["아파트"], "세대"] = 0
p["key"] = "11470103" + "00" + p["대지구분코드"].fillna("0") + p["번"].str.zfill(4) + p["지"].str.zfill(4)


def htype(r):
    u = r["기타용도"]
    if not r["주거용도"]:
        return "상가주택"
    for t in ("다세대", "다가구", "연립", "단독"):
        if t in u:
            return t
    return "공동주택(기타)" if r["주용도코드명"] == "공동주택" else "단독"


p["주택유형"] = p.apply(htype, axis=1)
p["승인연도"] = pd.to_numeric(p["사용승인일"].str[:4], errors="coerce")
apt_keys = set(p.loc[p["아파트"], "key"])

bd = read_emap("TL_SPBD_BULD")
bd = bd[bd.centroid.within(D)].copy()
bd["key"] = (bd["SIG_CD"] + bd["EMD_CD"] + bd["LI_CD"] + bd["MNTN_YN"].astype(str)
             + bd["LNBR_MNNM"].astype(int).astype(str).str.zfill(4) + bd["LNBR_SLNO"].astype(int).astype(str).str.zfill(4))
in_dong = set(bd["key"])

q = p[p["key"].isin(in_dong)]                       # 신월1동 안 표제부
hh_rows = q[(q["세대"] > 0) & ~q["key"].isin(apt_keys)]
agg = hh_rows.groupby("key").agg(세대=("세대", "sum"), 건물수=("세대", "size"),
                                 주택유형=("주택유형", lambda s: s.value_counts().index[0]),
                                 승인연도=("승인연도", "median"))
lots = bd.dissolve(by="key").reset_index()[["key", "geometry"]]
lots = lots.merge(agg, left_on="key", right_index=True)
lots["geometry"] = lots.geometry.representative_point()
lots = lots.sort_values("key").reset_index(drop=True)

# 연결률: 전자지도 주거 건물(BDTYP_CD 01·02로 시작) 필지 중 표제부에 있는 비율
res_keys = set(bd.loc[bd["BDTYP_CD"].astype(str).str[:2].isin(["01", "02"]), "key"])
link_rate = len(res_keys & set(p["key"])) / len(res_keys)

by_type = hh_rows.groupby("주택유형")["세대"].sum().sort_values(ascending=False)
yr = hh_rows.dropna(subset=["승인연도"])
stats = dict(
    표제부_행수=n_rows, 표제부_범위="양천구 신월동(법정동) 전체 = 신월1~7동",
    신월1동_표제부_행수=int(len(q)), 아파트_행수_신월1동=int(q["아파트"].sum()),
    아파트_필지수_신월1동=int(len(apt_keys & in_dong)),
    아파트_세대_신월1동=int(q.loc[q["아파트"], "세대수(세대)"].sum()),
    상가주택_건물수=int((hh_rows["주택유형"] == "상가주택").sum()), 상가주택_세대=int(hh_rows.loc[hh_rows["주택유형"] == "상가주택", "세대"].sum()),
    보정1세대_건물수=int(q["보정1세대"].sum()),
    세대있는_건물수=int(len(hh_rows)), 필지수=int(len(lots)), 총세대=int(lots["세대"].sum()),
    연결률=link_rate, 필지당_세대_중앙값=float(lots["세대"].median()), 필지당_세대_최대=int(lots["세대"].max()),
    주택유형별_세대={k: int(v) for k, v in by_type.items()},
    승인_1999년이전_비율=float(yr.loc[yr["승인연도"] < 2000, "세대"].sum() / yr["세대"].sum()),
)
lots.to_crs(4326).to_file(b("households.geojson"), driver="GeoJSON")
save_json(stats, "households_stats.json")
print(f"표제부 {n_rows:,}행 → 신월1동 {len(q):,}행 → 세대가 있는 건물 {len(hh_rows):,}동 → 필지 {len(lots):,}곳, {lots['세대'].sum():,}세대")
print(f"아파트 제외 {stats['아파트_행수_신월1동']}동, 상가주택 포함 {stats['상가주택_건물수']}동({stats['상가주택_세대']}세대), 0→1 보정 {stats['보정1세대_건물수']}동, 연결률 {link_rate:.1%}")
print("주택유형별 세대:", stats["주택유형별_세대"])
