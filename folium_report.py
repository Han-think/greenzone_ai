"""받은 팀 자료를 Folium HTML 지도로 표시한다. 분석 결과는 다시 계산하지 않는다."""
from html import escape
import folium

# 두 지도와 범례가 함께 쓰는 생활권 1~9 색이다. 색을 바꿀 때는 이 목록만 고친다.
ZONE_COLORS = ['#1d4ed8', '#b45309', '#059669', '#7c3aed', '#db2777',
               '#65a30d', '#0891b2', '#9a3412', '#475569']


def boundary_style(feature):
    # 신월1동 경계의 선 색과 두께다. feature는 Folium이 전달하는 도형 한 개다.
    return {'color': '#173b4b', 'weight': 3, 'fillOpacity': 0}


def zone_style(feature):
    # 생활권 번호로 같은 색 목록을 찾는다. 필지도 소속 생활권 색으로 표시한다.
    color = ZONE_COLORS[int(feature['properties']['생활권']) - 1]
    return {'color': color, 'weight': 2, 'fillColor': color, 'fillOpacity': 0.28}


def building_style(feature):
    # 흰 테두리를 두어 필지 점이 생활권 색면과 붙어 보이지 않게 한다.
    color = ZONE_COLORS[int(feature['properties']['생활권번호']) - 1]
    return {'color': '#ffffff', 'weight': 0.7, 'fillColor': color, 'fillOpacity': 0.95}


def road_style(feature):
    # 도로 등록폭으로 고른 선을 파란색으로 표시한다.
    return {'color': '#075985', 'weight': 3, 'opacity': 0.9}


def protection_style(feature):
    # 시설 중심 반경 200m는 분석 가정이다. 법정 보호구역 확정 경계가 아니다.
    return {'color': '#dc2626', 'weight': 2, 'dashArray': '7 5', 'fillOpacity': 0.12}


def popup_box(title, lines):
    # 자료의 이름·주소를 escape로 글자 처리해 HTML 코드로 실행되지 않게 한다.
    content = '<b>' + escape(str(title)) + '</b>'
    for line in lines:
        content += '<p>' + escape(str(line)) + '</p>'
    # IFrame은 설명 HTML을 별도 작은 문서에 넣어 지도 코드와 분리한다.
    return folium.Popup(folium.IFrame(html=content, width=300, height=180), max_width=320)


def add_point(layer, feature, title, lines, color, radius):
    # GeoJSON [경도, 위도]를 Folium [위도, 경도]로 바꿔 마커를 붙인다.
    coordinate = feature['geometry']['coordinates']
    marker = folium.CircleMarker(
        location=[coordinate[1], coordinate[0]], radius=radius,
        color='#ffffff', weight=1.5, fill=True, fill_color=color, fill_opacity=0.95,
        popup=popup_box(title, lines))
    marker.add_to(layer)
    return marker


