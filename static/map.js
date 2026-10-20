// ==========================================
// 전역 변수 선언 (레이어 및 데이터 관리)
// ==========================================
let vmap;
let searchMarkerLayer = null;  // 주소 검색 결과용 핀 레이어
let geoJsonMarkerLayer = null; // GeoJSON 공공데이터용 핀 레이어
let geoJsonRawData = null;     // 나중에 거리 계산을 위해 원본 데이터를 저장할 변수
let boundaryLayer = null;      // 💡 [신규] 신월1동 경계선 레이어

// 💡 [신규] 페이징 처리를 위해 검색 상태를 기억할 변수
let currentKeyword = ""; 
let currentPage = 1;

// ==========================================
// 1. 초기화 및 이벤트 등록 (화면 켜질 때 1번만 실행)
// ==========================================
document.addEventListener("DOMContentLoaded", function() {
    
    // 브이월드 지도 초기화 옵션
    vw.ol3.MapOptions.basemapType = vw.ol3.BasemapType.GRAPHIC; // 기본 2D 지도 스타일
    vw.ol3.MapOptions.controlDensity = vw.ol3.DensityType.EMPTY; // 불필요한 기본 컨트롤 버튼 숨김
    vw.ol3.MapOptions.interactionDensity = vw.ol3.DensityType.BASIC;
    
    // 💡 [신규] 초기 중심점을 서울시청에서 신월1동으로 변경
    vw.ol3.MapOptions.center = [126.8251, 37.5312]; 
    vw.ol3.MapOptions.zoom = 15;

    // HTML의 id="vmap" 영역에 지도를 그립니다. 
    // (HTML에 브이월드 키가 정상 입력되어 있다면 여기서 지도가 뜹니다.)
    // 선언해둔 vmap 변수에 실제 지도를 밀어넣습니다.
    vmap = new vw.ol3.Map("vmap", vw.ol3.MapOptions);

    // --- 💡 [신규] 탭 전환 기능 시작 ---
    const tabSearchBtn = document.getElementById("tabSearchBtn");
    const tabDataBtn = document.getElementById("tabDataBtn");
    const tabContentSearch = document.getElementById("tabContentSearch");
    const tabContentData = document.getElementById("tabContentData");

    // [주소 검색 탭] 클릭 시
    tabSearchBtn.addEventListener("click", function() {
        tabSearchBtn.classList.add("active");      // 내 버튼 활성화
        tabDataBtn.classList.remove("active");     // 상대방 버튼 비활성화
        
        tabContentSearch.classList.add("active");  // 내 화면 켜기
        tabContentData.classList.remove("active"); // 상대방 화면 끄기
    });

    // [후보지 목록 탭] 클릭 시
    tabDataBtn.addEventListener("click", function() {
        tabDataBtn.classList.add("active");
        tabSearchBtn.classList.remove("active");
        
        tabContentData.classList.add("active");
        tabContentSearch.classList.remove("active");
    });

    // 이벤트 리스너(버튼 클릭, 엔터키 감지) 등록
    const keywordInput = document.getElementById("keyword");
    const searchBtn = document.getElementById("searchBtn");
    const loadGeoBtn = document.getElementById("loadGeoBtn");

    // [검색 버튼] 클릭 시
    searchBtn.addEventListener("click", function() { searchAddress(1); });

    // [검색창] 엔터키 입력 시
    keywordInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            searchAddress(1);
        }
    });

    // [GeoJSON 버튼] 클릭 시 (토글 기능)
    loadGeoBtn.addEventListener("click", toggleGeoJsonMarkers);

    // 💡 [신규] 지도 뜨자마자 신월1동 초록색 경계선 바로 그리기
    drawBoundary();
});

