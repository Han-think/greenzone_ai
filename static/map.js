// ==========================================
// 1. 브이월드 지도 초기화 (화면이 켜지자마자 실행됨)
// ==========================================
// 1. 파일 맨 위에 vmap을 전역 변수(var)로 먼저 선언하여 어디서든 접근 가능하게 합니다.
let vmap;
var selectMarker;
let popupOverlay;

// let markerLayer; // 마커를 담을 투명 비닐(레이어) 변수 추가
let searchMarkerLayer = null; // 검색한 주소 핀을 담을 비닐
let geoJsonMarkerLayer = null; // GeoJSON 핀들을 담을 비닐

let geoJsonRawData = null; // (나중을 위해) 불러온 데이터를 통째로 기억해둘 변수

// HTML이 모두 로드된 후 실행 (window.onload 대신 권장되는 방식)
document.addEventListener("DOMContentLoaded", function() {

    // 브이월드 2.0은 별도 설정이 없으면 center에 기본 위도/경도를 그대로 넣어도 됩니다.
    vw.ol3.MapOptions.basemapType = vw.ol3.BasemapType.GRAPHIC; // 기본 2D 지도 스타일
    vw.ol3.MapOptions.controlDensity = vw.ol3.DensityType.EMPTY; // 불필요한 기본 컨트롤 버튼 숨김
    vw.ol3.MapOptions.interactionDensity = vw.ol3.DensityType.BASIC;
    vw.ol3.MapOptions.center = [126.9780, 37.5665]; // 초기 서울시청 좌표
    vw.ol3.MapOptions.zoom = 15; // 초기 확대 축소 레벨

    // HTML의 id="vmap" 영역에 지도를 그립니다. 
    // (HTML에 브이월드 키가 정상 입력되어 있다면 여기서 지도가 뜹니다.)
    // 선언해둔 vmap 변수에 실제 지도를 밀어넣습니다.
    vmap = new vw.ol3.Map("vmap", vw.ol3.MapOptions);

    // 2. 검색 이벤트 연결
    const keywordInput = document.getElementById("keyword");
    const searchBtn = document.getElementById("searchBtn");
    const loadGeoBtn = document.getElementById("loadGeoBtn");
    loadGeoBtn.addEventListener("click", toggleGeoJsonMarkers);

    // [버튼 클릭] 시 검색
    searchBtn.addEventListener("click", searchAddress);

    // [엔터키 입력] 시 검색
    keywordInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            searchAddress();
        }
    });
});

// ==========================================
// 2. 주소 검색 함수 (버튼 클릭 시 실행됨)
// ==========================================
function searchAddress() {
    let keyword = document.getElementById("keyword").value;

    if (keyword.trim() === "") {
        alert("검색어를 입력해 주세요.");
        return;
    }
    
    $.ajax({
        url: "https://business.juso.go.kr/addrlink/addrLinkApiJsonp.do",
        type: "post",
        data: {
            confmKey: window.JUSO_KEY, 
            currentPage: 1,
            countPerPage: 10, // 한 번에 최대 10개의 유사 주소를 가져옵니다.
            keyword: keyword,
            resultType: "json"
        },
        dataType: "jsonp",
        crossDomain: true,
        success: function(jsonStr) {
            if(jsonStr.results.common.errorCode !== "0") {
                alert("에러 발생: " + jsonStr.results.common.errorMessage);
                return;
            }

            // HTML의 <ul> 태그 공간을 찾아와서 안의 내용을 깨끗하게 지웁니다.
            let resultList = document.getElementById("resultList");
            resultList.innerHTML = ""; // 기존 목록 비우기

            let jusoArray = jsonStr.results.juso;
            
            // 검색된 주소 데이터가 1개 이상 있을 때
            if(jusoArray != null && jusoArray.length > 0) {
                
                // for문(반복문)을 사용해 검색된 갯수만큼 목록을 만듭니다.
                jusoArray.forEach(function(juso) {
                    // <li> 태그(목록 요소)를 하나 만듭니다.
                    const listItem = document.createElement("li");
                    
                    // 도로명과 지번 주소를 보기 좋게 합쳐서 넣습니다.
                    listItem.innerHTML = `
                        <div style="color:#0056b3; font-weight:bold; margin-bottom:5px;">${juso.roadAddr}</div>
                        <div style="color:#666; font-size:12px;">[지번] ${juso.jibunAddr}</div>
                    `;
                    
                    // 항목에 마우스를 올렸을 때 손가락 모양으로 바뀌게 하고 간격을 줍니다.
                    listItem.style.cursor = "pointer";
                    listItem.style.marginBottom = "15px";
                    
                    // [핵심] 리스트 중 하나를 클릭했을 때 동작할 '선택 기능'
                    listItem.onclick = function() {
                        // alert("선택하신 주소: " + roadAddr + "\n(추후 이 주소를 좌표로 변환해 지도를 움직입니다.)");
                        displayOnMap(juso.roadAddr);
                    };

                    // 완성된 <li> 항목을 <ul> 리스트 공간에 쏙 밀어넣습니다.
                    resultList.appendChild(listItem); 
                });
            } else {
                resultList.innerHTML = "<li style='text-align:center; border:none; color:#999;'>검색 결과가 없습니다.</li>";
            }
        },
        error: function() {
            alert("주소 검색 중 통신 에러가 발생했습니다.");
        }
    });
}

