"""배출 자료 읽기 → SQLite 저장 → 품목 조회/관리자 수정.

원본 JSON은 보존하고 서비스 수정값은 data/local/service.sqlite3에 따로 둔다.
LLM·임베딩은 아직 호출하지 않는다. 수수료는 선택한 DB 행으로 계산한다.
"""
import json
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
KNOWLEDGE = ROOT / 'data/knowledge'
DATABASE = ROOT / 'data/local/service.sqlite3'


def read_json(path):
    # 출처 원본은 UTF-8 JSON으로 읽기만 한다.
    with open(path, encoding='utf-8-sig') as file:
        return json.load(file)


def now_text():
    # 수정 이력은 서로 비교하기 쉽게 UTC 시각으로 저장한다.
    return datetime.now(timezone.utc).isoformat()


def connect_database():
    # 첫 배출 안내/관리자 요청 때 DB를 준비한다. 지도만 볼 때는 필요 없다.
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute('CREATE TABLE IF NOT EXISTS records ('
                       'kind TEXT, record_id TEXT, payload TEXT NOT NULL, '
                       'revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(kind, record_id))')
    connection.execute('CREATE TABLE IF NOT EXISTS history ('
                       'id INTEGER PRIMARY KEY, kind TEXT, record_id TEXT, '
                       'before_json TEXT, after_json TEXT, reason TEXT, actor TEXT, changed_at TEXT)')
    connection.execute('CREATE TABLE IF NOT EXISTS seeds (name TEXT PRIMARY KEY)')
    # BEGIN IMMEDIATE는 동시에 처음 접속해도 원본 적재가 중복되지 않게 한다.
    connection.execute('BEGIN IMMEDIATE')
    try:
        if not connection.execute("SELECT name FROM seeds WHERE name='preview-v1'").fetchone():
            catalog = read_json(KNOWLEDGE / 'waste_catalog.json')
            items = {}
            aliases = {}
            for item in catalog['items']:
                items[item['item_id']] = item
                aliases[item['item_id']] = []
            for alias in catalog['aliases']:
                aliases[alias['item_id']].append(alias['alias'])
            for rule in catalog['rules']:
                row = dict(rule)
                row['official_name'] = items[row['item_id']]['official_name']
                row['aliases'] = aliases[row['item_id']]
                row['source_url'] = 'https://smartclean.yangcheon.go.kr/online/bulky/item'
                row['verification_status'] = 'seed_snapshot'
                row['source_note'] = '2026-10-18 공식표 스냅샷. 현행 금액 재대조 전 참고값.'
                insert_record(connection, 'rules', row['rule_id'], row)
            for doc in read_json(KNOWLEDGE / 'knowledge_documents.json')['documents']:
                # 강서구 원본은 보존하되 신월1동 서비스 DB에는 적재하지 않는다.
                if doc['district_code'] not in ['11470', 'ALL']:
                    continue
                row = dict(doc)
                row['verification_status'] = 'review_needed'
                row['active'] = True
                row['source_type'] = 'preview_summary'
                insert_record(connection, 'documents', row['document_id'], row)
            connection.execute("INSERT INTO seeds(name) VALUES ('preview-v1')")
        if not connection.execute("SELECT name FROM seeds WHERE name='legal-20261021-v1'").fetchone():
            for row in read_json(KNOWLEDGE / 'legal_documents.json')['documents']:
                insert_record(connection, 'documents', row['document_id'], row)
            connection.execute("INSERT INTO seeds(name) VALUES ('legal-20261021-v1')")
        connection.commit()
    except Exception:
        connection.rollback()
        connection.close()
        raise
    return connection


def insert_record(connection, kind, record_id, row):
    # 이미 관리자가 고친 행은 다시 덮어쓰지 않는다. ?에는 SQL 값만 전달한다.
    connection.execute('INSERT OR IGNORE INTO records(kind, record_id, payload) VALUES (?, ?, ?)',
                       (kind, record_id, json.dumps(row, ensure_ascii=False)))


