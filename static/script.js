// 입력 → fetch → 받은 결과 표시. 생활권 분석은 팀 결과 파일을 사용한다.
var pageData = null;
var searchResults = [];
var searchQuery = '';
var searchPage = 0;
var searchBusy = false;
var wasteLoaded = false;

// 팀의 탭을 전환한다. 검색 결과와 후보 선택 상태는 그대로 남긴다.
function showPanel(panel) {
    setSidebarCollapsed(false);
    var isSearch = panel === 'search';
    if (!isSearch) mapAddressRequest += 1;
    document.getElementById('tabContentSearch').hidden = !isSearch;
    document.getElementById('tabContentData').hidden = isSearch;
    document.getElementById('tabSearchBtn').classList.toggle('active', isSearch);
    document.getElementById('tabDataBtn').classList.toggle('active', !isSearch);
    document.getElementById('tabSearchBtn').setAttribute('aria-pressed', String(isSearch));
    document.getElementById('tabDataBtn').setAttribute('aria-pressed', String(!isSearch));
    document.querySelector('.sidebar-content').scrollTop = 0;
}

function setSidebarCollapsed(collapsed) {
    var sidebar = document.getElementById('sidebarPanel');
    var button = document.getElementById('sidebarToggle');
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    sidebar.inert = collapsed;
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', collapsed
        ? '주소 검색·후보지 창 펼치기'
        : '주소 검색·후보지 창 접기');
    button.dataset.collapsed = String(collapsed);
    window.setTimeout(function() {
        if (map) {
            var center = map.getCenter();
            map.relayout();
            map.setCenter(center);
        }
    }, 240);
}

// 요소를 만들고 textContent로 글자를 넣는다. HTML 문자열로 사용자 입력을 해석하지 않는다.
function textNode(tag, text) {
    var node = document.createElement(tag);
    node.textContent = text;
    return node;
}
// 화면에 보여줄 숫자에 천 단위 구분과 소수 한 자리 형식을 적용한다.
function fmt(number) {
    return Number(number).toLocaleString('ko-KR', {maximumFractionDigits: 1});
}

