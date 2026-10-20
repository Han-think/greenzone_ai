// ==========================================
// 1. 브이월드 지도 초기화 (화면이 켜지자마자 실행됨)
// ==========================================
// 1. 파일 맨 위에 vmap을 전역 변수(var)로 먼저 선언하여 어디서든 접근 가능하게 합니다.
let vmap;
let markerLayer; // 마커를 담을 투명 비닐(레이어) 변수 추가
var selectMarker;

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
    loadGeoBtn.addEventListener("click", loadGeoJsonMarkers);

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

// 맨 위에 var markerLayer; 가 선언되어 있어야 합니다.

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
                if (markerLayer != null) {
                    vmap.removeLayer(markerLayer);
                    markerLayer = null;
                }

                // 2) 브이월드 전용 마커 레이어 새로 생성 후 지도에 추가
                markerLayer = new vw.ol3.layer.Marker(vmap);
                vmap.addLayer(markerLayer);

                // 3) 마커 옵션 셋팅 (샘플 코드 방식 활용)
                vw.ol3.markerOption = {
                    x: lon,
                    y: lat,
                    epsg: "EPSG:4326",
                    title: '검색된 위치',
                    contents: address,
                    iconUrl: 'http://map.vworld.kr/images/ol3/marker_blue.png', 
                    text: {
                        offsetX: 0.5,
                        offsetY: 20,
                        font: '12px Calibri,sans-serif',
                        fill: {color: '#000'},
                        stroke: {color: '#fff', width: 2},
                        text: '검색 위치'
                    },
                    attr: {"id": "search_marker", "name": "검색된 주소"}
                };

                // 4) 마커 레이어에 마커 추가
                markerLayer.addMarker(vw.ol3.markerOption);

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
// GeoJSON 파일 불러와서 다중 마커 찍기
// ==========================================
async function loadGeoJsonMarkers() {
    try {
        // 1. data 폴더에 있는 geojson 파일 불러오기
        const response = await fetch('/data/greenzone1st.geojson');
        const geojsonData = await response.json();

        // 2. 기존 마커 레이어가 있다면 지우고 새로 생성
        if (markerLayer != null) {
            vmap.removeLayer(markerLayer);
        }
        markerLayer = new vw.ol3.layer.Marker(vmap);
        vmap.addLayer(markerLayer);

        // 3. features 배열을 반복문(forEach)으로 돌면서 핀 찍기
        geojsonData.features.forEach(function(feature) {
            // 점(Point) 데이터인 경우에만 핀을 찍음
            if (feature.geometry.type === "Point") {
                const lon = feature.geometry.coordinates[0]; // 경도
                const lat = feature.geometry.coordinates[1]; // 위도
                const placeName = feature.properties.name;   // 장소 이름
                const placeDesc = feature.properties.desc;   // 장소 설명

                // 마커 옵션 설정
                vw.ol3.markerOption = {
                    x: lon,
                    y: lat,
                    epsg: "EPSG:4326",
                    title: placeName,
                    contents: placeDesc,
                    iconUrl: 'http://map.vworld.kr/images/ol3/marker_blue.png',
                    text: {
                        offsetX: 0.5,
                        offsetY: 20,
                        font: '12px Calibri,sans-serif',
                        fill: {color: '#000'},
                        stroke: {color: '#fff', width: 2},
                        text: placeName // 핀 아래에 장소 이름 표시
                    },
                    attr: {"id": placeName, "name": placeName}
                };

                // 마커 레이어에 방금 만든 마커 추가
                markerLayer.addMarker(vw.ol3.markerOption);
            }
        });

        // 4. 데이터가 존재하면, 첫 번째 데이터의 위치로 카메라 자동 이동
        if (geojsonData.features.length > 0) {
            const firstFeature = geojsonData.features[0];
            
            // 데이터가 '점(Point)' 형태일 때만 좌표를 읽어옵니다.
            if (firstFeature.geometry.type === "Point") {
                const lon = firstFeature.geometry.coordinates[0];
                const lat = firstFeature.geometry.coordinates[1];
                
                const centerCoord = ol.proj.transform([lon, lat], 'EPSG:4326', 'EPSG:3857');
                
                vmap.getView().setCenter(centerCoord);
                vmap.getView().setZoom(15); // 화면에 넓게 들어오도록 줌 조절
            }
        }

    } catch (error) {
        console.error("GeoJSON 로딩 에러:", error);
        alert("데이터를 불러오는 중 문제가 발생했습니다.");
    }
}