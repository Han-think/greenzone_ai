"""4단계: 생활권마다 거점 1곳 정하기 (생활권 수 = 거점 수)

① 생활권 영역: 모든 지점을 '가장 가까운 세대 필지'의 생활권으로 칠함 (필지 보로노이 → 생활권별로 합침, 동 경계로 자름)
② 1차 후보 연결: 후보 위치가 생활권 영역 안에 있으면 그 생활권과 연결
   - 후보가 2곳 이상이면, 그 생활권 세대의 평균 보행거리가 가장 짧은 후보를 '거점', 나머지는 '예비'
③ 후보가 없는 생활권: 대안 지점 탐색 (후보가 있는 생활권도 같은 방법으로 '최적 도로 지점'을 구해 후보와 비교만 함)
   - 생활권 영역 안 도로구간을 STEP(10m) 간격으로 훑음
   - 조건: 등록 도로폭 ROAD_MIN(7m) 이상, 보호구역 대상시설 PROTECT_R(200m) 밖
   - 통과 지점 중 그 생활권 세대의 평균 보행거리가 가장 짧은 순으로 1~3순위 (서로 ALT_SPACING 60m 이상 떨어지게)
   - 1순위를 거점으로 두고 계산. 부지 유무는 팀 실사로 확인 (1순위가 안 되면 2·3순위)
④ 평가 (1차 엑셀 기준 4~6): 보행 접근성 200/300/400m, 거점별 담당 세대, 수거 순회 거리
출력: build/plan.pkl
"""
import itertools
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely import voronoi_polygons
from shapely.geometry import MultiPoint, Point
from shapely.ops import unary_union
from gzlib import *

D = dong()
net = load_net()
hh = households()
hh = hh.merge(pd.read_csv(b("communities.csv"), dtype={"key": str})[["key", "생활권"]], on="key")
W = hh["세대"].values.astype(float)
LAB = hh["생활권"].values
NC = int(LAB.max())
sn = [net.snap(p) for p in hh.geometry]
cand = candidates()
CD = pd.read_csv(b("cand_dist.csv"), dtype={"key": str})
assert (CD["key"].values == hh["key"].values).all()
CM = CD[cand["id"]].values

# ① 생활권 영역 --------------------------------------------------------------------------
vor = voronoi_polygons(MultiPoint(list(hh.geometry)), extend_to=D.buffer(500))
cells = gpd.GeoDataFrame(geometry=list(vor.geoms), crs=CRS_M)
cells = gpd.sjoin(cells, hh[["생활권", "geometry"]], predicate="contains").drop(columns="index_right")
zones = cells.dissolve(by="생활권").reset_index()
zones["geometry"] = zones.geometry.intersection(D).buffer(0)
zones = zones.sort_values("생활권").reset_index(drop=True)

# ② 1차 후보 연결 ------------------------------------------------------------------------
cz = gpd.sjoin(cand[["id", "번호", "이름", "geometry"]], zones[["생활권", "geometry"]], predicate="within", how="left")
cand["생활권"] = cz["생활권"].values
assert cand["생활권"].notna().all(), "생활권 영역 밖 후보가 있음"
cand["생활권"] = cand["생활권"].astype(int)
cand["생활권_평균보행_m"] = [wavg(CM[LAB == z, j], W[LAB == z]) for j, z in enumerate(cand["생활권"])]
cand["생활권_300m안"] = [coverage(CM[LAB == z, j], W[LAB == z], 300) for j, z in enumerate(cand["생활권"])]
cand["역할"] = "예비"
for z, g in cand.groupby("생활권"):
    cand.loc[g["생활권_평균보행_m"].idxmin(), "역할"] = "거점"

# ③ 대안 지점 ------------------------------------------------------------------------------
pf = gpd.read_file(PROTECT).to_crs(CRS_M)
rd = read_emap("TL_SPRD_MANAGE")
rd = rd[rd.intersects(D)].copy()
rd["ROAD_BT"] = pd.to_numeric(rd["ROAD_BT"], errors="coerce")
rn_name = dict(zip(rd["RN_CD"].astype(str), rd["RN"]))
junc = unary_union([Point(n) for n in net.G.nodes if net.G.degree(n) >= 3])
bd = read_emap("TL_SPBD_BULD")
bd = bd[bd.intersects(D.buffer(50))].copy()
bd["주소"] = [f"{rn_name.get(str(r), '')} {int(m)}" + (f"-{int(s)}" if int(s) else "")
              for r, m, s in zip(bd["RN_CD"], bd["BULD_MNNM"], bd["BULD_SLNO"])]
