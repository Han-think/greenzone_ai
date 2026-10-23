function historyValue(value) {
    // 내부 저장 코드를 사용자에게 익숙한 말로 바꾼다.
    if (value === true) return '사용';
    if (value === false) return '사용 안 함';
    var names = {review_needed: '추가 확인 필요', seed_snapshot: '기존 스냅샷', verified_excerpt: '원문 대조 완료'};
    return names[value] || (value === null || value === undefined ? '미입력' : String(value));
}

// 로그인 → 자료 조회 → 원문 대조 후 저장 → 이전/새 값 이력 확인.
var records = [];
var currentRecord = null;
var currentKind = '';
var listRequest = 0;
var historyRequest = 0;
var creating = false;
var pendingSave = null;

function textElement(tag, value) {
    var node = document.createElement(tag); node.textContent = value; return node;
}

async function adminFetch(url, method, data) {
    // 관리자 저장 요청은 세션 쿠키와 전용 헤더를 함께 보낸다.
    var options = {method: method || 'GET', cache: 'no-store', credentials: 'same-origin', headers: {'X-GreenZone-Admin': '1'}};
    if (data) { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(data); }
    var response = await fetch(url, options);
    var result = await response.json();
    if (response.status === 401) showLogin(false);
    if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : '입력을 확인하세요.');
    return result;
}

function showLogin(loggedIn) {
    document.getElementById('loginPanel').hidden = loggedIn;
    document.getElementById('adminNav').hidden = !loggedIn;
    document.getElementById('adminLoginEntry').hidden = loggedIn;
    if (!loggedIn) {
        rememberMenu('greenzone-admin-menu-open', false);
        document.getElementById('adminNav').open = false;
    }
    document.getElementById('adminEntry').textContent = loggedIn ? '관리자 화면' : '관리자 로그인';
    document.getElementById('adminPanel').hidden = !loggedIn;
    if (!loggedIn) {
        listRequest += 1; historyRequest += 1;
        records = []; currentRecord = null;
        document.getElementById('recordSelect').replaceChildren();
        document.getElementById('historyList').replaceChildren();
        document.getElementById('editForm').reset();
        document.getElementById('editForm').hidden = true;
    }
}

async function login(event) {
    event.preventDefault();
    try {
        await adminFetch('/api/admin/login', 'POST', {username: document.getElementById('username').value,
            password: document.getElementById('password').value});
        document.getElementById('password').value = '';
        showLogin(true); document.getElementById('adminStatus').textContent = '로그인했습니다.'; loadRecords();
    } catch (error) { document.getElementById('adminStatus').textContent = error.message; }
}

async function loadRecords(event, keepId) {
    if (event) event.preventDefault();
    var request = ++listRequest;
    currentRecord = null; document.getElementById('editForm').hidden = true;
    var select = document.getElementById('recordSelect'); select.replaceChildren();
    document.getElementById('historyList').replaceChildren(); historyRequest += 1;
    var kind = document.getElementById('recordKind').value;
    try {
        var data = await adminFetch('/api/admin/records/' + kind + '?q=' + encodeURIComponent(document.getElementById('recordQuery').value));
        if (request !== listRequest) return;
        records = data.records.filter(function(row) {
            var filter = document.getElementById('reviewFilter').value;
            var today = new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Seoul'});
            if (filter === 'review') return row.verification_status !== 'verified_excerpt';
            if (filter === 'expired') return row.effective_until && row.effective_until < today;
            if (filter === 'inactive') return row.active === false;
            if (filter === 'future') return row.effective_from && row.effective_from > today;
            return true;
        }); currentKind = kind;
        for (var i = 0; i < records.length; i++) {
            var row = records[i];
            var label = kind === 'rules' ? row.official_name + ' / ' + row.specification : row.title;
            var option = textElement('option', label + (row.active ? '' : ' [사용 안함]'));
            option.value = String(i); select.append(option);
            if ((row.rule_id || row.document_id) === keepId) select.value = String(i);
        }
        document.getElementById('recordInfo').textContent = records.length + '건';
        if (records.length) { if (!keepId) select.value = '0'; selectRecord(); }
    } catch (error) { if (request === listRequest) document.getElementById('adminStatus').textContent = error.message; }
}

