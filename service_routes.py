"""사진 업로드·배출 안내·관리자 URL. main.py의 기존 지도 URL은 유지한다."""
import asyncio
import io
import json
import os
import secrets
import threading
import time
import warnings
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
import guide_service as guide
import vision_service

router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).resolve().parent / 'templates')
sessions = {}
login_attempts = {}
session_lock = threading.Lock()
COOKIE_NAME = 'greenzone_admin'


async def read_limited_body(request, limit):
    # request.body()로 무제한 읽지 않고, 조각을 받을 때마다 용량을 확인한다.
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(413, '허용 용량을 초과했습니다.')
    return bytes(data)


async def read_form_json(request):
    # JSON 입력도 64KB까지만 받고 객체 형태인지 확인한다.
    try:
        result = json.loads(await read_limited_body(request, 65536))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(422, '입력 형식을 확인하세요.')
    if not isinstance(result, dict):
        raise HTTPException(422, '입력 형식을 확인하세요.')
    return result


def check_admin_origin(request):
    # 외부 페이지에서 관리자 저장 요청을 보내지 못하도록 전용 헤더와 출처를 확인한다.
    if request.headers.get('X-GreenZone-Admin') != '1':
        raise HTTPException(403, '관리자 화면에서 요청하세요.')
    origin = request.headers.get('origin')
    if origin and urlsplit(origin).netloc != request.headers.get('host'):
        raise HTTPException(403, '다른 사이트의 요청은 허용하지 않습니다.')
    if request.headers.get('sec-fetch-site') == 'cross-site':
        raise HTTPException(403, '다른 사이트의 요청은 허용하지 않습니다.')


def require_admin(request):
    # 화면을 숨기는 것과 별개로 모든 관리자 API에서 로그인·만료를 확인한다.
    token = request.cookies.get(COOKIE_NAME, '')
    with session_lock:
        session = sessions.get(token)
        if not session or session['expires'] < time.time():
            sessions.pop(token, None)
            raise HTTPException(401, '관리자 로그인이 필요합니다.')
        return session['username']


# @router.get은 URL을 등록한다. main.py에서 app.include_router로 함께 연결한다.
@router.get('/disposal')
def disposal_page(request: Request):
    # 지도와 별도 화면으로 두어 좁은 검색 영역에 사진 폼을 억지로 넣지 않는다.
    return templates.TemplateResponse(request=request, name='disposal.html', context={})


@router.get('/admin')
def admin_page(request: Request):
    # 로그인 폼만 공개한다. 자료 조회·저장은 인증된 API로만 가능하다.
    return templates.TemplateResponse(request=request, name='admin.html', context={})


@router.post('/api/vision')
async def upload_image(request: Request):
    # 파일은 raw 바이트로 받아 multipart 패키지 없이 실제 이미지를 확인한다.
    # 사진은 저장하지 않는다. API는 후보만 주며 공식 품목은 사람이 고른다.
    raw = await read_limited_body(request, 8 * 1024 * 1024)
    if not raw:
        raise HTTPException(422, '사진을 선택하세요.')
    try:
        from PIL import Image, UnidentifiedImageError
    except ImportError:
        raise HTTPException(503, '이미지 확인에 Pillow가 필요합니다. requirements.txt를 설치하세요.')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ['JPEG', 'PNG', 'WEBP']:
                    raise HTTPException(415, 'JPG·PNG·WebP 사진만 지원합니다.')
                width, height = image.size
                if width * height > 12000000 or getattr(image, 'n_frames', 1) > 1:
                    raise HTTPException(422, '정지 사진 1장, 1,200만 화소 이하로 줄여주세요.')
                image.verify()
            # verify 후 다시 열어 픽셀도 읽는다. 파일명/확장자만으로 신뢰하지 않는다.
            with Image.open(io.BytesIO(raw)) as image:
                image.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, '사진을 읽지 못했습니다. 다른 사진을 선택하세요.')
    result = {'status': 'manual_confirmation_required', 'width': width, 'height': height,
              'candidates': [], 'stored': False, 'provider_called': False}
    if vision_service.settings() is None:
        result['state'] = 'not_configured'
        result['message'] = 'Gemini 설정 전입니다. 아래에서 직접 품목을 선택하세요.'
        return result
    try:
        # 별도 작업으로 호출해 사진을 분석하는 동안 지도·검색 요청을 막지 않는다.
        analysis = await asyncio.to_thread(vision_service.suggest, raw, guide.list_items())
        result.update(analysis)
        result['provider_called'] = True
    except (OSError, ValueError, TypeError, KeyError):
        result['state'] = 'error'
        result['provider_called'] = True
        result['message'] = '사진 분석에 연결하지 못했습니다. 아래에서 직접 품목을 선택하세요.'
        return result
    if result['state'] == 'candidates':
        result['message'] = 'Gemini가 제안한 후보입니다. 맞는 품목을 선택하고 규격·수량을 확인하세요.'
    elif result['state'] == 'abstained':
        result['message'] = '확실한 후보가 없어 보류했습니다. 다른 사진을 쓰거나 직접 품목을 선택하세요.'
    return result


