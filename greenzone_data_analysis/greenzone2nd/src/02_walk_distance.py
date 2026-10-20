"""2단계: 도로를 따라 걷는 거리 계산

- 도로망: 도로명주소 전자지도 도로구간(TL_SPRD_MANAGE) 중심선, 신월1동 경계 + 500m 범위
- 필지·후보는 가장 가까운 도로에 수직으로 붙여서 계산 (직선거리가 아니라 실제 골목을 따라 걷는 거리)
출력
  build/road_net.pkl        도로 그래프
  build/lot_pairs.csv       도로거리 250m(민감도 최대 반경) 안의 필지 쌍 (생활권 그래프의 선 후보)
  build/cand_dist.csv       필지 × 1차 후보 11곳 보행거리
  build/lot_lot.npy         필지 × 필지 보행거리 (생활권 중심 계산·민감도 검증용)
"""
import pickle
import numpy as np
import pandas as pd
from gzlib import *

D = dong()
rd = read_emap("TL_SPRD_MANAGE")
rd = rd[rd.intersects(D.buffer(500))]
net = RoadNet(rd)
print(f"도로 그래프: 교차점 {net.G.number_of_nodes():,}개, 도로 조각 {net.G.number_of_edges():,}개")
with open(b("road_net.pkl"), "wb") as f:
    pickle.dump(net, f)

hh = households()
sn = [net.snap(p) for p in hh.geometry]
print(f"필지 → 도로 수직거리 중앙값 {np.median([s['off'] for s in sn]):.1f}m")

# 필지 쌍: 한 필지에서 다익스트라 1번 → 200m 안의 다른 필지
R = max(SENS_R)
at = {}
for j, s in enumerate(sn):
    for n, o in s["ends"]:
        at.setdefault(n, []).append((j, o))
rows = {}
for i, s in enumerate(sn):
    d = net.node_dist(s, R)
    for n, x in d.items():
        for j, o in at.get(n, []):
            if j > i and x + o <= R:
                rows[(i, j)] = min(rows.get((i, j), np.inf), x + o)
    for j in range(i + 1, len(sn)):                      # 같은 도로 조각 위의 필지
        if sn[j]["seg"] == s["seg"]:
            v = abs(sn[j]["t"] - s["t"]) + sn[j]["off"] + s["off"]
            if v <= R:
                rows[(i, j)] = min(rows.get((i, j), np.inf), v)
pairs = pd.DataFrame([(i, j, d) for (i, j), d in rows.items()], columns=["i", "j", "d"])
pairs.to_csv(b("lot_pairs.csv"), index=False)
print(f"도로거리 {R}m 안 필지 쌍 {len(pairs):,}개")

cand = candidates()
M = np.column_stack([net.dist_to_many(p, sn) for p in cand.geometry])
pd.DataFrame(M, columns=cand["id"]).assign(key=hh["key"].values).to_csv(b("cand_dist.csv"), index=False)
print("필지 → 가장 가까운 1차 후보 보행거리 (25/50/75/90%):", np.percentile(M.min(1), [25, 50, 75, 90]).round().tolist())

LL = np.array([net.dist_to_many(s, sn) for s in sn])
np.save(b("lot_lot.npy"), LL)
print(f"필지 × 필지 보행거리 {LL.shape[0]:,} × {LL.shape[1]:,}")