function selectRecord() {
    // 목록에서 선택한 한 행의 수정 버전을 보관한다. 저장할 때 버전을 함께 보낸다.
    currentRecord = records[Number(document.getElementById('recordSelect').value)];
    if (!currentRecord) return;
    creating = false; document.getElementById('createFields').hidden = true;
    var row = currentRecord;
    var isRule = currentKind === 'rules';
    document.getElementById('ruleFields').hidden = !isRule;
    document.getElementById('documentFields').hidden = isRule;
    document.getElementById('editForm').hidden = false;
    document.getElementById('specification').value = row.specification || '';
    document.getElementById('fee').value = row.fee_krw === undefined ? '' : row.fee_krw;
    document.getElementById('sourceNote').value = row.source_note || '';
    document.getElementById('documentTitle').value = row.title || '';
    document.getElementById('documentText').value = row.text || '';
    document.getElementById('sourceUrl').value = row.source_url || '';
    document.getElementById('checkedAt').value = row.checked_at || '';
    document.getElementById('effectiveFrom').value = row.effective_from || '';
    document.getElementById('effectiveUntil').value = row.effective_until || '';
    document.getElementById('verification').value = row.verification_status || 'review_needed';
    document.getElementById('recordActive').checked = Boolean(row.active);
    document.getElementById('changeReason').value = '';
    loadHistory(row.rule_id || row.document_id);
}

async function loadHistory(id) {
    var request = ++historyRequest;
    var box = document.getElementById('historyList'); box.replaceChildren();
    try {
        var data = await adminFetch('/api/admin/history/' + currentKind + '/' + encodeURIComponent(id));
        if (request !== historyRequest) return;
        if (!data.history.length) { box.textContent = '아직 수정 이력이 없습니다.'; return; }
        for (var i = 0; i < data.history.length; i++) {
            var row = data.history[i]; var detail = document.createElement('details');
            detail.append(textElement('summary', new Date(row.changed_at).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ' · ' + row.actor + ' · ' + row.reason));
            // DB 원본은 그대로 두고 변경된 항목만 한국어 표로 보여준다.
            var previousValue = JSON.parse(row.before_json); var before = previousValue || {}; var after = JSON.parse(row.after_json);
            var labels = {specification: '규격', fee_krw: '수수료(원)', source_note: '금액 기준 설명',
                title: '제목', text: '발췌 본문', source_url: '공식 출처', checked_at: '원문 확인일',
                effective_from: '시행 시작일', effective_until: '시행 종료일', verification_status: '검토 상태', active: '사용 여부'};
            var table = document.createElement('table'); table.className = 'history-table';
            var header = document.createElement('tr');
            ['항목', '이전 값', '새 값'].forEach(function(value) { header.append(textElement('th', value)); });
            table.append(header);
            Object.keys(labels).forEach(function(key) {
                var previous = key === 'active' ? Boolean(before[key]) : before[key];
                var next = key === 'active' ? Boolean(after[key]) : after[key];
                if (JSON.stringify(previous) === JSON.stringify(next)) return;
                var line = document.createElement('tr');
                line.append(textElement('td', labels[key]), textElement('td', historyValue(previous)), textElement('td', historyValue(next)));
                table.append(line);
            });
            detail.append(table);
            if (previousValue) {
                var restore = textElement('button', '이 변경 전으로 복원');
                restore.type = 'button'; restore.dataset.historyId = row.id;
                restore.onclick = function() { prepareRestore(Number(this.dataset.historyId), data.history); };
                detail.append(restore);
            }
            box.append(detail);
        }
    } catch (error) { if (request === historyRequest) box.textContent = error.message; }
}

async function saveRecord(event) {
    event.preventDefault();
    if (!currentRecord && !creating) return;
    var id = creating ? '' : currentRecord.rule_id || currentRecord.document_id;
    var changes = {source_url: document.getElementById('sourceUrl').value,
        checked_at: document.getElementById('checkedAt').value || null,
        effective_from: document.getElementById('effectiveFrom').value || null,
        effective_until: document.getElementById('effectiveUntil').value || null,
        verification_status: document.getElementById('verification').value,
        active: document.getElementById('recordActive').checked};
    if (currentKind === 'rules') {
        changes.specification = document.getElementById('specification').value;
        changes.fee_krw = Number(document.getElementById('fee').value);
        changes.source_note = document.getElementById('sourceNote').value;
    } else { changes.title = document.getElementById('documentTitle').value; changes.text = document.getElementById('documentText').value; }
    var reason = document.getElementById('changeReason').value;
    if (reason.trim().length < 3) { document.getElementById('adminStatus').textContent = '사유를 3자 이상 입력하세요.'; return; }
    var body = {changes: changes, reason: reason};
    if (creating) {
        body.official_name = document.getElementById('officialName').value.trim();
        body.source_type = document.getElementById('sourceType').value;
        if (currentKind === 'rules' && !body.official_name) { document.getElementById('adminStatus').textContent = '공식 품목명을 입력하세요.'; return; }
    } else body.revision = currentRecord.revision;
    pendingSave = {url: '/api/admin/records/' + currentKind + (creating ? '' : '/' + encodeURIComponent(id)),
        method: creating ? 'POST' : 'PUT', body: body, id: id};
    previewChanges(currentRecord || {}, changes);
}

