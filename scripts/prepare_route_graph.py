"""받은 도로선을 경로 계산용 점·연결 목록으로 바꾼다. 추가 패키지 없이 실행한다.

한 번 준비해서 JSON으로 저장하고, 웹에서는 그 파일만 읽는다.
아래 좌표·교차점 계산은 프로젝트 제공 보조 코드다.
입체교차·일방통행 자료가 없으므로 실제 차량용 도로망이라고 해석하지 않는다.
"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = [126.835, 37.533]
LAT_SCALE = 111195
LON_SCALE = LAT_SCALE * math.cos(math.radians(ORIGIN[1]))


def to_xy(coordinate):
    # 경위도 차이를 신월1동 부근의 근사 미터 단위로 바꾼다.
    return [(coordinate[0] - ORIGIN[0]) * LON_SCALE,
            (coordinate[1] - ORIGIN[1]) * LAT_SCALE]


def to_lonlat(point):
    # 지도에 돌려줄 때 미터 좌표를 다시 [경도, 위도]로 바꾼다.
    return [round(point[0] / LON_SCALE + ORIGIN[0], 9),
            round(point[1] / LAT_SCALE + ORIGIN[1], 9)]


def point_on(segment, ratio):
    # 도로 조각의 시작=0, 끝=1이다. ratio=0.5면 그 조각의 중간점이다.
    return [segment['a'][0] + ratio * segment['dx'],
            segment['a'][1] + ratio * segment['dy']]


def projection_ratio(segment, point):
    # 거점에서 도로 조각에 가장 가깝게 붙는 위치(0~1)를 계산한다.
    value = ((point[0] - segment['a'][0]) * segment['dx']
             + (point[1] - segment['a'][1]) * segment['dy']) / segment['length2']
    return max(0, min(1, value))


def split_crossing(first, second):
    # 두 선이 실제 도형상 만나는 위치를 각 도로의 끊을 지점에 추가한다.
    # 도로 높이 정보가 없어 고가·지하차도 구분은 못 한다.
    if (max(first['a'][0], first['b'][0]) + 0.001 < min(second['a'][0], second['b'][0])
        or max(second['a'][0], second['b'][0]) + 0.001 < min(first['a'][0], first['b'][0])
        or max(first['a'][1], first['b'][1]) + 0.001 < min(second['a'][1], second['b'][1])
        or max(second['a'][1], second['b'][1]) + 0.001 < min(first['a'][1], first['b'][1])):
        return
    cross = first['dx'] * second['dy'] - first['dy'] * second['dx']
    delta_x = second['a'][0] - first['a'][0]
    delta_y = second['a'][1] - first['a'][1]
    if abs(cross) > 0.00000001:
        first_ratio = (delta_x * second['dy'] - delta_y * second['dx']) / cross
        second_ratio = (delta_x * first['dy'] - delta_y * first['dx']) / cross
        if -0.00000001 <= first_ratio <= 1.00000001 and -0.00000001 <= second_ratio <= 1.00000001:
            first['cuts'].append(max(0, min(1, first_ratio)))
            second['cuts'].append(max(0, min(1, second_ratio)))
    else:
        # 겹친 도로는 양 끝점을 함께 끊어, 같은 도로 위 점들이 연결되게 한다.
        for point in [second['a'], second['b']]:
            ratio = projection_ratio(first, point)
            projected = point_on(first, ratio)
            if math.dist(point, projected) < 0.001:
                first['cuts'].append(ratio)
        for point in [first['a'], first['b']]:
            ratio = projection_ratio(second, point)
            projected = point_on(second, ratio)
            if math.dist(point, projected) < 0.001:
                second['cuts'].append(ratio)


def node_id(point):
    # 같은 교차점은 같은 이름을 사용한다. 1mm 반올림은 계산 오차 정리용이다.
    return str(round(point[0], 3)) + ':' + str(round(point[1], 3))


def make_graph(segments, hubs, minimum_width):
    # 도로폭 조건을 먼저 적용한 뒤, 거점을 해당 도로에 투영한다.
    # 40m 넘게 떨어진 거점은 억지로 도로에 붙이지 않고 사유를 남긴다.
    selected = []
    for segment in segments:
        if segment['width'] >= minimum_width:
            copy = dict(segment)
            copy['cuts'] = list(segment['cuts'])
            selected.append(copy)
    connections = {}
    for hub in hubs['features']:
        point = to_xy(hub['geometry']['coordinates'])
        nearest = None
        best_distance = float('inf')
        for segment in selected:
            ratio = projection_ratio(segment, point)
            projected = point_on(segment, ratio)
            distance = math.dist(point, projected)
            if distance < best_distance:
                nearest = segment
                best_ratio = ratio
                best_point = projected
                best_distance = distance
        connection = {'name': hub['properties']['이름'], 'zone': hub['properties']['생활권'],
                      'hub_coordinates': hub['geometry']['coordinates'], 'node': None,
                      'snap_m': None, 'reason': ''}
        if nearest is None:
            connection['reason'] = '조건에 맞는 도로가 없습니다.'
        else:
            connection['snap_m'] = round(best_distance, 2)
            if best_distance > 40:
                connection['reason'] = '조건에 맞는 도로가 거점에서 40m보다 멉니다.'
            else:
                nearest['cuts'].append(best_ratio)
                connection['node'] = node_id(best_point)
        connections[hub['properties']['거점id']] = connection
    nodes = {}
    edges = []
    for segment in selected:
        cuts = sorted(segment['cuts'])
        for index in range(len(cuts) - 1):
            start = point_on(segment, cuts[index])
            end = point_on(segment, cuts[index + 1])
            start_id = node_id(start)
            end_id = node_id(end)
            if start_id == end_id:
                continue
            nodes[start_id] = to_lonlat(start)
            nodes[end_id] = to_lonlat(end)
            edges.append({'start': start_id, 'end': end_id,
                          'length_m': round(math.dist(start, end), 3),
                          'width_m': segment['width'], 'road_name': segment['name']})
    return {'minimum_width_m': minimum_width, 'nodes': nodes, 'edges': edges, 'hubs': connections}


def prepare(data_dir, output):
    # 입력: 팀 1차에서 받은 도로 162구간 + 현재 2차 거점 9곳. 원본은 변경하지 않는다.
    road_path = data_dir / 'received/team_results/roads.geojson'
    hub_path = data_dir / 'greenzone2nd.geojson'
    roads = json.loads(road_path.read_text(encoding='utf-8-sig'))
    hubs = json.loads(hub_path.read_text(encoding='utf-8-sig'))
    segments = []
    for feature in roads['features']:
        coordinates = feature['geometry']['coordinates']
        for index in range(len(coordinates) - 1):
            start = to_xy(coordinates[index])
            end = to_xy(coordinates[index + 1])
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            if dx * dx + dy * dy == 0:
                continue
            segments.append({'a': start, 'b': end, 'dx': dx, 'dy': dy,
                             'length2': dx * dx + dy * dy, 'cuts': [0, 1],
                             'width': float(feature['properties'].get('도로폭_m') or 0),
                             'name': feature['properties'].get('도로명', '')})
    for first in range(len(segments)):
        for second in range(first + 1, len(segments)):
            split_crossing(segments[first], segments[second])
    result = {'schema_version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
              'sources': {'roads': 'data/received/team_results/roads.geojson',
                          'roads_sha256': hashlib.sha256(road_path.read_bytes()).hexdigest(),
                          'hubs': 'data/greenzone2nd.geojson',
                          'hubs_sha256': hashlib.sha256(hub_path.read_bytes()).hexdigest()},
              'basis': '162 exported road features, geometric intersections, bidirectional approximation',
              'projection': 'Local equirectangular approximation at 37.533 latitude; metres',
              'max_snap_m': 40, 'graphs': {}}
    for width in [0, 7]:
        result['graphs'][str(width)] = make_graph(segments, hubs, width)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    for width in result['graphs']:
        graph = result['graphs'][width]
        print('width', width, 'nodes', len(graph['nodes']), 'edges', len(graph['edges']))
        print(json.dumps(graph['hubs'], ensure_ascii=True))


if __name__ == '__main__':
    # 직접 실행했을 때만 파일을 준비한다. 웹에서 import할 때 재생성하지 않는다.
    parser = argparse.ArgumentParser()
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/processed/route_graph.json')
    args = parser.parse_args()
    prepare(args.data_dir, args.output)
