# 데이터 준비

```
data/
├─ raw/                                    ← 직접 넣기 (git에 올리지 않음)
│  ├─ pyojebu.xlsx                         건축물대장 표제부 (양천구 신월동)
│  └─ emap/11470/                          도로명주소 전자지도 양천구
│     ├─ TL_SPRD_MANAGE.shp/.shx/.dbf      도로구간 (보행 그래프, 등록 도로폭 ROAD_BT)
│     └─ TL_SPBD_BULD.shp/.shx/.dbf        건물 (표제부를 지번으로 연결)
├─ team/                                   ← git에 포함
│  └─ greenzone1st.xlsx                    팀이 정리한 1차 후보 11곳 (첫 시트, 위도·경도 열 사용)
└─ from_1st/                               ← git에 포함 (1차 분석 결과물에서 복사)
   ├─ greenzone1st_layer_boundary.geojson             신월1동 경계
   └─ greenzone1st_layer_protection_facilities.geojson 보호구역 대상시설 (반경 200m 판정)
```

| 저장할 이름 | 데이터 | 받는 곳 | 비고 |
|---|---|---|---|
| `raw/pyojebu.xlsx` | 건축물대장 표제부 | 건축데이터 민간개방 시스템(open.eais.go.kr) 또는 세움터 → 양천구 신월동 표제부 내려받기 | 원본 파일명 `03. 표제부_….xlsx`를 이 이름으로 바꿔 저장 |
| `raw/emap/11470/` | 도로명주소 전자지도 (서울 양천구) | 주소기반산업지원서비스(business.juso.go.kr) → 도로명주소 전자지도 신청 | **승인 필요, 재배포 금지**. 1차 분석과 같은 파일 |
| `team/greenzone1st.xlsx` | 1차 후보 11곳 | 팀 1차 작업 결과 | 판정 '합격'인 행만 사용 |
| `from_1st/*.geojson` | 동 경계·보호시설 | 1차 저장소 `outputs/greenzone1st/` | 1차 결과를 바꾸면 여기도 다시 복사 |

- 표제부 사용 열: `대지구분코드, 번, 지, 주용도코드명, 기타용도, 세대수(세대), 가구수(가구), 사용승인일`
- 전자지도 좌표계 UTM-K(EPSG:5179)는 코드에서 자동 변환합니다.
