# 그린존 2차 분석: 생활권 = 거점 (신월1동)

1차에서 고른 후보 11곳을 바탕으로 **그린존 거점을 몇 곳, 어디에 둘지** 정하는 분석 코드입니다.

1. 건축물대장 표제부로 세대가 어디에 몇 세대 사는지 정리 (아파트 제외)
2. **Louvain**으로 걸어서 묶이는 생활권을 나눔 → **생활권 수 = 거점 수**
3. 생활권 안에 1차 후보가 있으면 연결 (여러 곳이면 그 생활권 세대가 가장 덜 걷는 1곳)
4. 후보가 없는 생활권은 **대안 지점**(등록 도로폭 7m 이상 + 보호구역 200m 밖인 도로 위 지점)을 1~3순위로 제시 → 팀 실사

결과와 자세한 계산 로직은 [`outputs/greenzone2nd/greenzone2nd.md`](outputs/greenzone2nd/greenzone2nd.md)에 있습니다.

## 결과 요약

| | |
|---|---|
| 생활권 = 거점 | **9곳** (Louvain, 연결 반경 150m, γ 1) |
| 1차 후보로 정한 거점 | 6곳: 1, 3, 5, 6, 7, 10번 |
| 대안 지점 (실사) | 3곳: 생활권 4, 6, 7 |
| 보행 접근성 | 평균 173m · 300m 안 95% · 400m 안 100% |

## 실행 방법

```bash
pip install -r requirements.txt     # Python 3.10 이상
# data/README.md 를 보고 data/raw/ 에 원본 넣기
python run_all.py                   # 약 6분
```

중간 결과는 `build/`(git 제외), 최종 결과는 `outputs/greenzone2nd/`에 만들어집니다.

## 폴더 구조

```
greenzone2nd/
├─ run_all.py                 전체 실행 (데이터 확인 → 단계 순서대로)
├─ requirements.txt
├─ src/
│  ├─ gzlib.py                기준값 · 경로 · 도로 보행 그래프 (모든 단계가 사용)
│  ├─ 01_households.py        표제부 → 세대 필지 (세대수+가구수, 아파트 제외, 상가주택 포함)
│  ├─ 02_walk_distance.py     도로를 따라 걷는 거리 (필지↔필지, 필지↔1차 후보)
│  ├─ 03_louvain.py           Louvain 생활권 + 민감도 18가지 (반경 6 × γ 3)
│  ├─ 04_hubs.py              생활권 영역 · 1차 후보 연결 · 대안 지점 · 평가
│  ├─ 05_outputs.py           geojson · xlsx · csv · png · html
│  └─ 06_md.py                설명 문서 (숫자는 결과에서 자동으로 채움)
├─ data/
│  ├─ README.md               데이터 받는 곳
│  ├─ raw/                    원본 (git 제외)
│  ├─ team/greenzone1st.xlsx  1차 후보 11곳 (팀 엑셀)
│  └─ from_1st/               1차 결과물 중 동 경계 · 보호시설
└─ outputs/greenzone2nd/      최종 결과물
```

## 단계별로 하는 일

| 단계 | 입력 | 처리 | 출력 (build/) |
|---|---|---|---|
| 1 | 표제부, 전자지도 건물 | 세대 = 세대수+가구수 → 지번으로 건물 연결 → 신월1동 · 아파트 필지 제외 → 필지 단위 합산 | `households.geojson` (1,585필지 · 7,193세대) |
| 2 | 전자지도 도로구간 | 교차점마다 끊은 도로 그래프, 필지·후보를 도로에 수직 연결, 다익스트라 | `lot_pairs.csv`, `lot_lot.npy`, `cand_dist.csv` |
| 3 | 1·2단계 | 150m 안 필지끼리 연결(강도 = exp(−d/75)×√(세대×세대)) → Louvain 20회 중 modularity 최고 | `communities.csv`, `louvain_sens.csv` |
| 4 | 3단계 + 1차 후보 + 보호시설 | 필지 보로노이로 생활권 영역 → 후보 포함 여부 → 없으면 도로 10m 간격 지점 중 7m·200m 통과, 생활권 평균 보행 최소 | `plan.pkl` |

## 결과물 (outputs/greenzone2nd/)

| 파일 | 내용 |
|---|---|
| `greenzone2nd.geojson` | 거점 9곳 (WGS84). 웹 지도 메인 레이어 |
| `greenzone2nd_layer_zones.geojson` | 생활권 9곳 영역 (세대·필지·거점) |
| `greenzone2nd_layer_candidates.geojson` | 1차 후보 11곳 + 생활권 · 역할(거점/예비) |
| `greenzone2nd_layer_alternatives.geojson` | 대안 지점 1~3순위(`용도`=대안) + 생활권 최적 도로 지점(`용도`=참고) |
| `greenzone2nd_layer_households.geojson` | 세대 필지 점 |
| `greenzone2nd.xlsx` / `.csv` | 표 (엑셀: 요약 · 거점 · 1차 후보 연결 · 대안 지점 · 안 비교 · 민감도 · 세대 정제 · 가정) |
| `greenzone2nd_map.html` / `.png` | 지도 (html은 인터넷 필요) |
| `greenzone2nd_sensitivity.png` | 설정별 생활권 수 |
| `greenzone2nd.md` | 계산 로직과 근거 (발표용) |

## 기준값 바꾸기

`src/gzlib.py` 맨 위에서 바꾸고 `python run_all.py`를 다시 실행하면 md까지 다시 만들어집니다.

| 값 | 현재 | 의미 |
|---|---|---|
| `LINK_R` | 150m | 이 도로거리 안의 필지끼리 연결 (생활권 크기) |
| `DECAY` | 75m | 연결 강도가 줄어드는 거리 |
| `GAMMA` | 1.0 | Louvain 해상도 (표준값) |
| `ROAD_MIN` | 7m | 대안 지점 등록 도로폭 |
| `PROTECT_R` | 200m | 대안 지점 보호구역 반경 |
| `ALT_SPACING` | 60m | 대안 1~3순위끼리 최소 간격 |

## 데이터 출처

건축물대장 표제부(국토교통부 건축데이터 개방) · 행정안전부 도로명주소 전자지도(양천구) · 1차 분석 결과(행정동 경계 vuski/admdongkor, 공공데이터포털 어린이·노인장애인보호구역 표준데이터)
