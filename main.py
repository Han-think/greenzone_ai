"""팀 결과 읽기 → 지번으로 건물 연결 → 검색·지도에 전달."""
import csv
import hashlib
import json
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / '.env')
DATA = ROOT / 'data'
TEAM = DATA / 'received' / 'team_second_stage'
app = FastAPI()
app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
templates = Jinja2Templates(directory=ROOT / 'templates')


def read_json(path):
    with open(path, encoding='utf-8-sig') as file:
        return json.load(file)


def read_csv(name):
    with open(DATA / 'analysis' / name, encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


def lot_address(pnu):
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
@app.get('/')
def home(request: Request):
    return templates.TemplateResponse(
        request=request,
        name='index.html',
        context={'kakao_key': os.getenv('KAKAO_JAVASCRIPT_KEY', '')}
    )


@app.get('/api/map-data')
def map_data():
    return {'summary': summary, 'hubs': hubs, 'zones': zones, 'candidates': candidates,
            'alternatives': alternatives, 'boundary': boundary, 'buildings': buildings}


@app.get('/api/buildings')
def search_buildings(q: str = ''):
    if len(q.strip()) < 2 or len(q) > 100:
        return {'items': [], 'total': 0}
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
    return {'items': result[:12], 'total': len(result)}


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


# 자료는 정해 둔 결과 파일만 내려받는다. 원본 전체 폴더를 공개하지 않는다.
downloads = {'report': TEAM / 'greenzone2nd.md', 'workbook': TEAM / 'greenzone2nd.xlsx',
             'manifest': TEAM / 'source_manifest.json', 'hubs': DATA / 'greenzone2nd.geojson'}


@app.get('/api/source/{name}')
def source_file(name: str):
    if name not in downloads:
        raise HTTPException(status_code=404, detail='등록된 결과 자료가 아닙니다.')
    return FileResponse(downloads[name], filename=downloads[name].name)
