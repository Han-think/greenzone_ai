"""팀 결과 읽기 → 지번으로 건물 연결 → 검색·지도에 전달."""
import csv
import hashlib
import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from route_planner import load_route_data, plan_route
from folium_report import build_folium_report, ZONE_COLORS
from service_routes import router as service_router, require_admin

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
DATA = ROOT / 'data'
TEAM = DATA / 'received' / 'team_second_stage'
# app은 웹 요청을 받을 FastAPI 객체다. 아래 @app.get이 이 객체에 URL을 등록한다.
app = FastAPI()
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
templates = Jinja2Templates(directory=ROOT / 'templates')
# 기존 지도 앱에 사진·배출 안내·관리자 URL을 추가한다. 같은 데이터 폴더를 사용한다.
app.include_router(service_router)


# @app.middleware는 요청과 응답 사이에 공통 처리를 넣는다.
@app.middleware('http')
async def protect_service_cache(request: Request, call_next):
    # 관리자 정보와 수정된 수수료가 브라우저 캐시에 남지 않게 한다.
    path = request.url.path
    protected = path.startswith('/analysis') or path == '/api/route' or (path == '/' and request.query_params.get('view') == 'route')
    if protected:
        try:
            require_admin(request)
        except HTTPException:
            if path.startswith('/api/'):
                from fastapi.responses import JSONResponse
                return JSONResponse({'detail': '관리자 로그인이 필요합니다.'}, status_code=401)
            return RedirectResponse('/admin', status_code=303, headers={'Cache-Control': 'no-store'})
    response = await call_next(request)
    if request.url.path.startswith(('/admin', '/analysis', '/api/route', '/disposal', '/api/admin', '/api/disposal', '/api/vision')):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'same-origin'
    return response


def read_json(path):
    # JSON 파일 하나를 Python 딕셔너리/리스트로 읽어 돌려준다.
    with open(path, encoding='utf-8-sig') as file:
        return json.load(file)