def build_folium_report(data, plan, min_width):
    # main.py가 이미 읽은 같은 자료를 받는다. 여기서 파일·API를 다시 수집하지 않는다.
    report = folium.Map(tiles='OpenStreetMap', prefer_canvas=True, control_scale=True)
    # 지도 안의 번호·배경 스타일도 Leaflet 화면과 같은 CSS를 불러온다.
    report.get_root().header.add_child(folium.Element(
        '<link rel="stylesheet" href="/static/analysis_map.css?v=20261021">'))
    boundary = folium.GeoJson(data['boundary'], style_function=boundary_style,
                              name='신월1동 경계', control=False)
    boundary.add_to(report)
    report.fit_bounds(boundary.get_bounds(), padding=[24, 24])

    # FeatureGroup은 체크박스 한 칸에 묶을 자료다. show=False이면 처음에는 숨긴다.
    if plan == 'nine':
        zone_layer = folium.FeatureGroup(name='9생활권 색면', show=True)
        for feature in data['zones']['features']:
            shape = folium.GeoJson(feature, style_function=zone_style)
            shape.add_child(popup_box('생활권 ' + str(feature['properties']['생활권']),
                                     ['팀이 제안한 9생활권 경계입니다.']))
            shape.add_to(zone_layer)
        zone_layer.add_to(report)

    protection_layer = folium.FeatureGroup(name='보호시설 반경 200m', show=False)
    for feature in data['protection']['features']:
        shape = folium.GeoJson(feature, style_function=protection_style)
        shape.add_child(popup_box(feature['properties']['시설명'],
                                 ['시설 중심 반경 200m 분석 가정. 법정 경계 확정값이 아닙니다.']))
        shape.add_to(protection_layer)
    protection_layer.add_to(report)

    road_layer = folium.FeatureGroup(name='팀 도로선', show=True)
    for feature in data['roads']['features']:
        row = feature['properties']
        if float(row['도로폭_m']) < min_width:
            continue
        line = folium.GeoJson(feature, style_function=road_style)
        line.add_child(popup_box(row['도로명'] or '도로명 없음',
                                ['등록폭 ' + str(row['도로폭_m']) + 'm',
                                 '현장 유효폭·차량 통행은 별도 확인이 필요합니다.']))
        line.add_to(road_layer)
    road_layer.add_to(report)

    # 필지는 GeoJSON 한 묶음으로 넣는다. 팝업에 쓸 글자는 미리 escape 처리한다.
    points = {'type': 'FeatureCollection', 'features': []}
    for building in data['buildings']:
        points['features'].append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': building['coordinates']},
            'properties': {
                '이름': escape(building['name'] or building['address']),
                '생활권번호': building['zone'],
                '주소': escape(building['address']),
                '담당': '생활권 ' + str(building['zone']) + ' · ' + escape(building['hub_id']),
                '등록 주거단위': building['units'],
                '해석': '팀의 원래 9생활권 배정 · 관측 배출량 아님'}})
    building_layer = folium.FeatureGroup(name='주거 필지 1,585곳', show=False)
    folium.GeoJson(points, style_function=building_style, marker=folium.CircleMarker(
        radius=2.5, fill=True),
        popup=folium.GeoJsonPopup(fields=['이름', '주소', '담당', '등록 주거단위', '해석'])).add_to(building_layer)
    building_layer.add_to(report)

    original_layer = folium.FeatureGroup(name='1차 후보 11곳', show=False)
    for feature in data['candidates']['features']:
        row = feature['properties']
        add_point(original_layer, feature, row['id'] + ' · ' + row['이름'],
                  ['1차 후보 · 2차 역할: ' + row['역할']], '#475569', 6)
    original_layer.add_to(report)

    alternative_layer = folium.FeatureGroup(name='대안 2·3순위', show=False)
    for feature in data['alternatives']['features']:
        row = feature['properties']
        if row['용도'] != '대안' or row['순위'] < 2:
            continue
        add_point(alternative_layer, feature, row['id'],
                  [row['가까운_건물주소'] or '', '대안 ' + str(row['순위']) + '순위 · 현장 확인 필요'],
                  '#7c3aed', 6)
    alternative_layer.add_to(report)

    hub_layer = folium.FeatureGroup(name='현재 거점안', show=True)
    for feature in data['hubs']['features']:
        row = feature['properties']
        badge_class = 'hub-badge existing-hub'
        if row['거점id'].startswith('A'):
            if plan == 'six':
                continue
            badge_class = 'hub-badge alternative-hub'
        width_basis = row['도로폭_기준']
        if row['거점id'] == 'G01':
            width_basis = '등록폭 우선(1차 코드)'
        lines = ['생활권 ' + str(row['생활권']) + ' · ' + str(row['담당세대']) + ' 등록 주거단위',
                 '팀 판정 도로폭 ' + str(row['도로폭_m']) + 'm (' + str(width_basis) + ')',
                 '보호시설까지 ' + str(row['보호시설까지_m']) + 'm · 운영 승인 전 제안']
        if row['거점id'] == 'G01':
            lines.append('등록폭 8m / 도로 도형 단면 추정 5.3m. 현장 유효폭은 미확인입니다.')
        # DivIcon은 숫자를 원형/사각형 마커 안에 넣는다. 색과 모양으로 구분한다.
        badge = '<span class="' + badge_class + '">' + escape(str(row['생활권'])) + '</span>'
        icon = folium.DivIcon(html=badge, icon_size=[32, 32], icon_anchor=[16, 16], class_name='hub-icon')
        coordinate = feature['geometry']['coordinates']
        marker = folium.Marker(location=[coordinate[1], coordinate[0]], icon=icon, z_index_offset=1000,
                               title='생활권 ' + str(row['생활권']) + ' · ' + row['거점id'],
                               alt='생활권 ' + str(row['생활권']) + ' 거점안',
                               tooltip=escape(row['거점id'] + ' · ' + row['이름']),
                               popup=popup_box(row['거점id'] + ' · ' + row['이름'], lines))
        marker.add_to(hub_layer)
    hub_layer.add_to(report)

    # 오른쪽 위의 자료 체크 목록이다. 체크는 표시만 바꾸며 원본·비교 수치는 유지한다.
    folium.LayerControl(position='topright', collapsed=False).add_to(report)
    return report.get_root().render()
