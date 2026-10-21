// 이 화면은 받은 결과의 표시만 담당한다. 재분석·경로 계산은 호출하지 않는다.
// Leaflet의 L은 지도 라이브러리가 제공하는 이름이다. 기존 카카오 화면과 별도로 쓴다.
var analysisMap;
var analysisData;
var analysisLayers;
var analysisBoundary;
// Python이 보낸 공통 색 목록이다. Folium·범례와 생활권 번호별 색을 맞춘다.
var analysisZoneColors = JSON.parse(document.getElementById('analysisColors').textContent);

function reportText(tag, text) {
    // 받은 이름·주소를 HTML로 해석하지 않고 글자로 넣는다.
    var element = document.createElement(tag);
    element.textContent = text;
    return element;
}

function reportPopup(title, lines) {
    // 마커를 눌렀을 때 표시할 설명 상자를 만든다.
    var box = document.createElement('div');
    box.append(reportText('strong', title));
    for (var i = 0; i < lines.length; i++) box.append(reportText('p', lines[i]));
    return box;
}

function reportZoneMatches(zone) {
    // 선택한 생활권의 자료인지 확인한다. 전체 보기이면 모두 표시한다.
    var selected = document.getElementById('analysisZone').value;
    return selected === 'all' || Number(selected) === Number(zone);
}

function reportPlanIncludes(feature) {
    // 6곳 비교에서는 새 대안 A4-1/A6-1/A7-1을 숨긴다. 원본은 바꾸지 않는다.
    return document.getElementById('analysisPlan').value === 'nine' || feature.properties['거점id'].indexOf('A') !== 0;
}

function fitAnalysis() {
    // 보기 버튼·생활권 변경 때만 범위를 맞춘다. 체크만 바꿀 때 확대 상태는 유지한다.
    if (!analysisMap) return;
    var selected = document.getElementById('analysisZone').value;
    for (var i = 0; i < analysisData.zones.features.length; i++) {
        var zone = analysisData.zones.features[i];
        if (Number(selected) === zone.properties['생활권']) {
            analysisMap.fitBounds(L.geoJSON(zone).getBounds(), {padding:[24,24]});
            return;
        }
    }
    analysisMap.fitBounds(analysisBoundary, {padding:[24,24]});
}

function addReportPoint(feature, color, radius, popup) {
    // Leaflet은 [위도, 경도]를 받으므로 GeoJSON [경도, 위도]의 순서를 바꾼다.
    var coordinate = feature.geometry.coordinates;
    var marker = L.circleMarker([coordinate[1], coordinate[0]], {
        radius:radius, color:'#ffffff', weight:1, fillColor:color, fillOpacity:0.95});
    marker.bindPopup(popup);
    marker.addTo(analysisLayers);
    return marker;
}

function addHubBadge(feature, popup) {
    // 거점 번호를 마커 안에 넣는다. 기존 후보는 초록 원, 새 대안은 주황 사각형이다.
    var row = feature.properties;
    var badge = reportText('span', row['생활권']);
    badge.className = 'hub-badge existing-hub';
    if (row['거점id'].indexOf('A') === 0) badge.className = 'hub-badge alternative-hub';
    var coordinate = feature.geometry.coordinates;
    var icon = L.divIcon({html:badge, className:'hub-icon', iconSize:[32,32], iconAnchor:[16,16]});
    var marker = L.marker([coordinate[1],coordinate[0]], {icon:icon, zIndexOffset:1000,
        title:'생활권 ' + row['생활권'] + ' · ' + row['거점id'], alt:'생활권 ' + row['생활권'] + ' 거점안'});
    marker.bindPopup(popup);
    marker.bindTooltip(reportText('span', row['거점id'] + ' · ' + row['이름']));
    marker.addTo(analysisLayers);
}