CLS = {"1": "고속국도", "2": "대로", "3": "로", "4": "길"}

pts = []
n_all = n_width = 0
for _, r in rd.iterrows():
    for part in getattr(r.geometry, "geoms", [r.geometry]):
        for s in np.arange(STEP / 2, part.length, STEP):
            p = part.interpolate(s)
            if not D.contains(p):
                continue
            n_all += 1
            if not (r["ROAD_BT"] >= ROAD_MIN):
                continue
            n_width += 1
            dpf = pf.distance(p)
            if dpf.min() <= PROTECT_R:
                continue
            k = dpf.idxmin()
            pts.append(dict(geometry=p, 도로명=r["RN"], 등록도로폭_m=float(r["ROAD_BT"]), 도로등급=CLS.get(str(r["ROA_CLS_SE"]), ""),
                            최근접_보호시설=f"{pf.at[k, '시설명']}({pf.at[k, '구분']})", 보호시설까지_m=float(dpf.min()),
                            교차로까지_m=float(p.distance(junc))))
PT = gpd.GeoDataFrame(pts, crs=CRS_M)
PT = gpd.sjoin(PT, zones[["생활권", "geometry"]], predicate="within").drop(columns="index_right")
print(f"동 안 도로 지점 {n_all:,}개 → 도로폭 {ROAD_MIN:g}m 이상 {n_width:,}개 → 보호구역 {PROTECT_R}m 밖 {len(PT):,}개")
ALT_FUNNEL = dict(전체=n_all, 도로폭통과=n_width, 보호구역통과=len(PT))

alts = []
for z in range(1, NC + 1):
    has_cand = (cand["생활권"] == z).any()      # 후보가 있는 생활권은 비교용으로 1순위만 계산
    m = LAB == z
    tg = [sn[i] for i in np.where(m)[0]]
    cz_pts = PT[PT["생활권"] == z].copy()
    if cz_pts.empty:
        print(f"생활권 {z}: 조건 통과 도로 지점 없음 → 운영 대안 필요")
        continue
    dd = [net.dist_to_many(p, tg) for p in cz_pts.geometry]
    cz_pts["생활권_평균보행_m"] = [wavg(x, W[m]) for x in dd]
    cz_pts["생활권_300m안"] = [coverage(x, W[m], 300) for x in dd]
    cz_pts = cz_pts.sort_values("생활권_평균보행_m")
    picked = []
    for idx, r in cz_pts.iterrows():
        if all(r.geometry.distance(q.geometry) >= ALT_SPACING for q in picked):
            picked.append(r)
        if len(picked) == (1 if has_cand else ALT_TOP):
            break
    for rank, r in enumerate(picked, 1):
        near = bd.iloc[bd.distance(r.geometry).values.argmin()]
        alts.append({**r.to_dict(), "순위": rank, "생활권_통과지점수": len(cz_pts), "용도": "참고(후보 있음)" if has_cand else "대안",
                     "가까운_건물주소": f"{near['주소']} 앞 ({near.geometry.distance(r.geometry):.0f}m)"})
ALL = gpd.GeoDataFrame(alts, crs=CRS_M)
ALL["id"] = [f"A{z}-{k}" if u == "대안" else f"R{z}" for z, k, u in zip(ALL["생활권"], ALL["순위"], ALL["용도"])]
ALT = ALL[ALL["용도"] == "대안"].reset_index(drop=True)
REF = ALL[ALL["용도"] != "대안"].reset_index(drop=True)
cand["생활권_최적도로지점_평균보행_m"] = cand["생활권"].map(dict(zip(REF["생활권"], REF["생활권_평균보행_m"])))