@router.get('/api/disposal/items')
def disposal_items(q: str = ''):
    # 보유 품목과 별칭으로 찾는다. 새 외부 검색 API는 사용하지 않는다.
    return {'items': guide.list_items(q[:100])}


@router.get('/api/disposal/rules')
def disposal_rules(item_id: str):
    return {'rules': guide.rules_for_item(item_id[:100])}


@router.get('/api/disposal/documents')
def disposal_documents():
    return {'documents': guide.public_documents(), 'mode': 'verified_excerpt_lookup_not_llm_rag'}


@router.post('/api/disposal-guide')
async def disposal_guide(request: Request):
    # 사용자가 확정한 규격 ID/수량만 받아 서버 DB에서 금액과 근거를 조회한다.
    data = await read_form_json(request)
    quantity = data.get('quantity')
    if type(quantity) is not int or not 1 <= quantity <= 100:
        raise HTTPException(422, '수량은 1~100 사이의 정수로 입력하세요.')
    try:
        return guide.make_guide(str(data.get('rule_id', ''))[:100], quantity)
    except ValueError as error:
        raise HTTPException(422, str(error))


@router.post('/api/admin/login')
async def admin_login(request: Request):
    check_admin_origin(request)
    data = await read_form_json(request)
    expected_user = os.getenv('ADMIN_USERNAME', 'admin')
    expected_password = os.getenv('ADMIN_PASSWORD', '')
    if len(expected_password) < 16:
        raise HTTPException(503, '.env에 ADMIN_PASSWORD를 16자 이상 설정하고 서버를 재시작하세요.')
    address = request.client.host if request.client else 'unknown'
    now = time.time()
    with session_lock:
        # 오래된 실패/세션은 지워 메모리가 계속 늘지 않게 한다.
        for key in list(login_attempts):
            if login_attempts[key]['until'] <= now:
                login_attempts.pop(key)
        for key in list(sessions):
            if sessions[key]['expires'] <= now:
                sessions.pop(key)
        attempt = login_attempts.get(address, {'count': 0, 'until': now + 60})
        if attempt['count'] >= 5:
            raise HTTPException(429, '로그인이 여러 번 실패했습니다. 1분 뒤 다시 시도하세요.')
        user_ok = secrets.compare_digest(str(data.get('username', '')).encode(), expected_user.encode())
        password_ok = secrets.compare_digest(str(data.get('password', '')).encode(), expected_password.encode())
        if not user_ok or not password_ok:
            attempt['count'] += 1
            login_attempts[address] = attempt
            raise HTTPException(401, '아이디 또는 비밀번호가 다릅니다.')
        login_attempts.pop(address, None)
        token = secrets.token_urlsafe(32)
        sessions[token] = {'username': expected_user, 'expires': now + 8 * 3600}
    response = JSONResponse({'username': expected_user})
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite='strict',
                        secure=request.url.scheme == 'https', max_age=8 * 3600, path='/')
    return response


@router.get('/api/admin/session')
def admin_session(request: Request):
    return {'username': require_admin(request)}


@router.post('/api/admin/logout')
def admin_logout(request: Request):
    check_admin_origin(request)
    require_admin(request)
    with session_lock:
        sessions.pop(request.cookies.get(COOKIE_NAME), None)
    response = JSONResponse({'logged_out': True})
    response.delete_cookie(COOKIE_NAME, path='/')
    return response


def check_kind(kind):
    if kind not in ['rules', 'documents']:
        raise HTTPException(404, '지원하지 않는 자료입니다.')


@router.get('/api/admin/records/{kind}')
def admin_records(kind: str, request: Request, q: str = ''):
    require_admin(request)
    check_kind(kind)
    return {'records': guide.list_records(kind, q[:100], include_inactive=True)}


