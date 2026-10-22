# Data guide

현재 웹 기준은 **2차 1,585필지·7,193 등록 주거단위·9생활권·거점안 9곳**입니다.
공통 GeoJSON은 팀의 `e5c71da`에 추가된 원본이며, 웹 통합 기준 `da1cc70`과도 같습니다. 2차 상세 출처는 분석 브랜치 `930e1b2`입니다. 현재 master에서 함께 사용하며 과거 비교 수치는 합산하지 않습니다.

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
| processed/route_graph.json | 도로 162구간을 교차점에서 나눈 별도 경로용 점·연결 목록. 전체/등록폭 7m 이상, 도로·거점 입력 해시 포함 |
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

## 경로용 가공 자료

`route_graph.json`만 새로 가공했습니다. 받은 도로·거점 GeoJSON은 그대로 보존합니다. `scripts/prepare_route_graph.py`를 프로젝트 폴더에서 실행하면 같은 두 입력으로 다시 준비할 수 있습니다(추가 패키지 없음).

도형이 만나는 지점을 연결하고, 선택 도로에 거점을 투영합니다. 도로에서 40m 넘게 떨어진 거점은 자동 연결하지 않습니다. 근거리 미터 환산을 쓴 근사 도로 길이이며 실제 진입로·입체교차·일방통행은 검증하지 않았습니다. 1차 내보낸 도로 범위가 제한되어 있으므로 팀 2차의 전체 도로망 계산과 구분합니다.


## 배출 안내 초기 자료

`knowledge/`에 C 프리뷰의 `waste_catalog.json`(91품목/163별칭/268규칙), `knowledge_documents.json`(19개 안내 요약), `waste_schema.sql` 참고본을 원본 그대로 복사했습니다. `source_manifest.json`에 공식 URL·기존 확인일·복사 SHA256·검토 대기 항목을 기록했습니다.

2026-10-18 확인 스냅샷입니다. 새 배출 안내/관리자 화면의 첫 조회 때 `local/service.sqlite3`로 적재하도록 연결했습니다. 강서구 문서는 원본 보존만 하고 서비스 적재에서는 제외합니다. 초기 안내 요약은 검토 대기로 두며 금액은 참고값으로 표시합니다. 현재 코드 반영 상태는 [핸드북 14절](../docs/HANDBOOK.md#14-사진배출-안내관리자와-법령-자료)을 우선합니다.


`knowledge/legal_documents.json`은 공식 법령 선택 발췌 4건과 최신 배출 절차 요약 1건입니다. 취득 원문/별표 첨부는 `knowledge/official_pages/`에 파일·URL·해시와 함께 보존합니다. 별표 상세 대조와 신월1동 상세 요일은 추가 확인이 필요합니다.


## 가구 이미지 연결 준비

`vision/`에는 이미지 원본 대신 사진/라벨 상대 경로 목록, 품목 매핑 검토 후보, 모델 결과 형식 초안과 인계 상태만 둡니다. 초기 목록·매핑 초안은 참고 자료입니다. 현재 웹은 Gemini가 공식 품목 ID를 직접 제안하고 사용자가 최종 선택하므로 이 매핑 초안을 사용하지 않습니다. 확대 비교·출처·Opik 근거는 evaluation_20261022/에 보존합니다. 원본 사진은 프로젝트 밖에 유지합니다. [핸드북 15절](../docs/HANDBOOK.md#15-가구-이미지-분석-인계와-발표-준비)에 인계 기준과 발표 구성이 있습니다.
