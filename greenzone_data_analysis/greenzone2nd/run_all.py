"""그린존 2차 분석 전체 실행: 생활권(Louvain) = 거점

저장소 최상위 폴더에서 실행:  python run_all.py
필요한 데이터가 있는지 먼저 확인한 뒤 src/ 의 단계를 순서대로 실행한다. (약 6분)
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

REQUIRED = [
    "data/raw/pyojebu.xlsx",
    "data/raw/emap/11470/TL_SPRD_MANAGE.shp",
    "data/raw/emap/11470/TL_SPBD_BULD.shp",
    "data/team/greenzone1st.xlsx",
    "data/from_1st/greenzone1st_layer_boundary.geojson",
    "data/from_1st/greenzone1st_layer_protection_facilities.geojson",
]
STEPS = [
    "src/01_households.py",     # 표제부 → 세대 필지
    "src/02_walk_distance.py",  # 도로 보행거리 (필지↔필지, 필지↔1차 후보)
    "src/03_louvain.py",        # Louvain 생활권 + 민감도 → 생활권 수 = 거점 수
    "src/04_hubs.py",           # 생활권 ↔ 1차 후보 연결, 후보 없는 생활권 대안 지점
    "src/05_outputs.py",        # geojson · xlsx · csv · 지도
    "src/06_md.py",             # 설명 문서
]

missing = [p for p in REQUIRED if not os.path.exists(p)]
if missing:
    print("다음 데이터가 없습니다. data/README.md 를 보고 넣어 주세요.")
    for p in missing:
        print("  -", p)
    sys.exit(1)

for step in STEPS:
    print(f"\n▶ {step}")
    r = subprocess.run([sys.executable, os.path.basename(step)], cwd=os.path.join(ROOT, "src"))
    if r.returncode != 0:
        print(f"\n✖ {step} 에서 멈췄습니다.")
        sys.exit(r.returncode)
print("\n✔ 완료: outputs/greenzone2nd/ 를 확인하세요.")