// 서버에 GET 요청을 보내 JSON 응답을 읽는다. 실패하면 오류 문구를 올린다.
async function getJSON(url) {
    var response = await fetch(url, {cache: 'no-store'});
    if (!response.ok) throw new Error('자료 요청에 실패했습니다. 서버와 데이터 파일을 확인하세요.');
    return await response.json();
}
// 거점 ID와 같은 항목을 현재 결과에서 찾아 돌려준다.
function findHub(id) {
    for (var i = 0; i < pageData.hubs.features.length; i++) {
        if (pageData.hubs.features[i].properties['거점id'] === id) return pageData.hubs.features[i];
    }
    return null;
}
// 보기 조건에 맞는 거점을 버튼 목록으로 만든다.
function renderHubList() {
    if (!pageData) return;
    var box = document.getElementById('hubList');
    box.replaceChildren();
    for (var i = 0; i < pageData.hubs.features.length; i++) {
        if (!includedInPlan(pageData.hubs.features[i])) continue;
        var row = pageData.hubs.features[i].properties;
        if (!matchesZone(row['생활권'])) continue;
        var button = textNode('button', '생활권 ' + row['생활권'] + ' · ' + row['이름']);
        button.type = 'button';
        button.className = 'hub-card';
        button.dataset.hubId = row['거점id'];
        button.append(textNode('small', fmt(row['담당세대']) + ' 주거단위 / ' + row['구분']));
        button.onclick = function() { openHub(this.dataset.hubId); };
        box.append(button);
    }
}
// 클릭한 거점의 받은 분석 수치와 확인할 점을 후보 탭에 표시한다.
function showHubDetail(feature) {
    showPanel('data');
    var row = feature.properties;
    var box = document.getElementById('hubDetail');
    box.replaceChildren(textNode('h3', '생활권 ' + row['생활권'] + ' · ' + row['거점id']), textNode('p', row['이름']));
    box.append(textNode('p', '담당 ' + fmt(row['담당필지']) + '필지 · ' + fmt(row['담당세대']) + ' 주거단위'));
    box.append(textNode('p', '자기 생활권 거점 기준: 평균 ' + fmt(row['평균보행_m']) + 'm · 300m 안 ' + fmt(row['300m안'] * 100) + '%'));
    var widthBasis = row['도로폭_기준'];
    if (row['거점id'] === 'G01') widthBasis = '등록폭 우선(1차 코드)';
    box.append(textNode('p', '팀 판정 도로폭 ' + fmt(row['도로폭_m']) + 'm (' + widthBasis + ') · 보호시설까지 ' + fmt(row['보호시설까지_m']) + 'm'));
    box.append(textNode('small', '위도 ' + feature.geometry.coordinates[1].toFixed(6) + ', 경도 ' + feature.geometry.coordinates[0].toFixed(6)));
    if (row['거점id'] === 'G01') box.append(textNode('p', '등록폭 8m / 도로 도형 단면 추정 5.3m입니다. 팀 코드는 등록폭 우선 기준으로 통과시켰습니다. 현장 유효폭은 별도 확인이 필요합니다.'));
    box.append(textNode('small', '팀이 보고한 도로 중심선 추정값입니다. 모든 지점의 실제 정차·보행·부지 사용 승인은 미확인입니다.'));
    box.scrollIntoView({block: 'nearest'});
}
// 선택 건물을 팀 생활권·담당 거점과 연결해 검색 화면과 지도에 표시한다.
function selectBuilding(row) {
    // 주민 안내는 팀이 정한 9생활권 결과로 고정한다. 6곳 비교가 배정을 바꾸지 않는다.
    if (document.getElementById('planFilter').value !== 'nine') {
        document.getElementById('planFilter').value = 'nine';
        refreshPlan();
    }
    showPanel('search');
    var box = document.getElementById('selectedBuilding');
    box.replaceChildren(textNode('h3', row.name || row.address), textNode('p', row.address + ' / ' + row.jibun_address));
    box.append(textNode('p', '팀 대장 기준 ' + fmt(row.units) + ' 주거단위 · ' + row.housing_type));
    box.append(textNode('p', '생활권 ' + row.zone + ' 담당 제안: ' + row.hub_name));

    // 팀의 기존 ID 연결 함수로 '배정된 거점'을 찾는다. 최근접 거점으로 바꾸지 않는다.
    var targetHub = findHub(row.hub_id);
    if (targetHub && map) {
        var startLatLng = mapPoint(row.coordinates);
        var endLatLng = mapPoint(targetHub.geometry.coordinates);
        var dist = getDistanceMath(startLatLng, endLatLng);
        box.append(textNode('p', '담당 거점까지 직선거리: 약 ' + fmt(dist) + 'm'));
    } else if (targetHub) {
        // 지도 SDK가 준비되지 않아도 건물·생활권 검색은 계속 사용할 수 있다.
        box.append(textNode('small', '직선거리는 지도 준비 후 건물을 다시 선택하면 확인할 수 있습니다.'));
    }

    box.append(textNode('small', '개별 건물의 보행거리는 결과 파일에 없어 표시하지 않습니다. 실제 배출 위치 지정이 아닙니다.'));
    var button = textNode('button', '담당 거점안 보기');
    button.dataset.hubId = row.hub_id;
    button.onclick = function() { openHub(this.dataset.hubId); };
    box.append(button);
    document.getElementById('zoneFilter').value = row.zone;
    renderHubList();
    drawResults();
    showSearchPoint(row);
    // showSearchPoint가 이전 표시를 지운 뒤에 새 직선을 그려야 선이 남는다.
    if (targetHub && map) {
        drawDistanceLine(mapPoint(row.coordinates), mapPoint(targetHub.geometry.coordinates));
    }
    box.scrollIntoView({block: 'nearest'});
}
// 보유 데이터 검색 결과를 10개씩 받아 기존 목록 뒤에 붙인다.
async function loadSearchPage(page) {
    if (searchBusy) return;
    searchBusy = true;
    document.getElementById('searchButton').disabled = true;
    document.getElementById('clearSearch').disabled = true;
    document.getElementById('loadMoreBtn').disabled = true;
    document.getElementById('keyword').disabled = true;
    document.getElementById('searchStatus').textContent = '검색 결과를 불러오는 중입니다.';
    try {
        var result = await getJSON('/api/buildings?q=' + encodeURIComponent(searchQuery) + '&page=' + page);
        for (var i = 0; i < result.items.length; i++) {
            var row = result.items[i];
            var index = searchResults.length;
            searchResults.push(row);
            var button = textNode('button', row.name || row.address);
            button.type = 'button';
            button.className = 'search-result';
            button.dataset.index = index;
            button.append(textNode('small', row.address + ' / ' + row.jibun_address));
            button.onclick = function() { selectBuilding(searchResults[Number(this.dataset.index)]); };
            document.getElementById('searchResults').append(button);
        }
        searchPage = result.page;
        document.getElementById('searchStatus').textContent = result.total + '건 중 ' + searchResults.length + '건 표시. 보유 도로명·지번·건물명 검색입니다.';
        document.getElementById('loadMoreBtn').hidden = !result.has_more;
        document.getElementById('loadMoreBtn').textContent = '결과 더보기 (' + searchResults.length + ' / ' + result.total + '건)';
    } catch (error) { document.getElementById('searchStatus').textContent = error.message; }
    finally {
        searchBusy = false;
        document.getElementById('searchButton').disabled = false;
        document.getElementById('clearSearch').disabled = false;
        document.getElementById('loadMoreBtn').disabled = false;
        document.getElementById('keyword').disabled = false;
    }
}
// 검색 폼의 기본 새로고침을 막고 첫 페이지를 요청한다.
function searchBuildings(event) {
    event.preventDefault();
    if (searchBusy) return;
    var query = document.getElementById('keyword').value.trim();
    if (query.length < 2) {
        document.getElementById('searchStatus').textContent = '두 글자 이상 입력하세요.';
        return;
    }
    searchQuery = query;
    searchPage = 0;
    searchResults = [];
    document.getElementById('searchResults').replaceChildren();
    document.getElementById('selectedBuilding').replaceChildren();
    document.getElementById('loadMoreBtn').hidden = true;
    clearSearchPoint();
    loadSearchPage(1);
}
// 팀 엑셀에서 옮긴 비교 수치와 분석 가정을 보여준다.
function showSummary() {
    var summary = pageData.summary;
    var box = document.getElementById('analysisSummary');
    box.append(textNode('p', '1차 후보 중 6곳 선택 + 새 대안 3곳 = 9개 생활권 거점안. 11곳에서 9곳만 남긴 필터 결과가 아닙니다.'));
    box.append(textNode('p', '주거단위 = 세대수 + 가구수, 아파트 필지 제외, 주거용도 0값 보정. 실제 거주 가구 수와 다릅니다.'));
    box.append(textNode('p', 'Louvain: 연결 반경 150m, γ=1. 대안 탐색: 등록 도로폭 7m 이상, 보호시설 반경 200m 밖. 모두 분석 설정입니다.'));
    for (var i = 0; i < summary.comparisons.length; i++) {
        var row = summary.comparisons[i];
        box.append(textNode('p', row.name + ': 평균 ' + fmt(row.mean_m) + 'm / 300m 안 ' + fmt(row.coverage_300 * 100) + '%'));
    }
    box.append(textNode('small', '자료: 팀 결과 엑셀의 안 비교 시트. 원본 표제부·도로 SHP와 중간 거리행렬이 없어 전체 분석은 재실행하지 않았습니다.'));
}
// 배출량 펼치기를 열면 공식 관측값·조건부 추정을 구분해 읽는다.
async function loadWaste() {
    if (wasteLoaded || !document.getElementById('wasteDisclosure').open) return;
    var box = document.getElementById('wasteFacts');
    try {
        var result = await getJSON('/api/waste');
        if (!result.observed || !result.estimate) {
            box.textContent = '2024년 공식 물량 또는 조건부 추정 자료가 없어 값을 표시하지 않습니다.';
            return;
        }
        box.replaceChildren(textNode('p', '2024년 일반생활폐기물: 신월1·2·3·5동 결합권역 공식 연간량 ' + fmt(result.observed.full_year_tonnes) + '톤'));
        box.append(textNode('p', '기존 신월1동 비아파트 조건부 추정 ' + fmt(result.estimate.non_apartment_planning_estimate_kg_per_calendar_day) + 'kg/달력일'));
        box.append(textNode('small', '가구 비율·비아파트 주택 비율에 따른 추정입니다. 이번 7,193 주거단위로 재보정하거나 거점별 물량으로 배분하지 않았습니다.'));
        var link = textNode('a', '양천구 공식 권역 배출량 출처');
        link.href = 'https://www.data.go.kr/data/15093944/fileData.do';
        link.target = '_blank';
        link.rel = 'noopener';
        box.append(link);
        wasteLoaded = true;
    } catch (error) { box.textContent = error.message; }
}
document.addEventListener('DOMContentLoaded', async function() {
    document.getElementById('sidebarToggle').onclick = function() {
        setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    };
    document.getElementById('tabSearchBtn').onclick = function() { showPanel('search'); };
    document.getElementById('tabDataBtn').onclick = function() { showPanel('data'); };
    document.getElementById('searchForm').onsubmit = searchBuildings;
    document.getElementById('loadMoreBtn').onclick = function() { loadSearchPage(searchPage + 1); };
    document.getElementById('clearSearch').onclick = function() {
        searchResults = [];
        searchQuery = '';
        searchPage = 0;
        document.getElementById('keyword').value = '';
        document.getElementById('searchResults').replaceChildren();
        document.getElementById('selectedBuilding').replaceChildren();
        document.getElementById('loadMoreBtn').hidden = true;
        document.getElementById('searchStatus').textContent = '검색을 지웠습니다. 검색 기록은 저장하지 않습니다.';
        clearSearchPoint();
    };
    document.getElementById('zoneFilter').onchange = function() {
        renderHubList();
        drawResults();
        showSelectedZone();
        document.getElementById('hubDetail').replaceChildren();
    };
    var checkboxes = ['showOriginal', 'showHouseholds', 'showAlternatives', 'showRoads', 'showProtection'];
    for (var i = 0; i < checkboxes.length; i++) document.getElementById(checkboxes[i]).onchange = drawResults;
    document.getElementById('showArea').onclick = function() {
        document.getElementById('zoneFilter').value = 'all';
        renderHubList();
        drawResults();
        document.getElementById('hubDetail').replaceChildren();
        showStudyArea();
    };
    document.getElementById('wasteDisclosure').ontoggle = loadWaste;
    try {
        pageData = await getJSON('/api/map-data');
        document.getElementById('dataStatus').textContent = fmt(pageData.summary.parcel_count) + '필지 · ' + fmt(pageData.summary.registered_units) + ' 주거단위 · 9개 생활권 거점안';
        for (var j = 0; j < pageData.zones.features.length; j++) {
            var zone = pageData.zones.features[j].properties['생활권'];
            var option = textNode('option', '생활권 ' + zone); option.value = zone;
            document.getElementById('zoneFilter').append(option);
        }
        initializeAnalysis();
        showSummary();
        initializeMap();
    } catch (error) { document.getElementById('dataStatus').textContent = error.message; }
});

// 주소 검색 메뉴는 현재 페이지를 새로 열지 않고 기존 검색 탭으로 돌아간다.
var navSearchBtn = document.getElementById('navSearchBtn');
if (navSearchBtn) {
    navSearchBtn.onclick = function(event) {
        event.preventDefault();
        showPanel('search');
    };
}
