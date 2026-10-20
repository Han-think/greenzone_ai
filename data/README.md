# Data guide

현재 웹 기준은 **2차 1,585필지·7,193 등록 주거단위·9생활권·거점안 9곳**입니다.
팀 master `e5c71da`와 분석 브랜치 `930e1b2`(2026-10-20 확인)를 사용합니다. 과거 비교 수치는 현재 결과와 합산하지 않습니다.

| 위치 | 구분·역할 |
|---|---|
| greenzone2nd.geojson / greenzone2nd_layer_zones.geojson | 현재 지도 거점·생활권. 팀 master와 같은 원본 |
| greenzone1st.geojson / greenzone1st_layer_boundary.geojson | 1차 후보 11곳과 동 경계 원본 |
| received/team_second_stage/ | 현재 2차 필지·후보 역할·대안·표·보고서·그림 원본. source_manifest.json에 출처 커밋·SHA256·도로 판정 기록 |
| received/team_results/ | 1차 후보·보호시설·공터·도로 162구간. first_stage.xlsx / first_stage_map.png / first_stage_map.html / analysis_report.md로 직접 열람 |
| received/archive/first_stage_source.zip | 받은 1차 코드·입력표·출력 전체의 원본 보관. 현재 웹에서 실행하지 않음 |
| received/archive/tradeoff_6853.png | 이전 6,853 주거단위 후보 조합 비교. 현재 7,193·9생활권 안과 다른 버전 |
| received/archive/source_delivery_manifest.json | 임시 폴더의 5개 원본 파일 → 정식 보존 경로·크기·SHA256 대응표 |
| received/sinwol1_demand.json / processed/sinwol1_address_supplement.json | 기존 필지·주소와 건물명 보완. 원본 해시·지번 확인 후 현재 필지와 연결 |
| processed/team_second_stage_summary.json | 현재 결과 엑셀의 비교 수치·셀 위치·원본 해시를 기록한 화면용 요약 |
| raw/ / analysis/ | 보유 API 응답·공식 자료·과거 배출량·추정·분모·출처 검토 원본 |
| data_inventory.csv | 파일별 출처·기준시점·SHA256·연결 상태. 목록 자체는 제외 |

## 도로 자료와 재현 범위

- 도로 분석은 있습니다. 1차 roads.geojson 162구간에는 도로명·등록폭·폭등급이 있고, 2차 코드는 도로망 거리와 새 대안의 등록폭 7m 필터를 사용합니다.
- G01의 등록폭 8m와 도로 도형 단면 추정 5.3m는 다른 측정값입니다. 1차 코드 REGISTERED_OK=True는 등록폭 7m 이상을 우선 통과시킵니다. 표 오류로 단정하지 않으며 현장 유효폭·정차·부지 동의는 확인이 필요합니다.
- 1차 도로 내보내기 범위는 동 경계 +150m, 2차 도로망 입력 범위는 +500m입니다. 이 162구간만으로 2차 분석 전체가 재현되는 것은 아닙니다.
- 아직 미수신인 것은 팀 원본 표제부·도로/건물 SHP와 중간 거리행렬입니다. 원본 ZIP 안에도 해당 SHP는 없습니다. 받은 코드를 실행하거나 전체 분석을 재현하지 않았습니다.

## 수치 사용 기준

- 9곳 = 기존 후보 6곳 + 새 대안 3곳입니다. 11곳을 도로폭으로 걸러 9곳이 남았다는 뜻은 아닙니다.
- 7,193은 팀 코드의 등록 주거단위입니다. 실거주 인구·관측 배출량이 아닙니다. 이전 6,853의 행별 증감과 정확한 분석 기준일은 이전 원자료가 없어 미확인입니다.
- 과거 1,665 대상 필지·7,145 대리수요도 현재 1,585필지·7,193과 다른 모집단입니다.
- 배출량은 2024 신월1·2·3·5동 결합권역 공식값과 과거 비아파트 조건부 추정을 구분합니다. 7,193으로 자동 재배분하지 않습니다. 음식물·재활용·월별 자료도 raw/analysis에 보존합니다.

service_input / downloadable_evidence는 현재 코드 연결, reference_archive는 근거 보관, metadata는 목록·설명입니다.
임시 `새 폴더` 경로는 웹 입력으로 사용하지 않습니다. 원본 5개는 대응표의 정식 경로에 보존했습니다.
코드·기준일·후속 작업은 [핸드북](../docs/HANDBOOK.md)을 참고합니다.
