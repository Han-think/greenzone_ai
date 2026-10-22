// 지도 담당: Kakao SDK에 저장 좌표와 GeoJSON 도형을 전달한다.
// 지도 제공 함수는 입력과 출력부터 읽으면 된다.
var map;
var studyBounds;
var resultLayers = [];
var searchMarker;
var selectedPopup;
var addressGeocoder;
var mapAddressRequest = 0;
var mapRelayoutTimer = null;
var mapResizeObserver = null;
var zoneColors = ['#c4d8eb', '#e8d1bd', '#c4dfcf', '#dbceeb', '#e9cbd2', '#d8dfbd', '#bfe0e4', '#e7d9bc', '#cdd2e7'];

// 팀 지도 브랜치의 거리/점선 함수. 원래 배정은 유지하고 두 대표점의 관계만 표시한다.
var searchDistanceLine = null;

// [계산용] 카카오맵 좌표 2개를 받아 거리(m)만 계산
function getDistanceMath(startLatLng, endLatLng) {
    var poly = new kakao.maps.Polyline({
        path: [startLatLng, endLatLng]
    });
    return poly.getLength();
}

// [그리기용] 카카오맵 좌표 2개를 받아 빨간 점선을 그림
function drawDistanceLine(startLatLng, endLatLng) {
    if (!map) return;
    if (searchDistanceLine) {
        searchDistanceLine.setMap(null);
    }
    searchDistanceLine = new kakao.maps.Polyline({
        path: [startLatLng, endLatLng],
        strokeWeight: 4,           // 💡 잘 보이게 두께 4
        strokeColor: '#c2413a',    // 수거 도로 경로(주황)와 구분하는 빨간 점선
        strokeOpacity: 0.9,
        strokeStyle: 'shortdash', 
        zIndex: 45                // 일반 도형보다 위, 팝업보다 아래
    });
    
    // 3. 지도에 실제로 보이게 그립니다!
    searchDistanceLine.setMap(map);
    
    // 4. 거리를 반환합니다.
    return searchDistanceLine.getLength();
}

// GeoJSON 좌표를 카카오 지도 좌표 객체로 바꾼다.
function mapPoint(coordinates) {
    // 제공 연결: GeoJSON [경도, 위도]를 Kakao LatLng(위도, 경도)로 바꾼다.
    return new kakao.maps.LatLng(coordinates[1], coordinates[0]);
}

// 생활권 보기 선택과 해당 자료의 생활권이 같은지 확인한다.
function matchesZone(zone) {
    var selected = document.getElementById('zoneFilter').value;
    return selected === 'all' || Number(selected) === zone;
}

// 기존 표시 도형을 지운다. 경로 전용 도형은 route.js에서 따로 관리한다.
function clearResults() {
    for (var i = 0; i < resultLayers.length; i++) {
        resultLayers[i].setMap(null);
    }
    resultLayers = [];
    closeSelectedPopup();
}

// 받은 다각형 좌표를 Kakao Polygon으로 표시한다.
function addGeometry(geometry, color, opacity) {
    // 제공 연결: 팀 경계·생활권의 Polygon/MultiPolygon을 지도에 그린다.
    if (geometry.type === 'MultiPolygon') {
        for (var i = 0; i < geometry.coordinates.length; i++) {
            addGeometry({type: 'Polygon', coordinates: geometry.coordinates[i]}, color, opacity);
        }
        return;
    }
    var rings = [];
    for (var j = 0; j < geometry.coordinates.length; j++) {
        var path = [];
        for (var k = 0; k < geometry.coordinates[j].length; k++) {
            path.push(mapPoint(geometry.coordinates[j][k]));
        }
        rings.push(path);
    }
    var polygon = new kakao.maps.Polygon({path: rings, strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: opacity});
    polygon.setMap(map);
    kakao.maps.event.addListener(polygon, 'click', function(event) {
        kakao.maps.event.preventMap();
        showClickedAddress(event.latLng);
    });
    resultLayers.push(polygon);
}

