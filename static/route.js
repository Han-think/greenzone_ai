// 입력(거점/폭) → FastAPI 계산 요청 → 순서·거리 표시 → Kakao 선 그리기.
// 화면 동작과 경로 계산을 분리했다. 실제 계산은 route_planner.py를 읽는다.
var routeLayers = [];
var routeRequest = 0;
var routeVisible = false;
var manualRouteOrder = [];

function includedInPlan(feature) {
    // 6곳 보기에서는 A로 시작하는 새 대안 3곳을 숨긴다. 원본 거점은 바꾸지 않는다.
    return document.getElementById('planFilter').value === 'nine' || feature.properties['거점id'].indexOf('A') !== 0;
}

function clearRoute(message) {
    // 조건이 바뀌면 이전 경로와 대기 요청을 무효화해 서로 다른 조건이 섞이지 않게 한다.
    routeRequest += 1;
    for (var i = 0; i < routeLayers.length; i++) routeLayers[i].setMap(null);
    routeLayers = [];
    var wasVisible = routeVisible;
    routeVisible = false;
    if (wasVisible) drawResults();
    document.getElementById('routeResult').replaceChildren();
    document.getElementById('routeStatus').textContent = message || '경로를 지웠습니다.';
}

function refreshRouteStart() {
    // 체크한 거점만 출발지 목록에 남긴다. 체크 변경은 경로를 다시 계산하는 입력이다.
    var select = document.getElementById('routeStart');
    var previous = select.value;
    select.replaceChildren();
    var checks = document.querySelectorAll('#routeStops input');
    for (var i = 0; i < checks.length; i++) {
        if (!checks[i].checked) continue;
        var option = textNode('option', checks[i].dataset.label);
        option.value = checks[i].value;
        select.append(option);
    }
    for (var j = 0; j < select.options.length; j++) {
        if (select.options[j].value === previous) select.value = previous;
    }
    // 선택 해제한 거점만 빼고, 새로 체크한 거점은 현재 직접 순서의 끝에 넣는다.
    var selected = [];
    for (var k = 0; k < checks.length; k++) if (checks[k].checked) selected.push(checks[k].value);
    var nextOrder = [];
    for (var n = 0; n < manualRouteOrder.length; n++) {
        if (selected.indexOf(manualRouteOrder[n]) !== -1) nextOrder.push(manualRouteOrder[n]);
    }
    for (var m = 0; m < selected.length; m++) {
        if (nextOrder.indexOf(selected[m]) === -1) nextOrder.push(selected[m]);
    }
    manualRouteOrder = nextOrder;
    refreshOrderMode();
}

function renderManualOrder() {
    // 번호를 바꿀 때 항목 하나를 이동한다. 다른 거점의 번호는 다시 매겨 중복되지 않는다.
    var box = document.getElementById('manualRouteList');
    box.replaceChildren();
    for (var i = 0; i < manualRouteOrder.length; i++) {
        var id = manualRouteOrder[i];
        var feature = findHub(id);
        var item = document.createElement('li');
        var select = document.createElement('select');
        select.dataset.hubId = id;
        select.setAttribute('aria-label', id + ' 방문 순서');
        for (var j = 0; j < manualRouteOrder.length; j++) {
            var option = textNode('option', (j + 1) + '번'); option.value = j; select.append(option);
        }
        select.value = i;
        select.onchange = function() { moveRouteStop(this.dataset.hubId, Number(this.value)); };
        item.append(select, textNode('span', id + ' · ' + feature.properties['이름']));
        box.append(item);
    }
}

function moveRouteStop(id, position) {
    // splice는 배열에서 한 항목을 빼거나 원하는 위치에 넣는 JavaScript 기본 함수다.
    var previous = manualRouteOrder.indexOf(id);
    if (previous === -1) return;
    manualRouteOrder.splice(previous, 1);
    manualRouteOrder.splice(position, 0, id);
    renderManualOrder();
    document.getElementById('routeStart').value = manualRouteOrder[0] || '';
    clearRoute('방문 순서를 바꿨습니다. 경로안 계산을 눌러주세요.');
}

