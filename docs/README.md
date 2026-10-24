# 팀 프로젝트 문서 찾기

## 먼저 볼 것

| 목적 | 위치 |
|---|---|
| 서비스 소개·실행 | [프로젝트 README](../README.md) |
| 코드·데이터 연결 | [현재 핸드북](HANDBOOK.md) |
| 구현 상태·한계 | [현황](status/README.md) · [항목별 CSV](status/requirements_status.csv) |
| 최신 요구사항·데이터 요약 | [팀 공유 스프레드시트](https://docs.google.com/spreadsheets/d/1jniX2VIZEHT6b-kxVVr1DjALQDqqx15m6vCg2LkKJUw/edit) |
| 데이터 원본·출처 | [데이터 안내](../data/README.md) · [파일별 명세](../data/DATA_SPECIFICATION.csv) |
| 발표 최신본 | [2026-10-24 PPT](presentation/greenzone_presentation_20261024.pptx) |
| 발표 교체 그림 | [P11 SVG](presentation/assets/P11_data_spec_original_style.svg) · [P14 SVG](presentation/assets/P14_requirements_original_style.svg) |
| RAG·사진 평가 | [RAG 평가](evaluation/rag_quality.md) · 사진 비교는 `data/vision/evaluation_20261022/` |
| ERD | [논리 설계와 실제 SQLite](erd/README.md) |
| 공개 전 점검 | [점검 기록](review/publication_review.md) |

## 폴더 기준

- `status/`: 현재 구현 현황. 완료 건수를 전체 개발률로 쓰지 않습니다.
- `evaluation/`: 실제 평가 결과와 검토 기록. 실행 로그와 정확도 판정은 구분합니다.
- `presentation/`: 위 PPT가 이번에 받은 최신본입니다. SVG는 `assets/`, 상세 그림은 `assets/reference/`에 둡니다.
- `screenshots/`: 서비스 README에서 사용하는 화면 캡처입니다. 발표용 SVG와 구분합니다.
- `archive/`: 지난 계획·긴 누적 문서·초기 엑셀의 [압축 보관본](archive/history_20261024.zip). 현재 구현으로 읽지 않습니다.

공유 시트의 D번호와 로컬 파일 명세의 D번호는 작성 체계가 다릅니다. 파일명·데이터명으로 대조합니다.
코드와 실행 데이터 경로는 이번 정리에서 변경하지 않았습니다. 정리 이력은 `archive/organization_20261024.json`에 남겼습니다.