// 받은 신월1동 경계를 모두 볼 수 있도록 지도 범위를 맞춘다.
function showStudyArea() {
    if (map) map.setBounds(studyBounds, 20, 20, 20, 20);
}

// 다각형의 모든 점을 담는 Kakao 지도 범위를 만든다.
function geometryBounds(geometry) {
    // 제공 SDK 연결: 다각형을 모두 담는 지도 범위를 구한다.
    var bounds = new kakao.maps.LatLngBounds();
    var polygons = geometry.coordinates;
    if (geometry.type === 'Polygon') polygons = [geometry.coordinates];
    for (var i = 0; i < polygons.length; i++) {
        for (var j = 0; j < polygons[i][0].length; j++) {
            bounds.extend(mapPoint(polygons[i][0][j]));
        }
    }
    return bounds;
}

// 선택한 생활권의 경계를 찾아 지도 범위를 맞춘다.
function showSelectedZone() {
    if (!map) return;
    var selected = document.getElementById('zoneFilter').value;
    if (selected === 'all') {
        showStudyArea();
        return;
    }
    for (var i = 0; i < pageData.zones.features.length; i++) {
        var zone = pageData.zones.features[i];
        if (zone.properties['생활권'] === Number(selected)) {
            map.setBounds(geometryBounds(zone.geometry), 20, 20, 20, 20);
        }
    }
}

function closeSelectedPopup() {
    if (!selectedPopup) return;
    selectedPopup.setMap(null);
    selectedPopup = null;
}

// 좌표에 반투명한 설명 창을 표시해 지도 선과 위치를 함께 볼 수 있게 한다.
function showPointPopup(point, text) {
    closeSelectedPopup();
    var content = textNode('div', '');
    content.className = 'map-popup';
    content.setAttribute('role', 'status');
    var popupText = textNode('span', text);
    popupText.className = 'map-popup-text';
    content.append(popupText);
    var closeButton = textNode('button', '×');
    closeButton.type = 'button';
    closeButton.className = 'map-popup-close';
    closeButton.setAttribute('aria-label', '팝업 닫기');
    var popup = new kakao.maps.CustomOverlay({
        position: mapPoint(point),
        content: content,
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: 100,
        clickable: true
    });
    closeButton.onclick = function() {
        popup.setMap(null);
        if (selectedPopup === popup) selectedPopup = null;
    };
    content.append(closeButton);
    selectedPopup = popup;
    popup.setMap(map);
}

// 거점 ID로 상세 정보를 찾고 지도를 해당 위치로 옮긴다.
function openHub(id) {
    var feature = findHub(id);
    if (!feature) return;
    document.getElementById('zoneFilter').value = feature.properties['생활권'];
    renderHubList();
    drawResults();
    showHubDetail(feature);
    if (!map) return;
    map.setLevel(3);
    map.panTo(mapPoint(feature.geometry.coordinates));
    showPointPopup(feature.geometry.coordinates, feature.properties['이름'] + ' / 분석 제안, 운영 승인 전');
}

// 주거 필지 대표점을 작은 원으로 그린다.
function drawBuilding(row) {
    // 제공 SDK 연결: 필지 한 개를 그린다. 클릭하면 그 필지의 정보를 표시한다.
    var dot = new kakao.maps.Circle({center: mapPoint(row.coordinates), radius: 3, strokeWeight: 0, fillColor: '#397d66', fillOpacity: 0.7});
    kakao.maps.event.addListener(dot, 'click', function() {
        kakao.maps.event.preventMap();
        selectBuilding(row);
    });
    dot.setMap(map);
    resultLayers.push(dot);
}

