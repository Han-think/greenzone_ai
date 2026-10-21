// 입력(거점/폭) → FastAPI 계산 요청 → 순서·거리 표시 → Kakao 선 그리기.
// 화면 동작과 경로 계산을 분리했다. 실제 계산은 route_planner.py를 읽는다.
var routeLayers = [];
var routeRequest = 0;
var routeVisible = false;

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
    clearRoute('선택 조건이 바뀌었습니다. 경로안 계산을 누르세요.');
}

function refreshPlan() {
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
    var params = new URLSearchParams({ids: ids.join(','), start: document.getElementById('routeStart').value,
        min_width: document.getElementById('roadWidthFilter').value, closed: document.getElementById('routeClosed').checked});
    var button = document.getElementById('calculateRoute');
    button.disabled = true;
    try {
        var response = await fetch('/api/route?' + params.toString(), {cache: 'no-store'});
        var result = await response.json();
        if (requestNumber !== routeRequest) return;
        if (!response.ok) throw new Error(result.detail || '경로 조건을 확인하세요.');
        var box = document.getElementById('routeResult');
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

function initializeAnalysis() {
    // 처음 자료를 받았을 때 버튼·필터 동작을 연결한다. 각 클릭은 이 함수들을 실행한다.
    document.getElementById('planFilter').onchange = refreshPlan;
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
}