// ==========================================
// 💡 [신규] 신월1동 경계선 폴리곤 그리기 함수 (브이월드 문법으로 재작성)
// ==========================================
async function drawBoundary() {
    try {
        const response = await fetch('/data/greenzone1st_layer_boundary.geojson');
        const data = await response.json();
        
        // 브이월드(OpenLayers) 방식으로 폴리곤 데이터 읽어오기
        const format = new ol.format.GeoJSON();
        const features = format.readFeatures(data, {
            dataProjection: 'EPSG:4326',      // 원본 데이터 좌표계 (위경도)
            featureProjection: 'EPSG:3857'    // 브이월드 지도 좌표계(구면 메르카토르)로 자동 변환
        });

        // 💡 테두리 두께 및 내부 색상 디자인 그대로 적용
        const polygonStyle = new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#1b8a4a', width: 3 }),
            fill: new ol.style.Fill({ color: 'rgba(46, 204, 113, 0.1)' })
        });

        const vectorSource = new ol.source.Vector({ features: features });
        boundaryLayer = new ol.layer.Vector({
            source: vectorSource,
            style: polygonStyle
        });

        vmap.addLayer(boundaryLayer);
    } catch (error) {
        console.error("경계선 데이터 로딩 에러:", error);
    }
}

// ==========================================
// 2. 주소 검색 함수 (버튼 클릭 시 실행됨)
// ==========================================
function searchAddress(page) {
    const keywordInput = document.getElementById("keyword").value;

    // 💡 1페이지 검색(새로운 검색)일 경우 처리
    if (page === 1) {
        if (keywordInput.trim() === "") {
            alert("검색어를 입력해 주세요.");
            return;
        }
        currentKeyword = keywordInput; // 현재 검색어 기억
        currentPage = 1;               // 페이지 1로 초기화
        document.getElementById("resultList").innerHTML = ""; // 기존 리스트 싹 비우기
    }
    
    $.ajax({
        url: "https://business.juso.go.kr/addrlink/addrLinkApiJsonp.do",
        type: "post",
        dataType: "jsonp",
        crossDomain: true,
        data: {
            confmKey: window.JUSO_KEY, 
            currentPage: currentPage, // 💡 기억해둔 페이지 번호 사용
            countPerPage: 10, // 한 번에 최대 10개의 유사 주소를 가져옵니다.
            keyword: currentKeyword, // 💡 기억해둔 검색어 사용
            resultType: "json"
        },
        success: function(jsonStr) {
            if(jsonStr.results.common.errorCode !== "0") {
                alert("에러 발생: " + jsonStr.results.common.errorMessage);
                return;
            }

            // HTML의 <ul> 태그 공간을 찾아와서 안의 내용을 깨끗하게 지웁니다.
            const resultList = document.getElementById("resultList");
            const jusoArray = jsonStr.results.juso;

            // 💡 기존에 있던 '더보기' 버튼이 있다면 잠시 삭제 (새로 결과 덧붙인 후 다시 맨 밑에 달기 위함)
            const oldMoreBtn = document.getElementById("loadMoreBtn");
            if (oldMoreBtn) {
                oldMoreBtn.remove();
            }
            
            // 검색된 주소 데이터가 1개 이상 있을 때
            if(jusoArray && jusoArray.length > 0) {
                // for문(반복문)을 사용해 검색된 갯수만큼 목록을 만듭니다.
                jusoArray.forEach(function(juso) {
                    // <li> 태그(목록 요소)를 하나 만듭니다.
                    const listItem = document.createElement("li");
                    
                    // 도로명과 지번 주소를 보기 좋게 합쳐서 넣습니다.
                    listItem.innerHTML = `
                        <div style="color:#0056b3; font-weight:bold; margin-bottom:5px;">${juso.roadAddr}</div>
                        <div style="color:#666; font-size:12px;">[지번] ${juso.jibunAddr}</div>
                    `;
                    
                    // [핵심] 리스트 중 하나를 클릭했을 때 동작할 '선택 기능'
                    listItem.onclick = function() {
                        displayOnMap(juso.roadAddr);
                    };

                    // 완성된 <li> 항목을 <ul> 리스트 공간에 쏙 밀어넣습니다.
                    resultList.appendChild(listItem); 
                });

                // 💡 다음 페이지가 더 남아있는지 계산해서 '더보기' 버튼 생성
                const totalCount = parseInt(jsonStr.results.common.totalCount);
                if (currentPage * 10 < totalCount) {
                    const moreBtn = document.createElement("li");
                    moreBtn.id = "loadMoreBtn"; // 나중에 지우기 위해 ID 부여
                    moreBtn.style.textAlign = "center";
                    moreBtn.style.backgroundColor = "#e9ecef";
                    moreBtn.style.fontWeight = "bold";
                    moreBtn.innerHTML = `⬇️ 결과 더보기 (${currentPage} / ${Math.ceil(totalCount/10)} 페이지)`;
                    
                    // 더보기 버튼 누르면 페이지 숫자 1 올리고 다시 검색
                    moreBtn.onclick = function() {
                        currentPage++;
                        searchAddress(currentPage);
                    };
                    
                    resultList.appendChild(moreBtn);
                }

            } else {
                if (page === 1) {
                    resultList.innerHTML = "<li style='text-align:center; border:none; color:#999;'>검색 결과가 없습니다.</li>";
                }
            }
        },
        error: function() {
            alert("주소 검색 중 통신 에러가 발생했습니다.");
        }
    });
}