// 원본 후보나 예비 대안을 보조 마커로 표시한다.
function drawReference(feature, label, color, description) {
    // 보조 마커: 1차 후보 또는 대안 2·3순위. 거점안을 바꾸는 기능은 아니다.
    var button = textNode('button', label);
    button.type = 'button';
    button.className = 'map-dot reference-dot';
    button.style.background = color;
    button.setAttribute('aria-label', description);
    button.onclick = function() {
        kakao.maps.event.preventMap();
        showPointPopup(feature.geometry.coordinates, description);
    };
    var marker = new kakao.maps.CustomOverlay({content: button, position: mapPoint(feature.geometry.coordinates), xAnchor: 0.5, yAnchor: 0.5, zIndex: 20});
    marker.setMap(map);
    resultLayers.push(marker);
}

// 현재 거점안을 생활권 번호 마커로 표시한다.
function drawHub(feature) {
    var row = feature.properties;
    var button = textNode('button', row['생활권']);
    button.type = 'button';
    button.className = 'map-dot';
    button.setAttribute('aria-label', '생활권 ' + row['생활권'] + ' · ' + row['거점id'] + ' · ' + row['이름']);
    if (row['거점id'].indexOf('A') === 0) button.classList.add('alternative-dot');
    button.onclick = function() {
        kakao.maps.event.preventMap();
        openHub(row['거점id']);
    };
    var marker = new kakao.maps.CustomOverlay({content: button, position: mapPoint(feature.geometry.coordinates), xAnchor: 0.5, yAnchor: 0.5, zIndex: 30});
    marker.setMap(map);
    resultLayers.push(marker);
}

// 현재 표시 조건에 따라 도형과 마커를 다시 그린다.
function drawResults() {
    if (!map || !pageData) return;
    clearResults();
    addGeometry(pageData.boundary.features[0].geometry, '#34785d', 0);
    drawAnalysisLayers();
    for (var i = 0; i < pageData.zones.features.length; i++) {
        var zone = pageData.zones.features[i];
        if (document.getElementById('planFilter').value === 'nine' && matchesZone(zone.properties['생활권'])) {
            addGeometry(zone.geometry, zoneColors[zone.properties['생활권'] - 1], 0.4);
        }
    }
    if (document.getElementById('showHouseholds').checked) {
        for (var j = 0; j < pageData.buildings.length; j++) {
            if (matchesZone(pageData.buildings[j].zone)) drawBuilding(pageData.buildings[j]);
        }
    }
    if (document.getElementById('showOriginal').checked) {
        for (var k = 0; k < pageData.candidates.features.length; k++) {
            var candidate = pageData.candidates.features[k];
            var data = candidate.properties;
            if (matchesZone(data['생활권'])) {
                drawReference(candidate, data.id, '#7a837e', data.id + ' · ' + data['이름'] + ' / 2차 역할: ' + data['역할']);
            }
        }
    }
    if (document.getElementById('showAlternatives').checked) {
        for (var n = 0; n < pageData.alternatives.features.length; n++) {
            var alternative = pageData.alternatives.features[n];
            var item = alternative.properties;
            if (item['용도'] === '대안' && item['순위'] > 1 && matchesZone(item['생활권'])) {
                drawReference(alternative, item.id, '#ab6425', item.id + ' · ' + item['가까운_건물주소'] + ' / 현장 확인 필요');
            }
        }
    }
    for (var m = 0; m < pageData.hubs.features.length; m++) {
        var hub = pageData.hubs.features[m];
        // 경로 표시 중에는 생활권 번호 대신 방문 순서만 보여, 두 종류의 번호를 섞지 않는다.
        if (!routeVisible && includedInPlan(hub) && matchesZone(hub.properties['생활권'])) drawHub(hub);
    }
    var numberMeaning = routeVisible ? '지도 숫자는 방문 순서' : '지도 숫자는 생활권 번호';
    document.getElementById('mapStatus').textContent = document.getElementById('planFilter').selectedOptions[0].text + ' · ' + numberMeaning + ' · 실제 차량 통행은 미확인';
}