function drawAnalysis() {
    // 체크된 자료만 다시 그린다. 데이터 파일·후보 선정·거리표를 수정하지 않는다.
    if (!analysisMap || !analysisData) return;
    analysisMap.closePopup();
    analysisLayers.clearLayers();
    var nine = document.getElementById('analysisPlan').value === 'nine';
    var counts = {hubs:0, roads:0, buildings:0};
    L.geoJSON(analysisData.boundary, {style:{color:'#173b4b',weight:3,fillOpacity:0},interactive:false}).addTo(analysisLayers);
    if (document.getElementById('layerZones').checked && nine) {
        for (var i = 0; i < analysisData.zones.features.length; i++) {
            var zone = analysisData.zones.features[i];
            if (!reportZoneMatches(zone.properties['생활권'])) continue;
            var zoneColor = analysisZoneColors[Number(zone.properties['생활권']) - 1];
            var shape = L.geoJSON(zone, {style:{color:zoneColor,weight:2,fillColor:zoneColor,fillOpacity:0.28}});
            shape.bindPopup(reportPopup('생활권 ' + zone.properties['생활권'], ['팀이 제안한 9생활권 경계입니다.']));
            shape.addTo(analysisLayers);
        }
    }
    if (document.getElementById('layerProtection').checked) {
        for (var j = 0; j < analysisData.protection.features.length; j++) {
            var protection = analysisData.protection.features[j];
            var area = L.geoJSON(protection, {style:{color:'#dc2626',weight:2,dashArray:'7 5',fillOpacity:0.12}});
            area.bindPopup(reportPopup(protection.properties['시설명'] || '보호시설', ['시설 중심 반경 200m 분석 가정. 법정 경계 확정값이 아닙니다.']));
            area.addTo(analysisLayers);
        }
    }
    if (document.getElementById('layerRoads').checked) {
        var minimum = Number(document.getElementById('analysisWidth').value);
        for (var k = 0; k < analysisData.roads.features.length; k++) {
            var road = analysisData.roads.features[k];
            if (Number(road.properties['도로폭_m']) < minimum) continue;
            var line = L.geoJSON(road, {style:{color:'#075985',weight:3,opacity:0.9}});
            line.bindPopup(reportPopup(road.properties['도로명'] || '도로명 없음', ['등록폭 ' + road.properties['도로폭_m'] + 'm', '현장 유효폭·차량 통행은 별도 확인이 필요합니다.']));
            line.addTo(analysisLayers); counts.roads += 1;
        }
    }
    if (document.getElementById('layerBuildings').checked) {
        for (var n = 0; n < analysisData.buildings.length; n++) {
            var building = analysisData.buildings[n];
            if (!reportZoneMatches(building.zone)) continue;
            var point = {geometry:{coordinates:building.coordinates}};
            addReportPoint(point, analysisZoneColors[Number(building.zone) - 1], 2.5, reportPopup(building.name || building.address,
                [building.address, '생활권 ' + building.zone + ' · 담당 거점안 ' + building.hub_id, building.units + ' 등록 주거단위 · 관측 배출량 아님']));
            counts.buildings += 1;
        }
    }
    if (document.getElementById('layerOriginal').checked) {
        for (var a = 0; a < analysisData.candidates.features.length; a++) {
            var candidate = analysisData.candidates.features[a];
            if (!reportZoneMatches(candidate.properties['생활권'])) continue;
            addReportPoint(candidate, '#475569', 6, reportPopup(candidate.properties.id + ' · ' + candidate.properties['이름'], ['1차 후보 · 2차 역할: ' + candidate.properties['역할']]));
        }
    }
    if (document.getElementById('layerAlternatives').checked) {
        for (var b = 0; b < analysisData.alternatives.features.length; b++) {
            var alternative = analysisData.alternatives.features[b];
            var item = alternative.properties;
            if (item['용도'] !== '대안' || item['순위'] < 2 || !reportZoneMatches(item['생활권'])) continue;
            addReportPoint(alternative, '#7c3aed', 6, reportPopup(item.id, [item['가까운_건물주소'] || '', '대안 ' + item['순위'] + '순위 · 현장 확인 필요']));
        }
    }
    if (document.getElementById('layerHubs').checked) {
        for (var c = 0; c < analysisData.hubs.features.length; c++) {
            var hub = analysisData.hubs.features[c];
            var row = hub.properties;
            if (!reportPlanIncludes(hub) || !reportZoneMatches(row['생활권'])) continue;
            // G01의 등록폭과 도형 단면 추정폭은 다르다. 기존 카카오 상세와 같은 설명을 쓴다.
            var widthBasis = row['도로폭_기준'];
            if (row['거점id'] === 'G01') widthBasis = '등록폭 우선(1차 코드)';
            var lines = ['생활권 ' + row['생활권'] + ' · ' + row['담당세대'] + ' 등록 주거단위',
                '팀 판정 도로폭 ' + row['도로폭_m'] + 'm (' + widthBasis + ')',
                '보호시설까지 ' + row['보호시설까지_m'] + 'm · 운영 승인 전 제안'];
            if (row['거점id'] === 'G01') lines.push('등록폭 8m / 도로 도형 단면 추정 5.3m. 현장 유효폭은 미확인입니다.');
            addHubBadge(hub, reportPopup(row['거점id'] + ' · ' + row['이름'], lines));
            counts.hubs += 1;
        }
    }
    document.getElementById('analysisStatus').textContent = '표시 중 · 거점안 ' + counts.hubs + '곳 · 도로 ' + counts.roads + '구간 · 주거 필지 ' + counts.buildings + '곳';
}

