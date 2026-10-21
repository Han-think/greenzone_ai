// 로그인 → 자료 조회 → 원문 대조 후 저장 → 이전/새 값 이력 확인.
var records = [];
var currentRecord = null;
var currentKind = '';
var listRequest = 0;
var historyRequest = 0;

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
        records = data.records; currentKind = kind;
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
            detail.append(textElement('summary', row.changed_at + ' · ' + row.actor + ' · ' + row.reason));
            detail.append(textElement('h3', '이전 값'));
            var before = textElement('pre', JSON.stringify(JSON.parse(row.before_json), null, 2)); before.className = 'history-value'; detail.append(before);
            detail.append(textElement('h3', '새 값'));
            var after = textElement('pre', JSON.stringify(JSON.parse(row.after_json), null, 2)); after.className = 'history-value'; detail.append(after); box.append(detail);
        }
    } catch (error) { if (request === historyRequest) box.textContent = error.message; }
}

async function saveRecord(event) {
    event.preventDefault();
    if (!currentRecord) return;
    var id = currentRecord.rule_id || currentRecord.document_id;
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
    var button = document.getElementById('saveRecord'); button.disabled = true;
    // 저장 중에는 다른 행을 골라 내용을 혼동하지 않도록 선택을 잠시 막는다.
    document.getElementById('recordSelect').disabled = true;
    document.getElementById('recordKind').disabled = true;
    try {
        var result = await adminFetch('/api/admin/records/' + currentKind + '/' + encodeURIComponent(id), 'PUT',
            {changes: changes, revision: currentRecord.revision, reason: document.getElementById('changeReason').value});
        document.getElementById('adminStatus').textContent = result.message;
        await loadRecords(null, id);
    } catch (error) { document.getElementById('adminStatus').textContent = error.message; }
    finally { button.disabled = false; document.getElementById('recordSelect').disabled = false; document.getElementById('recordKind').disabled = false; }
}

document.addEventListener('DOMContentLoaded', async function() {
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