function drawAnalysisLayers() {
    // 받은 도로를 필터링해 그린다. 화면 표시만 바꾸며 기존 생활권·배출량은 바꾸지 않는다.
    if (document.getElementById('showProtection').checked) {
        for (var i = 0; i < pageData.protection.features.length; i++) {
            addGeometry(pageData.protection.features[i].geometry, '#bb6570', 0.08);
        }
    }
    if (!document.getElementById('showRoads').checked) return;
    var minimum = Number(document.getElementById('roadWidthFilter').value);
    for (var j = 0; j < pageData.roads.features.length; j++) {
        var road = pageData.roads.features[j];
        if (Number(road.properties['도로폭_m']) < minimum) continue;
        var path = [];
        for (var k = 0; k < road.geometry.coordinates.length; k++) path.push(mapPoint(road.geometry.coordinates[k]));
        var line = new kakao.maps.Polyline({path: path, strokeWeight: 3, strokeColor: '#638b9c', strokeOpacity: 0.6});
        line.setMap(map); resultLayers.push(line);
    }
}

// 검색한 위치 표시와 대기 중인 클릭 주소 요청을 초기화한다.
function clearSearchPoint() {
    mapAddressRequest += 1;
    if (searchMarker) searchMarker.setMap(null);
    closeSelectedPopup();

    // 💡 검색 초기화 시, 우리가 그렸던 점선도 같이 지도에서 지워주기!
    if (searchDistanceLine) {
        searchDistanceLine.setMap(null);
        searchDistanceLine = null;
    }
}

// 팀의 지도 클릭 주소 표시를 같은 카카오 JavaScript 키의 좌표→주소 기능으로 연결한다.
// 클릭한 주소를 보유 필지의 담당 거점으로 임의 배정하지 않는다.
// 카카오 좌표→주소 기능을 호출한다. 담당 생활권 배정과는 별개다.
function showClickedAddress(position) {
    if (!addressGeocoder) return;
    mapAddressRequest += 1;
    var requestNumber = mapAddressRequest;
    document.getElementById('mapStatus').textContent = '선택한 좌표의 주소를 확인하는 중입니다.';
    addressGeocoder.coord2Address(position.getLng(), position.getLat(), function(result, status) {
        if (requestNumber !== mapAddressRequest) return;
        if (status !== kakao.maps.services.Status.OK || result.length === 0) {
            document.getElementById('mapStatus').textContent = '선택 위치의 주소를 확인하지 못했습니다. 보유 주소·건물명으로 검색할 수 있습니다.';
            return;
        }
        var row = result[0];
        var address = '';
        if (row.road_address) address = row.road_address.address_name;
        if (!address && row.address) address = row.address.address_name;
        if (!address) return;
        clearSearchPoint();
        var point = [position.getLng(), position.getLat()];
        searchMarker = new kakao.maps.Circle({center: position, radius: 6, strokeColor: '#fff', strokeWeight: 3, fillColor: '#2469c6', fillOpacity: 1, zIndex: 40});
        searchMarker.setMap(map);
        showPointPopup(point, address + ' / 지도에서 선택한 위치');
        showPanel('search');
        var box = document.getElementById('selectedBuilding');
        box.replaceChildren(textNode('h3', '지도에서 선택한 위치'), textNode('p', address));
        if (row.address && row.road_address) box.append(textNode('p', '지번: ' + row.address.address_name));
        box.append(textNode('small', '위도 ' + position.getLat().toFixed(6) + ', 경도 ' + position.getLng().toFixed(6)));
        
        // ==========================================
        // 💡 [여기 추가] 모든 거점 중 가장 가까운 거점 찾기
        if (pageData && pageData.hubs) {
            var minDistance = Infinity;
            var closestHub = null;
            var startLatLng = position; // 지도를 클릭한 곳의 좌표(이미 카카오맵 좌표 포맷임)

            // 루프 돌면서 순수하게 제일 짧은 거리만 찾기
            for (var i = 0; i < pageData.hubs.features.length; i++) {
                var hub = pageData.hubs.features[i];
                if (!includedInPlan(hub)) continue; 
                var targetCoords = hub.geometry.coordinates;
                var endLatLng = new kakao.maps.LatLng(targetCoords[1], targetCoords[0]);
                // 💡 여기서는 그리지 않고 숫자만 받습니다.
                var dist = getDistanceMath(startLatLng, endLatLng); 
                if (dist < minDistance) {
                    minDistance = dist;
                    closestHub = hub;
                }
            }
            
            // 제일 가까운 거점을 찾았다면 선을 긋습니다!
            if (closestHub) {
                var finalCoords = closestHub.geometry.coordinates;
                var finalEndLatLng = new kakao.maps.LatLng(finalCoords[1], finalCoords[0]);

                drawDistanceLine(startLatLng, finalEndLatLng); // 💡 여기서 최종 그리기!
                
                var hubProps = closestHub.properties;
                box.append(textNode('p', '표시 중인 거점안에서 직선으로 가까운 참고 거점: ' + hubProps['이름'] + ' (생활권 ' + hubProps['생활권'] + ')'));
                box.append(textNode('p', '직선거리: 약 ' + fmt(minDistance) + 'm'));
            }
        }
        // ==========================================
        
        box.append(textNode('small', '빨간 점선은 직선 관계선이며 보행·수거 경로가 아닙니다. 담당 거점안은 보유 건물 검색에서 확인하세요.'));
        box.scrollIntoView({block: 'nearest'});
        document.getElementById('mapStatus').textContent = '선택 주소: ' + address;
    });
}

