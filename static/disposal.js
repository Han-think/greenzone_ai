// 사진 업로드 → 사람이 품목/규격/수량 확인 → 서버 DB에서 안내 조회.
var photoUrl = null;
var photoRevision = 0;
var itemRequest = 0;
var ruleRequest = 0;
var guideRequest = 0;
var questionRequest = 0;

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
    clearQuestionAnswer();
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

// 사진의 추정 결과는 자동 확정하지 않는다. 맞다고 누른 품목만 연결한다.
async function confirmItem() {
    var version = photoRevision;
    var id = this.dataset.itemId;
    document.getElementById('itemQuery').value = this.dataset.name;
    await loadItems();
    if (version !== photoRevision) return;
    var select = document.getElementById('itemSelect');
    select.value = id;
    if (select.value) await loadRules();
    document.getElementById('itemStatus').textContent = '품목을 확인했습니다. 실제 규격과 수량을 선택하세요.';
    document.getElementById('ruleSelect').focus();
}

function showCandidates(candidates) {
    var box = document.getElementById('visionCandidates');
    box.replaceChildren();
    if (!candidates.length) {
        box.append(makeText('p', '사진만으로 품목을 확인하기 어려워요. 아래에서 직접 찾아주세요.'));
        return;
    }
    for (var i = 0; i < candidates.length; i++) {
        var candidate = candidates[i];
        var card = document.createElement('div'); card.className = 'candidate-card';
        card.append(makeText('strong', i === 0 ? candidate.name + '으로 보입니다. 이 품목이 맞나요?' : '다른 후보: ' + candidate.name));
        var button = makeText('button', i === 0 ? '네, 이 품목이 맞아요' : candidate.name + '으로 변경');
        button.type = 'button'; button.dataset.itemId = candidate.item_id; button.dataset.name = candidate.name;
        button.onclick = confirmItem;
        card.append(button);
        if (candidate.reason) card.append(makeText('small', candidate.reason));
        box.append(card);
    }
    var edit = makeText('button', '아니요, 직접 수정할게요');
    edit.type = 'button'; edit.className = 'secondary-button';
    edit.onclick = function() {
        document.getElementById('itemStatus').textContent = '실제 품목 이름을 검색하고 다시 선택하세요.';
        document.getElementById('itemQuery').focus();
        document.getElementById('itemEditor').scrollIntoView({block: 'center', behavior: 'smooth'});
    };
    box.append(edit);
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

function clearQuestionAnswer() {
    // 선택이 바뀌면 이전 품목의 답변을 그대로 보여주지 않는다.
    questionRequest += 1;
    var messages = document.getElementById('questionResult');
    messages.replaceChildren(makeText('p', '안녕하세요! 버릴 품목이나 신청 방법을 질문해 주세요. 답변에는 확인한 공식 출처를 함께 보여드려요.'));
    var items = document.getElementById('itemSelect');
    var rules = document.getElementById('ruleSelect');
    var context = items && items.value ? items.options[items.selectedIndex].text : '품목 미선택';
    if (rules && rules.value) context += ' · ' + rules.options[rules.selectedIndex].text;
    document.getElementById('questionContext').textContent = '현재 확인할 품목: ' + context;
    document.getElementById('questionStatus').textContent = '';
}

async function askQuestion(event) {
    event.preventDefault();
    var request = ++questionRequest;
    var question = document.getElementById('questionText').value.trim();
    var messages = document.getElementById('questionResult');
    var box = document.createElement('div'); box.className = 'assistant-message';
    var status = document.getElementById('questionStatus');
    var button = document.getElementById('askQuestion');
    if (!question) { status.textContent = '질문을 입력하세요.'; return; }
    var userMessage = makeText('p', question); userMessage.className = 'user-message';
    messages.append(userMessage, box);
    // 화면의 최근 대화만 보관한다. 질문 전체 이력을 서버로 보내지는 않는다.
    while (messages.children.length > 9) messages.firstElementChild.remove();
    box.textContent = '공식 안내를 확인하고 있어요…';
    messages.scrollTop = messages.scrollHeight;
    button.disabled = true;
    status.textContent = '공식 근거를 찾고 있습니다. 처음 검색할 때는 조금 더 걸릴 수 있습니다.';
    try {
        var data = await readResponse(await fetch('/api/disposal/question', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({question: question,
                item_id: document.getElementById('itemSelect').value || null,
                rule_id: document.getElementById('ruleSelect').value || null,
                quantity: Number(document.getElementById('itemQuantity').value), district: '신월1동'})
        }));
        if (request !== questionRequest) return;
        var labels = {answered: '근거 기반 안내', needs_confirmation: '추가 확인이 필요합니다', error: '지금은 답변을 확인하지 못했습니다'};
        status.textContent = labels[data.status] || '처리 결과';
        status.dataset.state = data.status;
        box.replaceChildren();
        var answer = makeText('p', data.answer); answer.className = 'document-text'; box.append(answer);
        var fieldNames = {item_id: '품목', rule_id: '규격', quantity: '수량'};
        if (data.needed_fields && data.needed_fields.length) {
            box.append(makeText('small', '확인할 내용: ' + data.needed_fields.map(function(field) {
                return fieldNames[field] || field;
            }).join(', ')));
        }
        for (var i = 0; i < (data.sources || []).length; i++) {
            var row = data.sources[i];
            var detail = document.createElement('div'); detail.className = 'answer-source';
            detail.append(makeText('strong', row.title));
            appendSource(detail, {source_url: row.url, checked_at: row.checked_at, effective_from: row.effective_from});
            if (row.verification_status === 'seed_snapshot') {
                detail.append(makeText('small', '수수료 스냅샷 · 현행 금액은 공식 신청 화면에서 확인하세요.'));
            }
            box.append(detail);
        }
        box.append(makeText('small', data.notice));
        messages.scrollTop = messages.scrollHeight;
        document.getElementById('questionText').value = '';
    } catch (error) {
        if (request === questionRequest) { status.textContent = error.message; box.textContent = '답변을 가져오지 못했어요. 잠시 후 다시 질문해 주세요.'; }
    } finally { button.disabled = false; }
}

// 작은 화면에서는 두 화면을 번갈아 보고, 큰 화면에서는 나란히 본다.
function showPanel(view) {
    document.querySelector('.disposal-workspace').dataset.view = view;
    document.getElementById('showItems').setAttribute('aria-pressed', view === 'items');
    document.getElementById('showQuestions').setAttribute('aria-pressed', view === 'questions');
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('showItems').onclick = function() { showPanel('items'); };
    document.getElementById('showQuestions').onclick = function() { showPanel('questions'); };
    document.getElementById('questionAboutItem').onclick = function() {
        showPanel('questions'); document.getElementById('questionText').focus();
    };
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
    document.getElementById('questionForm').onsubmit = askQuestion;
    document.getElementById('clearQuestion').onclick = function() {
        document.getElementById('questionText').value = ''; clearQuestionAnswer();
    };
    loadItems(); loadDocuments();
});