function changeAnalysisPlan() {
    // 비교 수치는 같은 결과 엑셀의 6곳/9곳 최근접 거점 행에서 읽는다.
    var nine = document.getElementById('analysisPlan').value === 'nine';
    var result = analysisData.summary.comparisons[nine ? 1 : 2];
    document.getElementById('analysisMean').textContent = result.mean_m.toFixed(1) + 'm';
    document.getElementById('analysisCoverage').textContent = (result.coverage_300 * 100).toFixed(1) + '%';
    document.getElementById('analysisZone').disabled = !nine;
    document.getElementById('analysisZone').value = 'all';
    document.getElementById('layerZones').disabled = !nine;
    document.getElementById('analysisNote').textContent = nine ? '도로폭은 도로선의 표시 조건입니다. 거점 위치를 다시 선정하지 않습니다.' : '6곳 비교에서는 9생활권 색면을 숨깁니다. 원본 생활권·배정은 변경하지 않습니다.';
    drawAnalysis(); fitAnalysis();
}

async function initializeReport() {
    // 기존 API에서 같은 자료를 읽고, 체크와 지도 표시를 연결한다. 새 API 키는 쓰지 않는다.
    // 작은 화면에서는 필터를 접어 지도를 먼저 보여준다. 제목을 누르면 다시 펼쳐진다.
    if (window.innerWidth < 760) document.querySelector('.filter-panel').open = false;
    if (!window.L) {
        document.getElementById('analysisStatus').textContent = 'Leaflet 표시 도구를 불러오지 못했습니다. 인터넷 연결 후 새로고침하세요.';
        return;
    }
    try {
        var response = await fetch('/api/map-data', {cache:'no-store'});
        if (!response.ok) throw new Error('팀 분석 자료를 불러오지 못했습니다.');
        analysisData = await response.json();
        analysisMap = L.map('analysisMap', {preferCanvas:true});
        var background = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
        background.on('tileerror', function() {
            document.getElementById('backgroundStatus').textContent = '배경지도 일부를 못 불러왔습니다. 팀 도로·거점 자료는 계속 표시합니다.';
        });
        background.addTo(analysisMap);
        analysisLayers = L.layerGroup().addTo(analysisMap);
        analysisBoundary = L.geoJSON(analysisData.boundary).getBounds();
        for (var i = 0; i < analysisData.zones.features.length; i++) {
            var zone = analysisData.zones.features[i].properties['생활권'];
            var option = reportText('option', '생활권 ' + zone); option.value = zone;
            document.getElementById('analysisZone').append(option);
        }
        document.getElementById('analysisPlan').onchange = changeAnalysisPlan;
        document.getElementById('analysisZone').onchange = function() { drawAnalysis(); fitAnalysis(); };
        document.getElementById('analysisWidth').onchange = drawAnalysis;
        var checks = document.querySelectorAll('fieldset input');
        for (var j = 0; j < checks.length; j++) checks[j].onchange = drawAnalysis;
        document.getElementById('analysisFit').onclick = fitAnalysis;
        changeAnalysisPlan();
    } catch (error) { document.getElementById('analysisStatus').textContent = error.message; }
}

document.addEventListener('DOMContentLoaded', initializeReport);