// ==========================================
// 주소를 좌표로 변환하고 지도 부드럽게 이동 및 순정 마커 찍기
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
                // 1) 기존 마커 레이어 초기화 (기존 핀 지우기)
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
                    // text: {
                    //     offsetX: 0.5,
                    //     offsetY: 20,
                    //     font: '12px Calibri,sans-serif',
                    //     fill: {color: '#000'},
                    //     stroke: {color: '#fff', width: 2},
                    //     text: '검색 위치'
                    // },
                    attr:{"name": "검색된 위치", "desc": address} // {"id": "search_marker", "name": "검색된 주소"}
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
// GeoJSON 토글 (켜고 끄기)
// ==========================================
async function toggleGeoJsonMarkers() {
    const loadGeoBtn = document.getElementById("loadGeoBtn");

    // 💡 1. 끄기 기능: 이미 레이어가 화면에 있다면? -> 레이어를 지우고 함수 종료
    if (geoJsonMarkerLayer != null) {
        vmap.removeLayer(geoJsonMarkerLayer);
        geoJsonMarkerLayer = null; // 레이어 비우기
        
        // 버튼 색상 및 글자 원상복구
        loadGeoBtn.innerText = "🗺️ 데이터(GeoJSON) 불러오기";
        loadGeoBtn.style.backgroundColor = "#28a745"; // 초록색
        return; 
    }

    // 💡 2. 켜기 기능: 레이어가 없다면? -> 데이터를 불러옵니다.
    loadGeoBtn.innerText = "⏳ 불러오는 중...";
    
    try {
        const response = await fetch('/data/greenzone1st.geojson');
        geoJsonRawData = await response.json(); // 나중에 거리 계산을 위해 원본 데이터 저장

        // GeoJSON 전용 레이어 생성
        geoJsonMarkerLayer = new vw.ol3.layer.Marker(vmap);
        vmap.addLayer(geoJsonMarkerLayer);

        // 3. features 배열을 반복문(forEach)으로 돌면서 핀 찍기
        geoJsonRawData.features.forEach(function(feature) {
            // 점(Point) 데이터인 경우에만 핀을 찍음
            if (feature.geometry.type === "Point") {
                const lon = feature.geometry.coordinates[0]; // 경도
                const lat = feature.geometry.coordinates[1]; // 위도
                // 💡 1. 필요한 데이터만 정확한 이름으로 콕 집어서 꺼내옵니다.
                const placeName = feature.properties["이름"] || "이름 없음";
                const roadAddr = feature.properties["도로명주소"] || feature.properties["지번주소"] || "주소 미상";
                // 💡 2. 말풍선(팝업) 내용에는 주소만 심플하게 넣습니다.
                const popupHtml = `<div style="font-size:13px; margin-top:5px;">${roadAddr}</div>`;

                vw.ol3.markerOption = {
                    x: lon,
                    y: lat,
                    epsg: "EPSG:4326",
                    title: placeName,      // 팝업의 굵은 제목으로 '이름' 사용
                    contents: popupHtml,   // 팝업 내용으로 조립한 '주소' 사용
                    // 💡 검색 핀(파란색)과 헷갈리지 않게 GeoJSON 핀은 빨간색으로 변경
                    iconUrl: 'http://map.vworld.kr/images/ol3/marker_blue.png',
                    attr: {"name": placeName, "desc": roadAddr}
                };

                geoJsonMarkerLayer.addMarker(vw.ol3.markerOption);
            }
        });

        // 💡 3. 버튼을 '끄기' 상태로 디자인 변경
        loadGeoBtn.innerText = "❌ 데이터(GeoJSON) 숨기기";
        loadGeoBtn.style.backgroundColor = "#dc3545"; // 빨간색 경고톤으로 변경

        // (선택 사항) 카메라 이동 코드 - 원치 않으시면 지워도 됩니다.
        if (geoJsonRawData.features.length > 0) {
            const firstLon = geoJsonRawData.features[0].geometry.coordinates[0];
            const firstLat = geoJsonRawData.features[0].geometry.coordinates[1];
            const centerCoord = ol.proj.transform([firstLon, firstLat], 'EPSG:4326', 'EPSG:3857');
            vmap.getView().setCenter(centerCoord);
            vmap.getView().setZoom(15);
        }

    } catch (error) {
        console.error("GeoJSON 로딩 에러:", error);
        alert("데이터를 불러오는 중 문제가 발생했습니다.");
        loadGeoBtn.innerText = "🗺️ 데이터(GeoJSON) 불러오기"; // 에러 시 복구
    }
}