function previewChanges(before, after) {
    // HTML 문자열로 본문을 삽입하지 않고 실제 바뀐 칸을 비교한다.
    var box = document.getElementById('previewChanges'); box.replaceChildren();
    var labels = {specification:'규격', fee_krw:'수수료', source_note:'금액 설명', title:'제목', text:'본문',
        source_url:'공식 출처', checked_at:'확인일', effective_from:'시행 시작', effective_until:'시행 종료', verification_status:'검토 상태', active:'사용 여부'};
    if (pendingSave.body.official_name) box.append(textElement('p', '공식 품목명: ' + pendingSave.body.official_name));
    Object.keys(after).forEach(function(key) {
        if (!labels[key] || JSON.stringify(before[key] ?? null) === JSON.stringify(after[key] ?? null)) return;
        box.append(textElement('strong', labels[key] || key), textElement('p', historyValue(before[key]) + ' → ' + historyValue(after[key])));
    });
    box.append(textElement('p', '사유: ' + pendingSave.body.reason));
    document.getElementById('savePreview').showModal();
}

function prepareRestore(historyId, history) {
    if (!currentRecord) return;
    var row = history.find(function(value) { return value.id === historyId; });
    if (!row || !JSON.parse(row.before_json)) return;
    var reason = prompt('복원 사유를 3자 이상 입력하세요.');
    if (!reason || reason.trim().length < 3 || reason.length > 500) return;
    var id = currentRecord.rule_id || currentRecord.document_id;
    pendingSave = {url:'/api/admin/restore/' + currentKind + '/' + encodeURIComponent(id), method:'POST', id:id,
        body:{history_id:historyId, revision:currentRecord.revision, reason:reason}};
    previewChanges(currentRecord, JSON.parse(row.before_json));
}

async function confirmSave() {
    // 대화상자에서 확정한 데이터만 저장한다. DB는 버전을 다시 검사한다.
    if (!pendingSave) return;
    var request = pendingSave;
    var button = document.getElementById('confirmSave'); button.disabled = true;
    try {
        var result = await adminFetch(request.url, request.method, request.body);
        document.getElementById('savePreview').close(); pendingSave = null;
        document.getElementById('adminStatus').textContent = result.message;
        document.getElementById('reviewFilter').value = 'all';
        document.getElementById('recordQuery').value = '';
        await loadRecords(null, result.record_id || request.id);
    } catch (error) { document.getElementById('savePreview').close(); document.getElementById('adminStatus').textContent = error.message; }
    finally { button.disabled = false; }
}

function newRecord() {
    creating = true; currentRecord = null; historyRequest += 1;
    currentKind = document.getElementById('recordKind').value;
    document.getElementById('editForm').reset();
    document.getElementById('editForm').hidden = false;
    document.getElementById('createFields').hidden = false;
    document.getElementById('officialName').hidden = currentKind !== 'rules';
    document.querySelector('label[for="officialName"]').hidden = currentKind !== 'rules';
    document.getElementById('sourceType').hidden = currentKind !== 'documents';
    document.querySelector('label[for="sourceType"]').hidden = currentKind !== 'documents';
    document.getElementById('ruleFields').hidden = currentKind !== 'rules';
    document.getElementById('documentFields').hidden = currentKind !== 'documents';
    document.getElementById('verification').value = 'review_needed';
    document.getElementById('recordActive').checked = false;
    document.getElementById('sourceUrl').value = 'https://smartclean.yangcheon.go.kr/online/bulky/guide';
    document.getElementById('historyList').replaceChildren();
    document.getElementById('adminStatus').textContent = '새 자료는 사용 중지·추가 확인 필요 상태로 시작합니다. 확인 후 공개 여부를 선택하세요.';
}


document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById('newRecord').onclick = newRecord;
    document.getElementById('confirmSave').onclick = confirmSave;
    document.getElementById('cancelSave').onclick = function() { document.getElementById('savePreview').close(); pendingSave = null; };
    document.getElementById('reviewFilter').onchange = loadRecords;
    if (new URLSearchParams(location.search).get('filter') === 'review') document.getElementById('reviewFilter').value = 'review';
    document.getElementById('loginForm').onsubmit = login;
    document.getElementById('recordSearch').onsubmit = loadRecords;
    document.getElementById('recordKind').onchange = loadRecords;
    document.getElementById('recordSelect').onchange = selectRecord;
    document.getElementById('editForm').onsubmit = saveRecord;
    document.getElementById('logout').onclick = async function() {
        try { await adminFetch('/api/admin/logout', 'POST', {}); showLogin(false); document.getElementById('adminStatus').textContent = '로그아웃했습니다.'; }
        catch (error) { document.getElementById('adminStatus').textContent = error.message; }
    };
    try { await adminFetch('/api/admin/session'); showLogin(true); loadRecords(); }
    catch (error) { showLogin(false); }
});