// ==========================================
// 3. 검색된 주소 마커 찍기 및 지도 이동
// ==========================================
function displayOnMap(address) {
    // console.log("좌표를 찾을 주소: ", address);
    $.ajax({
        url: "https://api.vworld.kr/req/address",
        type: "GET",
        dataType: "jsonp",
        data: {
            service: "address",
            request: "getCoord",
            version: "2.0",
            crs: "epsg:4326",
            type: "ROAD",
            address: address,
            format: "json",
            key: window.VWORLD_KEY 
        },
        success: function(response) {
            if (response.response.status === "OK") {
                let point = response.response.result.point;
                let lon = Number(point.x);
                let lat = Number(point.y);
                // console.log("찾아낸 좌표 - 경도:", lon, "위도:", lat);
                // 검색 마커 레이어만 비우기 (GeoJSON 핀은 안 건드림)
                if (searchMarkerLayer != null) {
                    vmap.removeLayer(searchMarkerLayer);
                    searchMarkerLayer = null;
                }
                // 2) 검색 전용 마커 레이어 생성
                searchMarkerLayer = new vw.ol3.layer.Marker(vmap);
                vmap.addLayer(searchMarkerLayer);

                // 3) 마커 옵션 셋팅 (샘플 코드 방식 활용)
                vw.ol3.markerOption = {
                    x: lon,
                    y: lat,
                    epsg: "EPSG:4326",
                    title: '검색된 위치',
                    contents: address,
                    iconUrl: 'http://map.vworld.kr/images/ol3/marker_blue.png', 
                    attr:{"name": "검색된 위치", "desc": address}
                };

                // 4) 마커 레이어에 마커 추가
                searchMarkerLayer.addMarker(vw.ol3.markerOption);

                // 5) 목적지 좌표 변환
                let targetCoord = ol.proj.transform([lon, lat], 'EPSG:4326', 'EPSG:3857');
                // 6) 출발 전의 현재 위치와 현재 줌(해상도) 상태를 기억해 둡니다.
                let currentCenter = vmap.getView().getCenter(); 
                let currentResolution = vmap.getView().getResolution(); 
                // 이동(스르륵) 애니메이션
                let panAnimation = ol.animation.pan({
                    duration: 500, // 0.5초 동안 이동
                    source: currentCenter
                });
                // 줌(확대/축소) 애니메이션 추가
                let zoomAnimation = ol.animation.zoom({
                    duration: 500, // 0.5초 동안 확대/축소
                    resolution: currentResolution // 시작할 때의 줌 상태
                });
                
                // 두 개의 애니메이션을 지도 렌더링에 동시에 장착!
                vmap.beforeRender(panAnimation, zoomAnimation);
                // 7) 최종 목적지 좌표와 줌 레벨을 지시하면 
                // 위에서 장착한 애니메이션과 맞물려 영화처럼 날아갑니다.
                vmap.getView().setCenter(targetCoord);
                vmap.getView().setZoom(17);

            } else {
                alert("해당 주소의 좌표를 찾을 수 없습니다.");
            }
        },
        error: function() {
            alert("좌표 변환 중 통신 에러가 발생했습니다.");
        }
    });
}

