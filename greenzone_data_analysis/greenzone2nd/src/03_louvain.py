"""3단계: Louvain으로 도로 생활권 나누기 → 생활권 수 = 거점 수

그래프
  점  = 세대 필지 (1단계)
  선  = 도로로 LINK_R(150m) 안에 있는 두 필지
  강도 = exp(-도로거리/DECAY) × √(세대i × 세대j)   ← 가까울수록, 양쪽 세대가 많을수록 강함
Louvain
  modularity Q = (생활권 안쪽 선 강도 합 − 무작위로 연결했을 때 기대값)을 '최대화'하도록 필지를 묶음
  → 안쪽은 촘촘하고 바깥과는 느슨한 묶음 = 걸어서 서로 오가는 생활권. 묶음 수는 미리 정하지 않음
  시작 순서에 따라 결과가 조금 달라서 SEEDS(20번) 중 Q가 가장 큰 결과를 씀
검증 (민감도)
  연결 반경 100~250m × γ 0.75/1.0/1.25 마다
  - 생활권 수, Q, 시드 간 일치도(ARI)
  - 생활권마다 '이상적 중심'(그 생활권 세대의 보행거리 합이 최소인 필지)에 거점을 둔다고 할 때 300m 안 세대 비율
출력: build/communities.csv (필지별 생활권), build/louvain_sens.csv, build/louvain_meta.json
"""
import numpy as np
import pandas as pd
from sklearn.metrics import adjusted_rand_score
from gzlib import *

hh = households()
W = hh["세대"].values.astype(float)
P = pd.read_csv(b("lot_pairs.csv"))
LL = np.load(b("lot_lot.npy"))


def graph(R):
    H = nx.Graph()
    H.add_nodes_from(range(len(hh)))
    s = P[P["d"] <= R]
    H.add_weighted_edges_from(zip(s["i"], s["j"], np.exp(-s["d"] / DECAY) * np.sqrt(W[s["i"]] * W[s["j"]])), weight="w")
    return H


def louvain(H, g):
    runs = []
    for s in SEEDS:
        c = nx.community.louvain_communities(H, weight="w", resolution=g, seed=s)
        q = nx.community.modularity(H, c, weight="w", resolution=g)
        runs.append((q, c, s))
    q, c, s = max(runs, key=lambda r: r[0])
    c = sorted(c, key=lambda m: -W[list(m)].sum())          # 세대 많은 순으로 1, 2, 3 …
    lab = np.zeros(len(hh), int)
    for k, m in enumerate(c):
        lab[list(m)] = k
    labs = []
    for _, cc, _ in runs:
        l = np.zeros(len(hh), int)
        for k, m in enumerate(cc):
            l[list(m)] = k
        labs.append(l)
    return lab, q, s, [len(r[1]) for r in runs], float(np.mean([adjusted_rand_score(lab, l) for l in labs]))


def ideal(lab):
    """생활권마다 세대 가중 보행거리 합이 최소인 필지(medoid) → 모든 세대의 가장 가까운 중심까지 거리"""
    d = np.full(len(hh), np.inf)
    for k in range(lab.max() + 1):
        m = np.where(lab == k)[0]
        j = m[np.argmin((LL[np.ix_(m, m)] * W[m][:, None]).sum(0))]
        d = np.minimum(d, LL[j])
    return d


rows = []
for R in SENS_R:
    H = graph(R)
    for g in SENS_G:
        lab, q, s, ns, ari = louvain(H, g)
        d = ideal(lab)
        rows.append(dict(연결반경_m=R, 감마=g, 생활권수=int(lab.max() + 1), 시드별_생활권수=f"{min(ns)}~{max(ns)}",
                         modularity=q, 시드간_일치도_ARI=ari, 연결덩어리수=nx.number_connected_components(H),
                         이상중심_평균보행_m=wavg(d, W), 이상중심_200m안=coverage(d, W, 200), 이상중심_300m안=coverage(d, W, 300)))
        print(f"R={R} γ={g}: 생활권 {lab.max()+1} (시드별 {min(ns)}~{max(ns)}), Q={q:.3f}, ARI={ari:.2f}, 이상중심 300m 안 {coverage(d, W, 300):.1%}")
SENS = pd.DataFrame(rows)
SENS.to_csv(b("louvain_sens.csv"), index=False)

H = graph(LINK_R)
lab, q, seed, ns, ari = louvain(H, GAMMA)
n = int(lab.max() + 1)
hh["생활권"] = lab + 1
hh[["key", "세대", "생활권"]].to_csv(b("communities.csv"), index=False)
inner = sum(d["w"] for u, v, d in H.edges(data=True) if lab[u] == lab[v]) / H.size(weight="w")
save_json(dict(생활권수=n, modularity=q, seed=seed, 시드별_생활권수=ns, ARI=ari, 연결_필지쌍=H.number_of_edges(),
               생활권안_연결강도_비율=inner, 연결반경=LINK_R, 감마=GAMMA, DECAY=DECAY,
               생활권별_세대=[int(W[lab == k].sum()) for k in range(n)], 생활권별_필지=[int((lab == k).sum()) for k in range(n)]),
          "louvain_meta.json")
print(f"\n▶ 본 분석 (반경 {LINK_R}m, γ={GAMMA}): 생활권 {n}곳, Q={q:.3f}, 연결 강도의 {inner:.0%}가 생활권 안쪽")
print("생활권별 세대:", [int(W[lab == k].sum()) for k in range(n)])