// 선택한 보유 건물의 좌표를 지도에서 강조한다.
function showSearchPoint(building) {
    if (!map) return;
    clearSearchPoint();
    searchMarker = new kakao.maps.Circle({center: mapPoint(building.coordinates), radius: 6, strokeColor: '#fff', strokeWeight: 3, fillColor: '#2469c6', fillOpacity: 1, zIndex: 40});
    searchMarker.setMap(map);
    map.setLevel(3);
    map.panTo(mapPoint(building.coordinates));
    showPointPopup(building.coordinates, building.address + ' / 주거 필지 대표점');
}

// 카카오 SDK가 준비되면 지도를 만들고 첫 결과를 표시한다.
function initializeMap() {
    if (!window.kakao || !kakao.maps) {
        document.getElementById('mapStatus').textContent = '카카오 JavaScript 키와 허용 웹 도메인을 확인하세요. http://localhost:8000/으로 접속하고, 보유 데이터 검색도 사용할 수 있습니다.';
        return;
    }
    // 지도와 클릭 좌표→주소 확인은 같은 JavaScript 키를 사용한다. 검색창은 보유 데이터를 쓴다.
    kakao.maps.load(function() {
        map = new kakao.maps.Map(document.getElementById('map'), {center: new kakao.maps.LatLng(37.533, 126.835), level: 5});
        if (window.ResizeObserver) {
            mapResizeObserver = new ResizeObserver(scheduleMapRelayout);
            mapResizeObserver.observe(document.getElementById('map'));
        }
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        if (kakao.maps.services) addressGeocoder = new kakao.maps.services.Geocoder();
        kakao.maps.event.addListener(map, 'click', function(event) { showClickedAddress(event.latLng); });
        studyBounds = geometryBounds(pageData.boundary.features[0].geometry);
        drawResults();
        showStudyArea();
    });
}

function relayoutMap() {
    if (!map) return;
    var center = map.getCenter();
    map.relayout();
    map.setCenter(center);
}

function scheduleMapRelayout() {
    if (mapRelayoutTimer) window.clearTimeout(mapRelayoutTimer);
    // Orientation changes and sidebar transitions can report intermediate sizes.
    mapRelayoutTimer = window.setTimeout(function() {
        window.requestAnimationFrame(function() {
            window.requestAnimationFrame(relayoutMap);
        });
    }, 280);
}

window.addEventListener('resize', scheduleMapRelayout);
window.addEventListener('orientationchange', scheduleMapRelayout);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleMapRelayout);
}