function refreshOrderMode() {
    // 직접 지정의 1번과 출발지 선택값이 서로 어긋나지 않게 맞춘다.
    var manual = document.getElementById('routeOrderMode').value === 'manual';
    document.getElementById('manualRoutePanel').hidden = !manual;
    document.getElementById('routeStart').disabled = manual;
    if (manual) document.getElementById('routeStart').value = manualRouteOrder[0] || '';
    renderManualOrder();
    clearRoute(manual ? '번호를 정한 뒤 경로안 계산을 누르세요. 1번이 출발 거점입니다.' : '출발 거점을 고른 뒤 자동 경로안을 계산하세요.');
}

function refreshPlan() {
    // 6곳/9곳 보기 전환 때 이전 검색의 점선과 설명을 남기지 않는다.
    clearSearchPoint();
    document.getElementById('selectedBuilding').replaceChildren();
    // 받은 비교표 수치를 표시한다. 화면에서 주거 수요·생활권 분석을 재실행하지 않는다.
    var nine = document.getElementById('planFilter').value === 'nine';
    var comparison = pageData.summary.comparisons[nine ? 1 : 2];
    document.getElementById('planComparison').textContent = '최근접 거점 기준 · 평균 ' + fmt(comparison.mean_m) + 'm / 300m 안 ' + fmt(comparison.coverage_300 * 100) + '%';
    document.getElementById('zoneFilter').disabled = !nine;
    document.getElementById('zoneFilter').value = 'all';
    document.getElementById('planNote').textContent = nine ? '비교표는 최근접 기준입니다. 주민 검색은 자기 생활권 담당 안내를 사용합니다.' : '6곳 배치 비교입니다. 9생활권 색면은 숨깁니다. 주민 검색을 선택하면 9곳 보기로 돌아갑니다.';
    var box = document.getElementById('routeStops');
    box.replaceChildren();
    for (var i = 0; i < pageData.hubs.features.length; i++) {
        var hub = pageData.hubs.features[i];
        if (!includedInPlan(hub)) continue;
        var row = hub.properties;
        var label = document.createElement('label');
        var check = document.createElement('input');
        check.type = 'checkbox'; check.checked = true; check.value = row['거점id'];
        check.dataset.label = '생활권 ' + row['생활권'] + ' · ' + row['거점id'];
        check.setAttribute('aria-label', '수거 선택 ' + row['거점id'] + ' · ' + row['이름']);
        check.onchange = refreshRouteStart;
        label.append(check, document.createTextNode(row['거점id']));
        box.append(label);
    }
    refreshRouteStart();
    renderHubList();
    drawResults();
}

function addRouteLine(coordinates, dashed) {
    // Kakao Polyline은 받은 좌표를 순서대로 잇는 표시 도구다. 경로를 계산하지 않는다.
    var path = [];
    for (var i = 0; i < coordinates.length; i++) path.push(mapPoint(coordinates[i]));
    var line = new kakao.maps.Polyline({path: path, strokeWeight: dashed ? 2 : 5,
        strokeColor: dashed ? '#657784' : '#d56b19', strokeOpacity: 0.9,
        strokeStyle: dashed ? 'shortdash' : 'solid', zIndex: 45});
    line.setMap(map); routeLayers.push(line);
}

function drawRoute(result) {
    // 실선=계산된 도로 경로, 점선=부지 진입을 확인해야 하는 거점↔도로 관계선이다.
    if (!map) return;
    var bounds = new kakao.maps.LatLngBounds();
    for (var i = 0; i < result.legs.length; i++) {
        addRouteLine(result.legs[i].coordinates, false);
        for (var j = 0; j < result.legs[i].coordinates.length; j++) bounds.extend(mapPoint(result.legs[i].coordinates[j]));
    }
    for (var k = 0; k < result.stops.length; k++) {
        var stop = result.stops[k];
        addRouteLine([stop.hub_coordinates, stop.road_coordinates], true);
        bounds.extend(mapPoint(stop.hub_coordinates));
        var number = result.order.indexOf(stop.id) + 1;
        var label = textNode('span', number);
        label.className = number === 1 ? 'route-marker route-start' : 'route-marker';
        label.setAttribute('aria-label', '방문 순서 ' + number + ' · ' + stop.id);
        var marker = new kakao.maps.CustomOverlay({content: label, position: mapPoint(stop.road_coordinates), xAnchor: 0.5, yAnchor: 0.5, zIndex: 50});
        marker.setMap(map); routeLayers.push(marker);
    }
    map.setBounds(bounds, 40, 40, 40, 40);
}

