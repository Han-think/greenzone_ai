// 사진 업로드 → 사람이 품목/규격/수량 확인 → 서버 DB에서 안내 조회.
var photoUrl = null;
var photoRevision = 0;
var itemRequest = 0;
var ruleRequest = 0;
var guideRequest = 0;

function makeText(tag, value) {
    // 사용자 입력·서버 본문은 HTML로 해석하지 않고 글자로 넣는다.
    var node = document.createElement(tag);
    node.textContent = value;
    return node;
}

async function readResponse(response) {
    var data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : '입력 내용을 확인하세요.');
    return data;
}

function clearGuide() {
    // 품목/규격/수량이 달라지면 이전 금액을 계속 보여주지 않는다.
    guideRequest += 1;
    document.getElementById('guideResult').replaceChildren();
}

function clearPhoto() {
    // 미리보기용 브라우저 주소도 해제한다. 사진을 검색 기록에 저장하지 않는다.
    photoRevision += 1;
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = null;
    document.getElementById('photoFile').value = '';
    document.getElementById('photoPreview').removeAttribute('src');
    document.getElementById('photoPreview').hidden = true;
    document.getElementById('photoStatus').textContent = '사진을 지웠습니다. 서버에는 저장하지 않았습니다.';
    document.getElementById('visionCandidates').replaceChildren();
}

function showCandidates(candidates) {
    // 공식 ID와 이름은 서버에서 검사했다. 버튼을 누른 사용자가 최종 품목을 고른다.
    var box = document.getElementById('visionCandidates');
    box.replaceChildren();
    if (!candidates.length) return;
    box.append(makeText('p', 'AI 품목 후보 · 실제 물건과 맞는지 확인한 뒤 선택하세요.'));
    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        var card = document.createElement('div'); card.className = 'candidate-card';
        var button = makeText('button', candidate.name + ' 선택');
        button.type = 'button'; button.className = 'candidate-button';
        button.dataset.itemId = candidate.item_id; button.dataset.name = candidate.name;
        button.onclick = async function() {
            var id = this.dataset.itemId;
            var selectedPhoto = photoRevision;
            document.getElementById('itemQuery').value = this.dataset.name;
            await loadItems();
            if (selectedPhoto !== photoRevision) return;
            var select = document.getElementById('itemSelect');
            select.value = id;
            if (select.value) await loadRules();
            select.focus();
        };
        card.append(button);
        if (candidate.reason) card.append(makeText('small', 'AI의 참고 설명: ' + candidate.reason));
        box.append(card);
    }
    box.append(makeText('small', '맞는 후보가 없으면 품목 검색에서 직접 찾아보세요. AI 설명도 틀릴 수 있습니다.'));
}

async function uploadPhoto() {
    var file = document.getElementById('photoFile').files[0];
    var status = document.getElementById('photoStatus');
    if (!file) { status.textContent = '사진을 먼저 선택하세요.'; return; }
    if (file.size > 8 * 1024 * 1024) { status.textContent = '사진을 8MB 이하로 줄여주세요.'; return; }
    var version = photoRevision;
    var button = document.getElementById('uploadPhoto');
    button.disabled = true;
    document.getElementById('visionCandidates').replaceChildren();
    status.textContent = '사진을 확인하고 품목 후보를 찾고 있습니다.';
    try {
        var data = await readResponse(await fetch('/api/vision', {method: 'POST', body: file,
            headers: {'Content-Type': file.type || 'application/octet-stream'}}));
        if (version !== photoRevision) return;
        status.textContent = data.message + ' (' + data.width + ' × ' + data.height + ')';
        status.dataset.state = data.state || '';
        showCandidates(Array.isArray(data.candidates) ? data.candidates : []);
    } catch (error) { if (version === photoRevision) status.textContent = error.message; }
    finally { button.disabled = false; }
}

async function loadItems(event) {
    // 사진 추정명이 아닌 공식 품목 선택값을 다음 단계로 전달한다.
    if (event) event.preventDefault();
    var request = ++itemRequest;
    ruleRequest += 1;
    clearGuide();
    var select = document.getElementById('itemSelect');
    select.replaceChildren();
    document.getElementById('ruleSelect').replaceChildren();
    document.getElementById('itemStatus').textContent = '품목을 조회하고 있습니다.';
    try {
        var query = document.getElementById('itemQuery').value;
        var data = await readResponse(await fetch('/api/disposal/items?q=' + encodeURIComponent(query), {cache: 'no-store'}));
        if (request !== itemRequest) return;
        var placeholder = makeText('option', '품목을 선택하세요'); placeholder.value = ''; select.append(placeholder);
        for (var i = 0; i < data.items.length; i++) {
            var option = makeText('option', data.items[i].name); option.value = data.items[i].item_id; select.append(option);
        }
        document.getElementById('itemStatus').textContent = data.items.length + '품목. 규격과 수량은 직접 확인하세요.';
    } catch (error) { if (request === itemRequest) document.getElementById('itemStatus').textContent = error.message; }
}

