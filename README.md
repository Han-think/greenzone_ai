# GreenZone · 신월1동

**신월1동의 건물을 검색하면 팀이 분석한 담당 생활권과 그린존 거점안을 지도에서 확인하는 웹입니다.** 모든 위치는 운영 승인 전 분석 제안입니다.

## 현재 구현과 데이터

| 구분 | 내용 |
|---|---|
| 현재 데이터 | 주거 1,585필지 · 등록 주거단위 7,193 · 생활권 9개 · 거점안 9곳 |
| 건물 검색 | 보유 도로명주소·지번·건물명 검색 → 10개씩 더보기 → 선택 → 담당 생활권·거점 표시 |
| 지도 | 검색/후보지 탭 분리, 카카오 일반 지도, 생활권 선택, 후보·필지·대안 표시 체크 |
| 분석 설명 | 받은 엑셀의 보행거리 비교, 후보 도로폭·보호시설 이격, 출처 다운로드 |
| 배출량 | 2024 결합권역 공식값과 과거 조건부 추정을 구분해 참고 표시 |

**9곳 = 기존 1차 후보 6곳 + 새 대안 3곳**입니다. 11곳을 도로폭으로 걸러 9곳이 남았다는 뜻은 아닙니다.
7,193은 건축물대장 기반 등록 주거단위이며 실제 거주 인구나 관측 배출량이 아닙니다.

## 실행

아래 명령은 프로젝트 폴더에서 실행합니다. 처음 받은 팀원은 가상환경과 `.env`를 준비합니다.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

1. [Kakao Developers](https://developers.kakao.com/)에서 앱의 **JavaScript 키**를 확인합니다.
2. 카카오맵 사용 설정을 확인하고, 허용 웹 도메인에 `http://localhost:8003`을 등록합니다.
3. `.env`의 `KAKAO_JAVASCRIPT_KEY=` 뒤에 키를 입력합니다. Java 키·REST API 키를 넣는 칸이 아닙니다.
4. 아래 명령으로 서버를 켜고 [http://localhost:8003/](http://localhost:8003/)을 엽니다.

```powershell
.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8003 --no-access-log
```

Docker·Ollama는 현재 D 작업본 실행에 필요하지 않습니다. 지도는 카카오 SDK, 검색은 보유 데이터에서 처리합니다.
필수 패키지는 기존 `fastapi`, `uvicorn`, `python-dotenv`, `jinja2`이며 분석 결과를 읽는 데 추가 분석 패키지는 사용하지 않습니다.
`.env`는 각자 작성하고 공유·커밋하지 않습니다. 데이터 파일을 교체했다면 서버를 다시 시작합니다.
`.gitattributes`는 data 파일의 줄바꿈 변환을 막아 팀원 PC에서도 원본 SHA256이 유지되게 합니다.

## 읽는 순서

```text
templates/index.html → static/script.js → main.py → data/ → static/map.js
```

- [핸드북](docs/HANDBOOK.md): 코드 연결·API·데이터 출처·분석 해석·팀 코드 반영 순서
- [데이터 안내](data/README.md): 현재/과거 자료 구분과 정식 보존 경로
- `data/data_inventory.csv`: 파일별 출처·기준시점·SHA256·사용 상태

## 팀 코드 반영 상태 — 2026-10-20 검토

저장소는 [Han-think/greenzone_ai](https://github.com/Han-think/greenzone_ai)입니다.
원격 master 확인본은 [c1fa036](https://github.com/Han-think/greenzone_ai/commit/c1fa03649a2671b6752deb71a27f17da8db241e1), 분석 결과 출처는 [930e1b2](https://github.com/Han-think/greenzone_ai/tree/930e1b2d291c888cee84ae284b6d830e3d4b322e/greenzone_data_analysis/greenzone2nd)입니다.

- **이 브랜치는 `integration/greenzone-review` 통합 검토본입니다.** 작업 시작 기준 `eeefe32`에서 데이터를 연결한 뒤, 확인한 팀 master `c1fa036`의 변경을 이 브랜치에 통합했습니다. [검토 브랜치](https://github.com/Han-think/greenzone_ai/tree/integration/greenzone-review)에서 데이터·웹·문서 및 후속 통합 커밋을 확인합니다. 팀 master 자체에는 반영하지 않았습니다.
- 팀의 **검색/후보지 탭 분리와 결과 더보기**를 보유 데이터 검색에 맞춰 통합했습니다. 같은 화면에서 탭을 전환하고, 결과를 10개씩 추가로 불러옵니다. 탭을 바꿔도 검색 결과와 표시 체크는 유지됩니다.
- 팀 원본은 VWorld·외부 주소 API, 이 통합본은 카카오·보유 데이터 검색을 사용합니다. 팀 탭의 HTML ID와 페이지 추가 방식을 유지하고 검색 데이터 공급 부분을 FastAPI로 연결했습니다. 외부 주소 API를 추가한 것은 아닙니다.
- 공통 GeoJSON 4개는 최신 master와 내용이 같습니다. 원본 분석 결과·코드 ZIP·과거 배출량은 `data/`의 정해 둔 경로에 보존했습니다.

데이터와 팀 탭/더보기를 연결한 검토본입니다. 기능별 연결과 master 반영 절차는 핸드북 8절에 있습니다.

## 현재 범위의 한계

화면의 체크는 표시 필터이며 분석을 재실행하지 않습니다. 개별 집의 실제 보행거리·수거차 운행·위성보기·LLM/RAG는 현재 구현 범위에 포함하지 않았습니다.
도로 분석 결과는 있으나 원본 SHP·표제부·중간 거리행렬을 모두 받아 재현한 상태는 아닙니다. 현장 유효폭·정차·보행 안전·부지 사용 동의는 별도 확인이 필요합니다.
이전 6,853 비교 그림은 `data/received/archive/`, 현재 웹은 7,193·9생활권 결과를 사용합니다.