@router.get('/api/admin/history/{kind}/{record_id}')
def admin_history(kind: str, record_id: str, request: Request):
    require_admin(request)
    check_kind(kind)
    return {'history': guide.read_history(kind, record_id)}


def validate_changes(kind, data):
    # ID·지역·원래 출처 식별자는 수정할 수 없다. 편집 가능한 칸만 가져온다.
    fields = ['active', 'checked_at', 'effective_from', 'effective_until', 'source_url', 'verification_status']
    fields += ['specification', 'fee_krw', 'source_note'] if kind == 'rules' else ['title', 'text']
    changes = {}
    supplied = data.get('changes')
    if not isinstance(supplied, dict):
        raise HTTPException(422, '수정할 내용을 확인하세요.')
    for field in fields:
        if field in supplied:
            changes[field] = supplied[field]
    if type(changes.get('active')) is not bool:
        raise HTTPException(422, '사용 여부를 확인하세요.')
    for field in ['checked_at', 'effective_from', 'effective_until']:
        value = changes.get(field)
        if value is not None and not isinstance(value, str):
            raise HTTPException(422, '날짜는 문자열 또는 빈 값으로 입력하세요.')
        if value:
            try:
                parsed = date.fromisoformat(value)
            except (ValueError, TypeError):
                raise HTTPException(422, '날짜는 YYYY-MM-DD 형식으로 입력하세요.')
            if field == 'checked_at' and parsed > date.today():
                raise HTTPException(422, '확인일은 미래 날짜로 지정할 수 없습니다.')
    if changes.get('effective_from') and changes.get('effective_until'):
        if changes['effective_from'] > changes['effective_until']:
            raise HTTPException(422, '시행 시작일과 종료일을 확인하세요.')
    url = changes.get('source_url', '')
    if not isinstance(url, str) or len(url) > 2000:
        raise HTTPException(422, '출처 URL을 확인하세요.')
    parsed = urlsplit(url)
    allowed_hosts = ['law.go.kr', 'www.law.go.kr', 'smartclean.yangcheon.go.kr',
                     'www.yangcheon.go.kr', 'yangcheon.go.kr', 'www.wasteguide.or.kr']
    if parsed.scheme != 'https' or parsed.hostname not in allowed_hosts or parsed.username:
        raise HTTPException(422, '등록된 공식 기관의 HTTPS 출처만 입력하세요.')
    status = changes.get('verification_status')
    if status not in ['seed_snapshot', 'review_needed', 'verified_excerpt']:
        raise HTTPException(422, '검토 상태를 확인하세요.')
    if status == 'verified_excerpt' and not changes.get('checked_at'):
        raise HTTPException(422, '검토 완료 시 확인일이 필요합니다.')
    for field in ['specification', 'source_note', 'title', 'text']:
        if field in changes and (not isinstance(changes[field], str) or len(changes[field]) > 12000):
            raise HTTPException(422, '본문 또는 설명 길이를 확인하세요.')
    if kind == 'rules':
        fee = changes.get('fee_krw')
        if type(fee) is not int or not 0 <= fee <= 10000000 or not changes.get('specification', '').strip():
            raise HTTPException(422, '규격과 0 이상 정수 금액을 입력하세요.')
    elif not changes.get('title', '').strip() or not changes.get('text', '').strip():
        raise HTTPException(422, '제목과 본문을 입력하세요.')
    return changes


@router.put('/api/admin/records/{kind}/{record_id}')
async def admin_save(kind: str, record_id: str, request: Request):
    actor = require_admin(request)
    check_admin_origin(request)
    check_kind(kind)
    data = await read_form_json(request)
    reason = data.get('reason', '')
    revision = data.get('revision')
    if not isinstance(reason, str) or not 3 <= len(reason.strip()) <= 500 or type(revision) is not int:
        raise HTTPException(422, '수정 사유를 3~500자로 입력하고 자료를 다시 조회하세요.')
    changes = validate_changes(kind, data)
    if kind == 'documents' and changes['verification_status'] == 'verified_excerpt':
        for row in guide.list_records(kind, include_inactive=True):
            if row['document_id'] == record_id and row.get('source_type') == 'law' and not changes.get('effective_from'):
                raise HTTPException(422, '법령 검토 완료 시 시행일이 필요합니다.')
    try:
        guide.save_record(kind, record_id, changes, revision, reason.strip(), actor)
    except ValueError as error:
        raise HTTPException(409, str(error))
    return {'saved': True, 'message': '저장했습니다. 다음 사용자 조회부터 반영됩니다.'}