async function calculateRoute() {
    // URLSearchParams는 검색 조건을 URL에 안전하게 넣어주는 브라우저 기본 기능이다.
    clearRoute('경로안을 계산하고 있습니다.');
    var requestNumber = routeRequest;
    var ids = [];
    var checks = document.querySelectorAll('#routeStops input');
    for (var i = 0; i < checks.length; i++) if (checks[i].checked) ids.push(checks[i].value);
    var mode = document.getElementById('routeOrderMode').value;
    if (mode === 'manual') ids = manualRouteOrder.slice();
    var params = new URLSearchParams({ids: ids.join(','), order_mode: mode, start: document.getElementById('routeStart').value,
        min_width: document.getElementById('roadWidthFilter').value, closed: document.getElementById('routeClosed').checked});
    var button = document.getElementById('calculateRoute');
    button.disabled = true;
    try {
        var response = await fetch('/api/route?' + params.toString(), {cache: 'no-store'});
        var result = await response.json();
        if (requestNumber !== routeRequest) return;
        if (!response.ok) throw new Error(result.detail || '경로 조건을 확인하세요.');
        var box = document.getElementById('routeResult');
        box.append(textNode('p', result.order_mode === 'manual' ? '직접 지정한 순서로 연결한 경로안' : '가까운 거점부터 자동으로 연결한 경로안'));
        box.append(textNode('strong', '도로 순회 약 ' + (result.distance_m / 1000).toFixed(2) + 'km'));
        box.append(textNode('p', result.order.join(' → ')));
        var list = document.createElement('ol');
        for (var j = 0; j < result.legs.length; j++) {
            var leg = result.legs[j];
            list.append(textNode('li', leg.from + ' → ' + leg.to + ' · ' + fmt(leg.distance_m) + 'm'));
        }
        box.append(list);
        for (var k = 0; k < result.stops.length; k++) {
            var stop = result.stops[k];
            box.append(textNode('small', stop.id + ' 도로 접속거리 ' + fmt(stop.snap_m) + 'm · 운행거리에서 제외'));
        }
        box.append(textNode('small', result.basis));
        box.append(textNode('small', result.limits));
        document.getElementById('routeStatus').textContent = map ? '지도 번호: 방문 순서 / 주황 실선: 도로 경로 / 회색 점선: 미확인 부지 진입 관계선' : '계산 결과입니다. 지도 표시는 카카오 키·허용 도메인을 확인하세요.';
        routeVisible = true;
        drawResults();
        drawRoute(result);
    } catch (error) {
        if (requestNumber === routeRequest) document.getElementById('routeStatus').textContent = error.message;
    } finally { button.disabled = false; }
}

function openRoutePanel(event) {
    // 상단/왼쪽 메뉴에서 숨겨진 후보 탭과 경로 영역을 한 번에 연다.
    if (event) event.preventDefault();
    showPanel('data');
    var panel = document.getElementById('routeDisclosure');
    panel.open = true;
    panel.scrollIntoView({block: 'start', behavior: 'smooth'});
}

function initializeAnalysis() {
    // 처음 자료를 받았을 때 버튼·필터 동작을 연결한다. 각 클릭은 이 함수들을 실행한다.
    document.getElementById('planFilter').onchange = refreshPlan;
    document.getElementById('routeOrderMode').onchange = refreshOrderMode;
    document.getElementById('roadWidthFilter').onchange = function() {
        clearRoute('도로폭 조건이 바뀌었습니다. 경로안을 다시 계산하세요.'); drawResults();
    };
    document.getElementById('routeStart').onchange = function() { clearRoute('출발 거점이 바뀌었습니다. 다시 계산하세요.'); };
    document.getElementById('routeClosed').onchange = function() { clearRoute('복귀 조건이 바뀌었습니다. 다시 계산하세요.'); };
    document.getElementById('calculateRoute').onclick = calculateRoute;
    document.getElementById('clearRoute').onclick = function() { clearRoute(); };
    document.getElementById('printReport').onclick = function() {
        // 인쇄 버튼은 브라우저의 인쇄/PDF 저장 창을 연다. 파일을 자동 저장하지 않는다.
        document.getElementById('routeDisclosure').open = true;
        window.print();
    };
    refreshPlan();
    document.getElementById('openRoute').disabled = false;
    document.getElementById('openRoute').onclick = openRoutePanel;
    var routeMenu = document.getElementById('navRouteBtn');
    if (routeMenu) routeMenu.onclick = openRoutePanel;
    if (new URLSearchParams(window.location.search).get('view') === 'route') openRoutePanel();
}