# 거점 9곳 확정 -----------------------------------------------------------------------------
hubs = []
for z in range(1, NC + 1):
    c = cand[(cand["생활권"] == z) & (cand["역할"] == "거점")]
    if len(c):
        r = c.iloc[0]
        hubs.append(dict(생활권=z, 거점id=r["id"], 구분="1차 후보", 이름=f"{int(r['번호'])}번 {r['이름']}", geometry=r.geometry))
    else:
        a = ALT[(ALT["생활권"] == z) & (ALT["순위"] == 1)]
        if len(a):
            r = a.iloc[0]
            hubs.append(dict(생활권=z, 거점id=r["id"], 구분="대안 지점 (실사 필요)", 이름=f"{r['도로명']} ({r['가까운_건물주소']})", geometry=r.geometry))
HUB = gpd.GeoDataFrame(hubs, crs=CRS_M)
HD = np.column_stack([net.dist_to_many(p, sn) for p in HUB.geometry])   # 필지 × 거점

own = np.array([HD[i, z - 1] for i, z in enumerate(LAB)])               # 자기 생활권 거점까지
near = HD.min(1)                                                          # 가장 가까운 거점까지
for k, z in enumerate(HUB["생활권"]):
    m = LAB == z
    HUB.loc[k, "담당세대"] = int(W[m].sum())
    HUB.loc[k, "담당필지"] = int(m.sum())
    HUB.loc[k, "평균보행_m"] = wavg(own[m], W[m])
    HUB.loc[k, "최대보행_m"] = float(own[m].max())
    HUB.loc[k, "세대90%_m"] = wpct(own[m], W[m], 90)
    for Dc in COVER_D:
        HUB.loc[k, f"{Dc}m안"] = coverage(own[m], W[m], Dc)


# 수거 순회 거리 (거점끼리 한 바퀴, 도로 기준, 전수 계산)
def tour(points):
    n = len(points)
    sp = [net.snap(p) for p in points]
    M = np.array([net.dist_to_many(s, sp, cutoff=5000) for s in sp])
    best = min(itertools.permutations(range(1, n)), key=lambda o: M[0, o[0]] + sum(M[o[i], o[i + 1]] for i in range(n - 2)) + M[o[-1], 0])
    order = (0,) + best
    return float(sum(M[order[i], order[(i + 1) % n]] for i in range(n))), [int(x) for x in order]


route_len, route_order = tour(list(HUB.geometry))


def summary(name, d, n):
    return dict(안=name, 거점수=n, 평균보행_m=wavg(d, W), 세대90퍼_m=wpct(d, W, 90), 최대보행_m=float(d.max()),
                **{f"{Dc}m안": coverage(d, W, Dc) for Dc in COVER_D})


adopted = cand[cand["역할"] == "거점"]
CMP = pd.DataFrame([
    summary(f"생활권 거점 {NC}곳 (자기 생활권 거점 이용)", own, NC),
    summary(f"생활권 거점 {NC}곳 (가장 가까운 거점 이용)", near, NC),
    summary(f"1차 후보 중 거점 {len(adopted)}곳만", CM[:, adopted.index].min(1), len(adopted)),
    summary("1차 후보 11곳 전부", CM.min(1), 11),
])
cand_route, _ = tour(list(cand.geometry)) if len(cand) <= 11 else (np.nan, None)

pd.to_pickle(dict(zones=zones, cand=cand, PT=PT, ALT=ALT, REF=REF, HUB=HUB, CMP=CMP, hh=hh, own=own, near=near,
                  route_len=route_len, route_order=route_order, cand_route=cand_route, ALT_FUNNEL=ALT_FUNNEL), b("plan.pkl"))
pd.set_option("display.width", 250)
print(cand[["번호", "이름", "생활권", "역할", "생활권_평균보행_m", "생활권_300m안"]].round(3).to_string(index=False))
print(ALT[["id", "도로명", "등록도로폭_m", "도로등급", "보호시설까지_m", "교차로까지_m", "생활권_평균보행_m", "생활권_300m안", "가까운_건물주소", "생활권_통과지점수"]].round(2).to_string(index=False))
print(REF[["id", "도로명", "생활권_평균보행_m", "생활권_300m안"]].round(2).to_string(index=False))
print(HUB.drop(columns="geometry").round(3).to_string(index=False))
print(CMP.round(3).to_string(index=False))
print(f"수거 순회: 거점 {NC}곳 {route_len/1000:.2f}km / 후보 11곳 {cand_route/1000:.2f}km")
