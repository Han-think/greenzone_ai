"""2차 분석 공통 설정과 도구 (모든 단계가 import)

- 기준값은 모두 이 파일 맨 위에 모아 둠. 숫자를 바꾸고 run_all.py를 다시 실행하면 됨
- 좌표계: 분석은 EPSG:5186(미터), 웹·결과 파일은 EPSG:4326(위경도)
"""
import os
import json
import pickle
import numpy as np
import pandas as pd
import geopandas as gpd
import networkx as nx
from shapely.geometry import LineString
from shapely.ops import unary_union
from shapely.strtree import STRtree

# ---- 기준값 ---------------------------------------------------------------------------------
CRS_M = 5186                 # 분석 좌표계 (미터)
CRS_EMAP = 5179              # 도로명주소 전자지도 원본 좌표계 (UTM-K)

# 생활권 나누기 (Louvain)
LINK_R = 150                 # 도로로 이 거리 안의 세대 필지끼리 연결 (m)
DECAY = 75                   # 연결 강도 = exp(-거리/DECAY) × √(세대i × 세대j)
GAMMA = 1.0                  # Louvain 해상도(γ). 1.0 = 표준 modularity
SEEDS = range(20)            # Louvain은 시작점에 따라 결과가 조금 달라 → 20번 돌려 modularity 최고 결과 사용
SENS_R = (100, 125, 150, 175, 200, 250)
SENS_G = (0.75, 1.0, 1.25)

# 대안 지점 (후보가 없는 생활권)
ROAD_MIN = 7.0               # 등록 도로폭 (m) 이상
PROTECT_R = 200              # 보호구역 대상시설 반경 (m) 밖
STEP = 10                    # 도로를 이 간격(m)으로 훑음
ALT_SPACING = 60             # 대안 1·2·3순위끼리 최소 간격 (m) → 실사 때 서로 다른 장소를 보도록
ALT_TOP = 3

# 평가
COVER_D = (200, 300, 400)    # 보행 접근성 기준 (1차 엑셀 기준 4)
DIST_CUTOFF = 1500           # 이보다 먼 보행거리는 계산하지 않음 (m)

# ---- 경로 -------------------------------------------------------------------------------------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
TEAM_XLSX = os.path.join(ROOT, "data", "team", "greenzone1st.xlsx")
BOUNDARY = os.path.join(ROOT, "data", "from_1st", "greenzone1st_layer_boundary.geojson")
PROTECT = os.path.join(ROOT, "data", "from_1st", "greenzone1st_layer_protection_facilities.geojson")
BUILD = os.path.join(ROOT, "build")
OUT = os.path.join(ROOT, "outputs", "greenzone2nd")
os.makedirs(BUILD, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def b(name):
    return os.path.join(BUILD, name)


def save_json(obj, name):
    with open(b(name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, default=float)


def load_json(name):
    with open(b(name), encoding="utf-8") as f:
        return json.load(f)


def dong():
    return gpd.read_file(BOUNDARY).to_crs(CRS_M).geometry.iloc[0]


def candidates():
    """팀 1차 후보 11곳 (팀 엑셀 첫 시트, 위도·경도 열)"""
    t = pd.read_excel(TEAM_XLSX, sheet_name=0)
    t = t[t["판정"].astype(str).str.strip() == "합격"].copy()
    g = gpd.GeoDataFrame(t, geometry=gpd.points_from_xy(t["경도"], t["위도"]), crs=4326).to_crs(CRS_M)
    return g.reset_index(drop=True)


def read_emap(layer):
    g = gpd.read_file(os.path.join(RAW, "emap", "11470", f"{layer}.shp"), encoding="cp949")
    return g.set_crs(CRS_EMAP, allow_override=True).to_crs(CRS_M)


# ---- 도로망 그래프 -----------------------------------------------------------------------------
class RoadNet:
    """도로구간 중심선을 교차점마다 끊어 만든 보행 그래프.
    점(필지·거점)은 가장 가까운 도로 조각에 수직으로 붙이고, 조각 양 끝 노드까지의 거리를 더해 계산한다."""

    def __init__(self, roads):
        noded = unary_union(list(roads.geometry))
        self.segs = []
        for ln in getattr(noded, "geoms", [noded]):
            cs = list(ln.coords)
            self.segs += [LineString([cs[i], cs[i + 1]]) for i in range(len(cs) - 1) if cs[i] != cs[i + 1]]
        self.G = nx.Graph()
        for s in self.segs:
            self.G.add_edge(self.k(s.coords[0]), self.k(s.coords[1]), w=s.length)
        self.tree = STRtree(self.segs)

    def __getstate__(self):
        return dict(segs=self.segs, G=self.G)

    def __setstate__(self, s):
        self.segs, self.G = s["segs"], s["G"]
        self.tree = STRtree(self.segs)

    @staticmethod
    def k(c):
        return (round(c[0], 1), round(c[1], 1))

    def snap(self, p):
        i = self.tree.nearest(p)
        s = self.segs[i]
        t, a = s.project(p), s.distance(p)
        return dict(seg=i, t=t, off=a, ends=[(self.k(s.coords[0]), a + t), (self.k(s.coords[1]), a + s.length - t)])

    def node_dist(self, sn, cutoff=DIST_CUTOFF):
        d = {}
        for n, o in sn["ends"]:
            for m, x in nx.single_source_dijkstra_path_length(self.G, n, cutoff=cutoff, weight="w").items():
                if x + o < d.get(m, np.inf):
                    d[m] = x + o
        return d

    def dist_to_many(self, src, targets, cutoff=DIST_CUTOFF):
        """src(점) → targets(snap 목록) 보행거리 배열. 같은 도로 조각 위면 조각을 따라 직접 거리"""
        s = self.snap(src) if not isinstance(src, dict) else src
        d = self.node_dist(s, cutoff)
        out = np.empty(len(targets))
        for i, t in enumerate(targets):
            v = min(d.get(n, np.inf) + o for n, o in t["ends"])
            if t["seg"] == s["seg"]:
                v = min(v, abs(t["t"] - s["t"]) + t["off"] + s["off"])
            out[i] = v
        return out


def load_net():
    with open(b("road_net.pkl"), "rb") as f:
        return pickle.load(f)


def households():
    return gpd.read_file(b("households.geojson")).to_crs(CRS_M)


def wavg(d, w):
    return float(np.average(d, weights=w))


def coverage(d, w, D):
    return float(w[d <= D].sum() / w.sum())


def wpct(d, w, q):
    """세대 가중 백분위 (q=90 → 세대의 90%가 이 거리 안)"""
    o = np.argsort(d)
    c = np.cumsum(w[o]) / w.sum()
    return float(d[o][np.searchsorted(c, q / 100)])
