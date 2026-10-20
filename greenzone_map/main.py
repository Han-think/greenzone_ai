from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from pydantic import BaseModel
import json
import os

app = FastAPI(title="그린존 서비스", version="1.0")

templates = Jinja2Templates(directory="map_temp")
DATA_PATH = os.path.join("data", "greenzone1st.geojson")
BOUNDARY_PATH = os.path.join("data", "greenzone1st_layer_boundary.geojson")

def load_json_file(path: str) -> dict:
    """JSON 파일을 안전하게 읽어오는 공통 함수"""
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"파일을 찾을 수 없습니다: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def geocode_address(address: str) -> dict:
    """주소 검색 시뮬레이션 모듈 (시연용)"""
    mock_db = {
        "신월로": {"lat": 37.5315, "lng": 126.8320, "name": "신월로 입력 위치"},
        "곰달래로": {"lat": 37.5295, "lng": 126.8360, "name": "곰달래로 입력 위치"},
        "월정로": {"lat": 37.5330, "lng": 126.8362, "name": "월정로 입력 위치"},
    }
    for key, val in mock_db.items():
        if key in address:
            return {"address": address, "lat": val["lat"], "lng": val["lng"], "found": True}
    return {"address": address, "lat": 37.5312, "lng": 126.8251, "name": "기본 중심 위치", "found": False}

class AddressRequest(BaseModel):
    address: str

@app.get("/", response_class=HTMLResponse)
def read_root(request: Request):
    return templates.TemplateResponse(request, "index.html")

@app.get("/api/candidates")
def get_candidates():
    """11곳 후보지 GeoJSON 데이터 반환"""
    return load_json_file(DATA_PATH)

@app.get("/api/boundary")
def get_boundary():
    """신월1동 경계 폴리곤 데이터 반환"""
    return load_json_file(BOUNDARY_PATH)

@app.post("/api/search-address")
def search_address_api(req: AddressRequest):
    if not req.address.strip():
        raise HTTPException(status_code=400, detail="주소를 입력해주세요.")
    return geocode_address(req.address)