async function loadRules() {
    var request = ++ruleRequest;
    clearGuide();
    var select = document.getElementById('ruleSelect'); select.replaceChildren();
    var id = document.getElementById('itemSelect').value;
    if (!id) return;
    try {
        var data = await readResponse(await fetch('/api/disposal/rules?item_id=' + encodeURIComponent(id), {cache: 'no-store'}));
        if (request !== ruleRequest) return;
        var placeholder = makeText('option', '규격을 직접 선택하세요'); placeholder.value = ''; select.append(placeholder);
        for (var i = 0; i < data.rules.length; i++) {
            var row = data.rules[i];
            var option = makeText('option', row.specification + ' · 참고 ' + Number(row.fee_krw).toLocaleString('ko-KR') + '원');
            option.value = row.rule_id; select.append(option);
        }
    } catch (error) { if (request === ruleRequest) document.getElementById('itemStatus').textContent = error.message; }
}

function appendSource(box, row) {
    // 서버가 허용한 공식 URL만 링크로 받는다. 새 창에는 opener를 연결하지 않는다.
    var link = makeText('a', '공식 원문 열기'); link.href = row.source_url; link.target = '_blank'; link.rel = 'noopener';
    box.append(link, makeText('small', '확인일 ' + (row.checked_at || '미확인') + ' · 시행일 ' + (row.effective_from || '원문 미명시')));
}

async function getGuide() {
    clearGuide();
    var request = guideRequest;
    var box = document.getElementById('guideResult');
    var id = document.getElementById('ruleSelect').value;
    if (!id) { box.textContent = '품목과 규격을 먼저 선택하세요.'; return; }
    try {
        var data = await readResponse(await fetch('/api/disposal-guide', {method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({rule_id: id, quantity: Number(document.getElementById('itemQuantity').value)})}));
        if (request !== guideRequest) return;
        box.append(makeText('h3', data.rule.official_name + ' · ' + data.rule.specification));
        box.append(makeText('p', '참고 합계 ' + Number(data.total_krw).toLocaleString('ko-KR') + '원 / ' + data.quantity + '개'));
        box.append(makeText('p', data.rule.source_note || '선택한 규격의 등록 금액입니다.'));
        box.append(makeText('small', '검토 상태: ' + (data.rule.verification_status === 'verified_excerpt' ? '관리자 원문 대조 완료' : '스냅샷 · 현행 금액 재확인 필요')));
        appendSource(box, data.rule);
        box.append(makeText('p', data.notice));
        var link = makeText('a', '공식 배출신고·이용 안내로 이동'); link.href = data.official_url; link.target = '_blank'; link.rel = 'noopener'; box.append(link);
    } catch (error) { if (request === guideRequest) box.textContent = error.message; }
}

async function loadDocuments() {
    try {
        var data = await readResponse(await fetch('/api/disposal/documents', {cache: 'no-store'}));
        var box = document.getElementById('legalDocuments'); box.replaceChildren();
        for (var i = 0; i < data.documents.length; i++) {
            var row = data.documents[i];
            var detail = document.createElement('details');
            detail.append(makeText('summary', row.title));
            var text = makeText('p', row.text); text.className = 'document-text'; detail.append(text);
            appendSource(detail, row); box.append(detail);
        }
        document.getElementById('legalStatus').textContent = '확인한 발췌 ' + data.documents.length + '건 · 신월1동 상세 배출 요일과 수거차 도착 시각은 추가 확인 필요';
    } catch (error) { document.getElementById('legalStatus').textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('photoFile').onchange = function() {
        photoRevision += 1;
        document.getElementById('visionCandidates').replaceChildren();
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        var file = this.files[0];
        var image = document.getElementById('photoPreview'); image.hidden = true; image.removeAttribute('src');
        if (file && ['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) !== -1 && file.size <= 8 * 1024 * 1024) {
            photoUrl = URL.createObjectURL(file); image.src = photoUrl; image.hidden = false;
        }
        document.getElementById('photoStatus').textContent = '사진을 바꿨습니다. 업로드 확인을 눌러주세요.';
    };
    document.getElementById('uploadPhoto').onclick = uploadPhoto;
    document.getElementById('clearPhoto').onclick = clearPhoto;
    document.getElementById('itemSearch').onsubmit = loadItems;
    document.getElementById('itemSelect').onchange = loadRules;
    document.getElementById('ruleSelect').onchange = clearGuide;
    document.getElementById('itemQuantity').oninput = clearGuide;
    document.getElementById('getGuide').onclick = getGuide;
    loadItems(); loadDocuments();
});
