// 지도 담당: Kakao SDK에 저장 좌표와 GeoJSON 도형을 전달한다.
// 지도 제공 함수는 입력과 출력부터 읽으면 된다.
var map;
var studyBounds;
var resultLayers = [];
var searchMarker;
var selectedPopup;
var zoneColors = ['#c4d8eb', '#e8d1bd', '#c4dfcf', '#dbceeb', '#e9cbd2', '#d8dfbd', '#bfe0e4', '#e7d9bc', '#cdd2e7'];

function mapPoint(coordinates) {
    // 제공 연결: GeoJSON [경도, 위도]를 Kakao LatLng(위도, 경도)로 바꾼다.
    return new kakao.maps.LatLng(coordinates[1], coordinates[0]);
}

function matchesZone(zone) {
    var selected = document.getElementById('zoneFilter').value;
    return selected === 'all' || Number(selected) === zone;
}

function clearResults() {
    for (var i = 0; i < resultLayers.length; i++) {
        resultLayers[i].setMap(null);
    }
    resultLayers = [];
    if (selectedPopup) selectedPopup.close();
}

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
    resultLayers.push(polygon);
}

function showStudyArea() {
    if (map) map.setBounds(studyBounds, 20, 20, 20, 20);
}

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

function showPointPopup(point, text) {
    if (selectedPopup) selectedPopup.close();
    var content = textNode('p', text);
    content.className = 'map-popup';
    selectedPopup = new kakao.maps.InfoWindow({position: mapPoint(point), content: content, removable: true});
    selectedPopup.open(map);
}

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

function drawBuilding(row) {
    // 제공 SDK 연결: 필지 한 개를 그린다. 클릭하면 그 필지의 정보를 표시한다.
    var dot = new kakao.maps.Circle({center: mapPoint(row.coordinates), radius: 3, strokeWeight: 0, fillColor: '#397d66', fillOpacity: 0.7});
    kakao.maps.event.addListener(dot, 'click', function() { selectBuilding(row); });
    dot.setMap(map);
    resultLayers.push(dot);
}

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

function drawResults() {
    if (!map || !pageData) return;
    clearResults();
    addGeometry(pageData.boundary.features[0].geometry, '#34785d', 0);
    for (var i = 0; i < pageData.zones.features.length; i++) {
        var zone = pageData.zones.features[i];
        if (matchesZone(zone.properties['생활권'])) {
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
        if (matchesZone(hub.properties['생활권'])) drawHub(hub);
    }
    document.getElementById('mapStatus').textContent = document.getElementById('zoneFilter').selectedOptions[0].text + ' · 숫자는 생활권 번호. 초록: 기존 후보 / 주황: 새 대안';
}

function clearSearchPoint() {
    if (searchMarker) searchMarker.setMap(null);
    if (selectedPopup) selectedPopup.close();
}

function showSearchPoint(building) {
    if (!map) return;
    clearSearchPoint();
    searchMarker = new kakao.maps.Circle({center: mapPoint(building.coordinates), radius: 6, strokeColor: '#fff', strokeWeight: 3, fillColor: '#2469c6', fillOpacity: 1, zIndex: 40});
    searchMarker.setMap(map);
    map.setLevel(3);
    map.panTo(mapPoint(building.coordinates));
    showPointPopup(building.coordinates, building.address + ' / 주거 필지 대표점');
}

function initializeMap() {
    if (!window.kakao || !kakao.maps) {
        document.getElementById('mapStatus').textContent = '카카오 JavaScript 키와 허용 도메인 localhost:8003을 확인하세요. 보유 데이터 검색은 사용할 수 있습니다.';
        return;
    }
    // 제공 SDK 연결: 키는 지도 표시에만 사용하며 주소검색 services는 요청하지 않는다.
    kakao.maps.load(function() {
        map = new kakao.maps.Map(document.getElementById('map'), {center: new kakao.maps.LatLng(37.533, 126.835), level: 5});
        map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
        studyBounds = geometryBounds(pageData.boundary.features[0].geometry);
        drawResults();
        showStudyArea();
    });
}

window.addEventListener('resize', function() {
    if (map) map.relayout();
});
