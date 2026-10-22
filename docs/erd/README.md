# 그린존 데이터 연결 ERD

## ERDCloud에 넣을 파일

`greenzone_logical_erd.sql`을 SQL 가져오기용으로 사용합니다. 테이블명·컬럼명은 영어, 설명은 한국어 COMMENT로 작성했습니다. 가져온 뒤 11개 엔터티와 14개 관계를 확인합니다. 한국어 주석/설명 표시를 켜고 필요한 배치를 조정하면 됩니다. 현재 결과는 SQL/관계 검증까지 완료했으며 ERDCloud 서비스에서의 실제 임포트는 미확인입니다.

사용자가 제공한 `greenzone-ai-snapshot.json`은 9개 엔터티의 FK가 모두 비어 있었습니다. 그 컬럼 구성을 바탕으로 PK/FK와 1:N 관계를 선언하고 규칙/문서별 수정 이력을 연결했습니다. 추측한 ERDCloud 전용 JSON 관계 문법을 추가하지 않고 표준 FK SQL을 제공합니다.

![그린존 논리 ERD](greenzone_logical_erd.svg)

## 실제 구현과 논리 설명의 차이

| 논리 엔터티 | 현재 실제 저장 위치 | 연결 키 |
|---|---|---|
| 관할·생활권·제안거점·주거필지 | 보유 GeoJSON, `main.py`의 메모리 자료 | 생활권·거점ID·팀key/PNU |
| 자료출처·품목·별칭 | `waste_catalog.json`, 규칙 payload | source_id·item_id·aliases |
| 품목규격·수수료 | SQLite `records`의 kind=rules | (kind, record_id), payload.rule_id/item_id |
| 배출근거문서 | SQLite `records`의 kind=documents | document_id, district_code, source_url |
| 규칙수정이력·문서수정이력 | 같은 SQLite `history`를 kind로 나눈 논리 표현 | (kind, record_id) → records |
| 초기 적재 상태 | SQLite `seeds` | name |

논리 모델의 `guide_documents.source_id`는 원문 URL에서 출처를 설명하기 위한 연결입니다. 현재 문서 payload에 별도 source_id FK가 저장된다는 뜻이 아닙니다. 논리 `scope_code`는 실제 `district_code`와 대응합니다.

**실제 DB는 records/history/seeds 3테이블이며 외래키가 선언돼 있지 않습니다.** `greenzone_current_sqlite.sql`은 현재 DB에서 읽은 실제 DDL입니다. 논리 ERD의 테이블·FK가 실제로 생성됐다고 발표하지 않습니다.

`greenzone_logical_erd.sql`은 설명·임포트 자료이며 운영 DB 마이그레이션이 아닙니다. 서비스 DB에 실행하지 않습니다. 현재 SQLite/GeoJSON 구조를 바꾸거나 새 회원·업로드·영상·벡터DB 테이블을 만들지 않았습니다.

## 연결에서 주의할 점

- 필지의 담당 거점과 생활권을 함께 맞추기 위해 `(hub_id, community_id)` 복합 참조를 선언했습니다.
- 규칙의 금액 출처와 이용 절차 출처는 각각 `source_id`, `guide_source_id`로 구분합니다.
- 문서 확인일과 시행일은 다르며 값이 없는 시행일을 임의 생성하지 않습니다.
- 관리자 수정 이력은 사용자 검색/사진 기록과 다릅니다. 사진은 저장하지 않고 Opik에는 품목 후보와 실행 상태만 기록합니다.
- RAG 문서 청크·검색 인덱스는 아직 미구현이므로 현재 DB 엔터티로 표시하지 않았습니다.

검증: 논리 관계 14개와 PK/FK 참조를 별도 메모리 DB에서 검사했습니다. 실제 서비스 DB는 읽기 전용으로 확인했으며 변경하지 않았습니다.