// ==========================================
// 4. GeoJSON 마커 토글 및 사이드바 목록 생성
// ==========================================
async function toggleGeoJsonMarkers() {
    const loadGeoBtn = document.getElementById("loadGeoBtn");
    const listContainer = document.getElementById("listContainer");

    // 상태 1: 이미 레이어가 켜져 있다면 -> 마커와 리스트 비우고 끄기
    if (geoJsonMarkerLayer != null) {
        vmap.removeLayer(geoJsonMarkerLayer);
        geoJsonMarkerLayer = null; 
        listContainer.innerHTML = ""; // 💡 사이드바 목록 초기화
        
        loadGeoBtn.innerText = "🗺️ 11개 후보지(GeoJSON) 불러오기";
        loadGeoBtn.style.backgroundColor = "#28a745"; 
        return; 
    }

    // 상태 2: 꺼져 있다면 -> 데이터 불러오고 켜기
    loadGeoBtn.innerText = "⏳ 불러오는 중...";
    
    try {
        const response = await fetch('/data/greenzone2nd.geojson');
        geoJsonRawData = await response.json(); // 나중에 거리 계산을 위해 원본 데이터 저장

        // GeoJSON 전용 레이어 생성
        geoJsonMarkerLayer = new vw.ol3.layer.Marker(vmap);
        vmap.addLayer(geoJsonMarkerLayer);

        // 💡 목록 상단 제목 달아주기
        listContainer.innerHTML = "<b style='display:block; margin-bottom:10px; color:#1b6b4a;'>[후보지 상세 목록]</b>";

        // 3. features 배열을 반복문(forEach)으로 돌면서 핀 찍기
        geoJsonRawData.features.forEach(function(feature) {
            // 점(Point) 데이터인 경우에만 핀을 찍음
            if (feature.geometry.type === "Point") {
                const lon = feature.geometry.coordinates[0]; // 경도
                const lat = feature.geometry.coordinates[1]; // 위도
                // 💡 1. 필요한 데이터만 정확한 이름으로 콕 집어서 꺼내옵니다.
                const placeName = feature.properties["이름"] || "이름 없음";
                const roadAddr = feature.properties["도로명주소"] || feature.properties["지번주소"] || "주소 미상";
                
                //  디테일한 속성 정보 뽑기
                const placeNum = feature.properties["번호"] || "-";
                const placeType = feature.properties["부지유형"] || "";
                const placeArea = feature.properties["부지면적_㎡"] || "";
                
                // 💡 2. 말풍선(팝업) 내용에는 주소만 심플하게 넣습니다.
                const popupHtml = `<div style="font-size:13px; margin-top:5px;">${roadAddr}</div>`;

                vw.ol3.markerOption = {
                    x: lon,
                    y: lat,
                    epsg: "EPSG:4326",
                    title: `[${placeNum}번] ${placeName}`, // 팝업 제목에 번호 추가
                    contents: popupHtml,   // 팝업 내용으로 조립한 '주소' 사용
                    // 💡 검색 핀(파란색)과 헷갈리지 않게 GeoJSON 핀은 빨간색으로 변경
                    iconUrl: 'http://map.vworld.kr/images/ol3/btn_area.png', // 구분을 위해 마커 임시 변경
                    attr: {"name": placeName, "desc": roadAddr}
                };

                geoJsonMarkerLayer.addMarker(vw.ol3.markerOption);

                //  사이드바에 찰싹 달라붙는 리스트 아이템 조립
                const item = document.createElement("div");
                item.className = "candidate-item"; // CSS 디자인 적용
                item.innerHTML = `<b>${placeNum}. ${placeName}</b><br><span style="color:#666;">${placeType} · ${placeArea}㎡</span>`;

                //  리스트 항목을 클릭하면 해당 핀 위치로 스르륵 이동
                item.onclick = function() {
                    const targetCoord = ol.proj.transform([lon, lat], 'EPSG:4326', 'EPSG:3857');
                    const currentCenter = vmap.getView().getCenter();
                    const panAnimation = ol.animation.pan({ duration: 800, source: currentCenter });
                    vmap.beforeRender(panAnimation);
                    vmap.getView().setCenter(targetCoord);
                    vmap.getView().setZoom(17); 
                };
                
                listContainer.appendChild(item); // 조립한 아이템을 화면에 붙임
            }
        });

        // 💡 3. 버튼을 '끄기' 상태로 디자인 변경
        loadGeoBtn.innerText = "❌ 데이터(GeoJSON) 숨기기";
        loadGeoBtn.style.backgroundColor = "#dc3545"; // 빨간색 경고톤으로 변경

    } catch (error) {
        console.error("GeoJSON 로딩 에러:", error);
        alert("데이터를 불러오는 중 문제가 발생했습니다.");
        loadGeoBtn.innerText = "🗺️ 데이터(GeoJSON) 불러오기"; // 에러 시 복구
    }
}