def list_records(kind, query='', include_inactive=False):
    # 품목명·별칭·내용으로 검색한다. 데이터가 작으므로 쉬운 반복문으로 처리한다.
    connection = connect_database()
    try:
        rows = connection.execute('SELECT * FROM records WHERE kind=? ORDER BY record_id', (kind,)).fetchall()
    finally:
        connection.close()
    result = []
    for row in rows:
        data = json.loads(row['payload'])
        data['revision'] = row['revision']
        if not include_inactive and not data.get('active', True):
            continue
        words = str(data.get('official_name', '')) + ' ' + str(data.get('aliases', []))
        words += ' ' + str(data.get('title', '')) + ' ' + str(data.get('text', ''))
        if query.strip().lower() in words.lower():
            result.append(data)
    return result


def date_applies(row):
    # 시행 전이거나 시행 종료된 문서는 확정 안내에서 제외한다. 확인일과 시행일은 다르다.
    today = date.today().isoformat()
    start = row.get('effective_from')
    end = row.get('effective_until')
    return (not start or start <= today) and (not end or today <= end)


def public_documents():
    # 미검토 문서는 관리자에게만 보인다. 법령은 확인한 발췌 범위만 안내한다.
    result = []
    for row in list_records('documents'):
        if row.get('verification_status') == 'verified_excerpt' and date_applies(row):
            result.append(row)
    return result


def list_items(query=''):
    # 한 품목에 규격이 여러 개여도 품목 선택 목록에는 한 번만 넣는다.
    result = []
    found = set()
    for row in list_records('rules', query):
        if row['item_id'] not in found:
            result.append({'item_id': row['item_id'], 'name': row['official_name']})
            found.add(row['item_id'])
    return result


def rules_for_item(item_id):
    # 사진의 크기를 추정해 규격을 정하지 않는다. 사용자가 정확한 규격 행을 고른다.
    result = []
    for row in list_records('rules'):
        if row['item_id'] == item_id and date_applies(row):
            result.append(row)
    return result


def make_guide(rule_id, quantity):
    # 수수료 = 사용자가 확정한 규격의 DB 금액 × 수량. 수거시각은 만들지 않는다.
    for row in list_records('rules'):
        if row['rule_id'] == rule_id and date_applies(row):
            return {'rule': row, 'quantity': quantity, 'total_krw': row['fee_krw'] * quantity,
                    'documents': public_documents(),
                    'notice': '참고 수수료입니다. 공식 신청 화면에서 최종 금액과 장소를 확인하세요. '
                              '지도 거점안은 대형폐기물 공식 배출장소로 지정된 곳이 아닙니다.',
                    'official_url': 'https://smartclean.yangcheon.go.kr/online/bulky/guide'}
    raise ValueError('사용 가능한 품목·규격을 다시 선택하세요.')


def save_record(kind, record_id, changes, revision, reason, actor):
    # 버전이 다르면 다른 사람의 수정을 덮지 않고 다시 불러오게 한다.
    connection = connect_database()
    try:
        connection.execute('BEGIN IMMEDIATE')
        saved = connection.execute('SELECT * FROM records WHERE kind=? AND record_id=?',
                                   (kind, record_id)).fetchone()
        if saved is None:
            raise ValueError('수정할 자료가 없습니다.')
        if saved['revision'] != revision:
            raise ValueError('다른 수정이 반영됐습니다. 자료를 다시 조회하세요.')
        before = json.loads(saved['payload'])
        after = dict(before)
        after.update(changes)
        after['updated_at'] = now_text()
        encoded = json.dumps(after, ensure_ascii=False)
        connection.execute('UPDATE records SET payload=?, revision=revision+1 WHERE kind=? AND record_id=?',
                           (encoded, kind, record_id))
        connection.execute('INSERT INTO history(kind, record_id, before_json, after_json, reason, actor, changed_at) '
                           'VALUES (?, ?, ?, ?, ?, ?, ?)',
                           (kind, record_id, saved['payload'], encoded, reason, actor, now_text()))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def read_history(kind, record_id):
    # 최근 수정 20건의 이전 값/새 값/수정 사유를 관리자에게 반환한다.
    connection = connect_database()
    try:
        rows = connection.execute('SELECT * FROM history WHERE kind=? AND record_id=? ORDER BY id DESC LIMIT 20',
                                   (kind, record_id)).fetchall()
        result = []
        for row in rows:
            result.append(dict(row))
        return result
    finally:
        connection.close()
