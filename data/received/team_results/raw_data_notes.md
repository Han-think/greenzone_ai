# 데이터 준비

원본 공공데이터는 용량과 이용조건 때문에 저장소에 올리지 않습니다. 아래 파일을 내려받아 **이 이름 그대로** `data/raw/`에 넣어 주세요.

```
data/
├─ raw/                                  ← 직접 내려받아 넣기 (git에 올리지 않음)
│  ├─ HangJeongDong_ver20260701.geojson
│  ├─ child.csv
│  ├─ elder.csv
│  ├─ park.csv
│  ├─ parking.csv
│  └─ emap/11470/                        ← 도로명주소 전자지도 양천구 (SHP 묶음)
│     ├─ TL_SPRD_MANAGE.shp/.shx/.dbf    (도로구간, ROAD_BT = 도로폭)
│     ├─ TL_SPRD_RW.shp/.shx/.dbf        (실폭도로)
│     └─ TL_SPBD_BULD.shp/.shx/.dbf      (건물)
└─ team/                                 ← git에 포함
   ├─ greenzone_1st.xlsx                 ← 팀이 정리한 1차 후보군 (최종 원본)
   └─ manual_edits.csv                   ← 코드 결과에서 팀이 손본 칸 기록 (id, 열, 코드값, 수정값, 사유)
```

| 저장할 이름 | 데이터 | 받는 곳 | 비고 |
|---|---|---|---|
| `HangJeongDong_ver20260701.geojson` | 행정동 경계 | GitHub `vuski/admdongkor` → `ver20260701` 폴더 | 전국 파일 그대로 |
| `child.csv` | 전국어린이보호구역표준데이터 | 공공데이터포털(data.go.kr) | CSV, 전국 파일 그대로 |
| `elder.csv` | 전국노인장애인보호구역표준데이터 | 공공데이터포털 | 양천구만 있어도 됨 |
| `park.csv` | 전국도시공원정보표준데이터 | 공공데이터포털 | CSV, 전국 파일 그대로 |
| `parking.csv` | 전국주차장정보표준데이터 | 공공데이터포털 | CSV, 전국 파일 그대로 |
| `emap/11470/` | 도로명주소 전자지도 (서울 양천구) | 주소기반산업지원서비스(business.juso.go.kr) → 도로명주소 전자지도 신청 | **승인 필요**. 압축을 풀면 `11470` 폴더가 나옴 |

- CSV 인코딩은 cp949(공공데이터포털 기본)와 UTF-8 모두 자동으로 읽습니다.
- 전자지도 좌표계는 UTM-K(EPSG:5179)이며 코드에서 자동 변환합니다.