def read_csv(name):
    # 분석 CSV의 각 행을 딕셔너리로 읽는다. 배출량 출처 파일에 사용한다.
    with open(DATA / 'analysis' / name, encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


def lot_address(pnu):
    # 지번 식별자(PNU)의 본번·부번으로 사람이 읽을 지번 주소를 만든다.
    address = '신월동 '
    if pnu[10] == '2':
        address += '산 '
    address += str(int(pnu[11:15]))
    if int(pnu[15:19]) > 0:
        address += '-' + str(int(pnu[15:19]))
    return address


# 1. 받은 파일을 읽는다. 팀의 분석을 웹 접속 때 다시 돌리지 않는다.
summary = read_json(DATA / 'processed' / 'team_second_stage_summary.json')
hubs = read_json(DATA / 'greenzone2nd.geojson')
zones = read_json(DATA / 'greenzone2nd_layer_zones.geojson')
households = read_json(TEAM / 'greenzone2nd_layer_households.geojson')
candidates = read_json(TEAM / 'greenzone2nd_layer_candidates.geojson')
alternatives = read_json(TEAM / 'greenzone2nd_layer_alternatives.geojson')
boundary = read_json(DATA / 'greenzone1st_layer_boundary.geojson')
# 필터는 팀 도로·보호시설 반경 도형을 그대로 표시한다. 새 안전 판정이 아니다.
roads = read_json(DATA / 'received/team_results/roads.geojson')
protection = read_json(DATA / 'received/team_results/protection_zones.geojson')
route_data = load_route_data()
original = read_json(DATA / 'received' / 'sinwol1_demand.json')
supplement = read_json(DATA / 'processed' / 'sinwol1_address_supplement.json')

# 프로젝트 제공 확인: 다른 버전의 건물명을 잘못 붙이지 않도록 원본 해시를 확인한다.
source_hash = hashlib.sha256((DATA / 'received' / 'sinwol1_demand.json').read_bytes()).hexdigest()
if source_hash != supplement['base_input_sha256']:
    raise ValueError('건물 원본과 주소 보완 자료의 버전이 다릅니다.')

# 제공 확인: master의 지도 파일과 상세 분석 결과가 같은 버전인지 확인한다.
manifest = read_json(TEAM / 'source_manifest.json')
for file_info in manifest['files']:
    if file_info['file_name'] in ['greenzone2nd.geojson', 'greenzone2nd_layer_zones.geojson']:
        content = (DATA / file_info['file_name']).read_bytes()
        if hashlib.sha256(content).hexdigest() != file_info['sha256']:
            raise ValueError('지도와 상세 분석 결과의 버전이 다릅니다. 자료를 함께 갱신하세요.')

parcels = {}
for row in original['tables']['parcels']:
    parcels[row['pnu']] = row
names = {}
for row in supplement['rows']:
    names[row['pnu']] = ' / '.join(row['building_names'])
hub_by_zone = {}
for feature in hubs['features']:
    hub_by_zone[feature['properties']['생활권']] = feature['properties']

buildings = []
for feature in households['features']:
    row = feature['properties']
    key = row['key']
    # 프로젝트 제공 연결: 전자지도 대지구분 0/1을 PNU 일반/산 1/2로 바꾼다.
    # 나머지 18자리 지번은 그대로 둔다. 가까운 점으로 추측 연결하지 않는다.
    pnu = key[:10] + str(int(key[10]) + 1) + key[11:]
    parcel = parcels.get(pnu)
    if parcel is None or parcel['apartment_detected']:
        raise ValueError('팀 주거 필지의 지번 연결 또는 아파트 제외를 확인하세요.')
    hub = hub_by_zone[row['생활권']]
    # 좌표는 GeoJSON geometry를 쓴다. 소수 3자리로 반올림된 위도/경도 속성은 쓰지 않는다.
    buildings.append({'pnu': pnu, 'team_key': key, 'name': names.get(pnu, ''),
                      'address': parcel['address'], 'jibun_address': lot_address(pnu),
                      'coordinates': feature['geometry']['coordinates'],
                      'units': row['세대'], 'housing_type': row['주택유형'],
                      'zone': row['생활권'], 'hub_id': hub['거점id'], 'hub_name': hub['이름']})
if len(buildings) != summary['parcel_count']:
    raise ValueError('팀 주거 필지 수와 요약 자료가 다릅니다.')


# 2. 화면은 지도 자료를 받고, 검색창은 보유 주소·건물명만 찾는다.
# @app.get('/')는 브라우저가 첫 화면 주소(/)를 요청하면 아래 함수를 실행하라는 뜻이다.
@app.get('/')
def home(request: Request):
    # HTML 화면을 돌려주고 카카오 JavaScript 키를 지도 SDK에 전달한다.
    return templates.TemplateResponse(
        request=request,
        name='index.html',
        context={'kakao_key': os.getenv('KAKAO_JAVASCRIPT_KEY', ''), 'route_mode': request.query_params.get('view') == 'route'}
    )


# @app.get은 분석 지도 페이지의 주소를 등록한다. 두 지도는 같은 페이지 안에서 전환한다.
@app.get('/analysis')
def analysis_view(request: Request, view: str = 'leaflet', plan: str = 'nine', min_width: int = 7):
    # 기존 팀 비교표를 읽는다. 표시 조건을 바꾸어도 분석 결과를 새로 계산하지 않는다.
    check_report_options(plan, min_width)
    if view not in ['leaflet', 'folium']:
        raise HTTPException(status_code=422, detail='지도 보기 방식을 확인하세요.')
    result = summary['comparisons'][1]
    if plan == 'six':
        result = summary['comparisons'][2]
    road_count = 0
    for feature in roads['features']:
        if float(feature['properties']['도로폭_m']) >= min_width:
            road_count += 1
    return templates.TemplateResponse(request=request, name='analysis.html', context={
        'view': view, 'plan': plan, 'min_width': min_width, 'zone_colors': ZONE_COLORS,
        'mean': round(result['mean_m'], 1), 'coverage': round(result['coverage_300'] * 100, 1),
        'hub_count': result['hub_count'], 'road_count': road_count, 'parcel_count': len(buildings)})



def check_report_options(plan, min_width):
    # 주소에 직접 값을 적어도 화면에서 제공하는 6곳/9곳·등록폭 조건만 받는다.
    if plan not in ['nine', 'six'] or min_width not in [0, 7]:
        raise HTTPException(status_code=422, detail='거점안과 도로 등록폭 조건을 확인하세요.')


# 예전 Folium 주소도 통합 페이지의 Folium 보기로 연결한다. 기존 공유 링크를 유지한다.
@app.get('/analysis/folium')
def folium_view(plan: str = 'nine', min_width: int = 7):
    check_report_options(plan, min_width)
    return RedirectResponse(url='/analysis?view=folium&plan=' + plan + '&min_width=' + str(min_width), status_code=307)


# 이 @app.get은 위 화면의 iframe 안에 넣을 Folium 지도 HTML을 돌려주는 주소다.
@app.get('/analysis/folium-map', response_class=HTMLResponse)
def folium_map(plan: str = 'nine', min_width: int = 7):
    # map_data()를 함수로 호출해 같은 자료를 넘긴다. HTTP 요청·자료 수집은 하지 않는다.
    check_report_options(plan, min_width)
    return HTMLResponse(build_folium_report(map_data(), plan, min_width))


# @app.get은 GET 주소를 등록하는 데코레이터다. 함수의 결과는 JSON 응답으로 바뀐다.
@app.get('/api/map-data')
def map_data():
    # 지도·필터가 사용할 받은 결과를 전달한다. 원본 데이터 자체는 수정하지 않는다.
    return {'summary': summary, 'hubs': hubs, 'zones': zones, 'candidates': candidates,
            'alternatives': alternatives, 'boundary': boundary, 'buildings': buildings,
            'roads': roads, 'protection': protection}


# ?q=검색어&page=번호를 함수의 q, page에 넣어 검색한다.
@app.get('/api/buildings')
def search_buildings(q: str = '', page: int = 1):
    # 팀의 더보기 방식을 보유 데이터 검색에 연결한다. 한 번에 10개씩 보낸다.
    page_size = 10
    if page < 1:
        page = 1
    if len(q.strip()) < 2 or len(q) > 100:
        return {'items': [], 'total': 0, 'page': page, 'page_size': page_size, 'has_more': False}
    result = []
    for building in buildings:
        text = building['address'] + building['jibun_address'] + building['name']
        text = text.lower().replace(' ', '')
        matched = True
        for word in q.lower().split():
            if word not in text:
                matched = False
        if matched:
            result.append(building)
    start = (page - 1) * page_size
    end = start + page_size
    return {'items': result[start:end], 'total': len(result), 'page': page,
            'page_size': page_size, 'has_more': end < len(result)}


# 배출량 펼치기를 눌렀을 때만 이 주소로 공식값·조건부 추정을 요청한다.
@app.get('/api/waste')
def waste_data():
    # 2024 공식 결합권역 물량과 기존 조건부 추정은 참고값으로만 보존한다.
    # 7,193 주거단위로 거점별 물량을 새로 나누지 않는다.
    observed = None
    estimate = None
    for row in read_csv('sinwol1_collection_zone_annual.csv'):
        if row['year'] == '2024' and row['waste_type'] == 'general':
            observed = row
    for row in read_csv('sinwol1_waste_estimation_scenarios.csv'):
        if row['year'] == '2024' and row['waste_type'] == 'general':
            estimate = row
    return {'observed': observed, 'estimate': estimate}


# /api/route는 화면에서 선택한 거점·도로폭 조건을 받아 계산 결과만 JSON으로 보낸다.
# 기존 생활권·거점 위치·배출량을 재배정하거나 데이터 파일에 저장하지 않는다.
@app.get('/api/route')
def collection_route(ids: str = '', start: str = '', min_width: int = 7, closed: bool = True, order_mode: str = 'auto'):
    # 예: ?ids=G06,G01&start=G06&min_width=7&closed=true
    # 함수에 적은 기본값은 화면에서 값을 보내지 않았을 때 적용된다.
    if len(ids) > 150:
        raise HTTPException(status_code=422, detail='거점 선택을 확인하세요.')
    selected = []
    for hub_id in ids.split(','):
        if hub_id.strip():
            selected.append(hub_id.strip())
    try:
        # manual은 받은 ID 순서대로, auto는 가까운 거점부터 계산한다.
        return plan_route(route_data, selected, start, min_width, closed, order_mode)
    except ValueError as error:
        # 자료·조건상 경로가 없을 때는 사유를 알린다. 직선 대체 경로를 만들지 않는다.
        raise HTTPException(status_code=422, detail=str(error))


# 자료는 정해 둔 결과 파일만 내려받는다. 원본 전체 폴더를 공개하지 않는다.
downloads = {'report': TEAM / 'greenzone2nd.md', 'workbook': TEAM / 'greenzone2nd.xlsx',
             'manifest': TEAM / 'source_manifest.json', 'hubs': DATA / 'greenzone2nd.geojson'}


# {name}은 URL의 한 부분이다. 예: /api/source/report이면 name='report'다.
@app.get('/api/source/{name}')
def source_file(name: str):
    # 정해 둔 분석 원본만 내려받는다. 임의 경로를 파일 이름으로 받지 않는다.
    if name not in downloads:
        raise HTTPException(status_code=404, detail='등록된 결과 자료가 아닙니다.')
    return FileResponse(downloads[name], filename=downloads[name].name)
