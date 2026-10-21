"""도로망 읽기 → 구간 최단거리 → 가까운 거점부터 방문하는 순회 경로안.

웹 실행에는 Python 기본 기능만 쓴다. 전역 최적 경로·실제 운행 승인을 뜻하지 않는다.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def load_route_data():
    # 준비된 점·도로 연결 JSON을 읽는다. 원본이 바뀌었으면 다시 준비해야 한다.
    path = ROOT / 'data/processed/route_graph.json'
    with open(path, encoding='utf-8') as file:
        data = json.load(file)
    for name in ['roads', 'hubs']:
        source = ROOT / data['sources'][name]
        actual = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual != data['sources'][name + '_sha256']:
            raise ValueError('도로 또는 거점 자료가 바뀌었습니다. prepare_route_graph.py를 실행하세요.')
    return data


def make_connections(graph):
    # 점마다 '어느 이웃 점까지 몇 m인가'를 딕셔너리 안의 리스트로 정리한다.
    # 일방통행 자료가 없어 양방향으로 연결한다. 실제 차량 통행 가능 판정은 아니다.
    connections = {}
    for node in graph['nodes']:
        connections[node] = []
    for edge in graph['edges']:
        connections[edge['start']].append({'node': edge['end'], 'metres': edge['length_m']})
        connections[edge['end']].append({'node': edge['start'], 'metres': edge['length_m']})
    return connections


def shortest_paths(connections, start):
    # 다익스트라: 아직 확인하지 않은 점 중 누적거리가 가장 짧은 점부터 확인한다.
    # distances=시작점부터의 거리, previous=경로를 거꾸로 찾기 위한 이전 점이다.
    distances = {start: 0}
    previous = {}
    checked = {}
    while True:
        current = None
        shortest = float('inf')
        for node in distances:
            if node not in checked and distances[node] < shortest:
                current = node
                shortest = distances[node]
        if current is None:
            break
        checked[current] = True
        for neighbour in connections[current]:
            candidate = shortest + neighbour['metres']
            if candidate < distances.get(neighbour['node'], float('inf')):
                distances[neighbour['node']] = candidate
                previous[neighbour['node']] = current
    return {'distances': distances, 'previous': previous}


def restore_path(previous, start, end, nodes):
    # 목적지에서 이전 점을 따라 출발점까지 찾은 뒤 뒤집는다. 직선 대체는 하지 않는다.
    path = [nodes[end]]
    current = end
    while current != start:
        if current not in previous:
            raise ValueError('받은 도로망에서 연결 경로를 찾지 못했습니다.')
        current = previous[current]
        path.append(nodes[current])
    path.reverse()
    return path


def plan_route(data, hub_ids, start, minimum_width, return_to_start, order_mode='auto'):
    # 입력 검토: 현재 9개 거점에서 2~9개, 도로폭은 전체(0) 또는 7m 이상만 허용한다.
    if order_mode not in ['auto', 'manual']:
        raise ValueError('방문 순서는 자동 또는 직접 지정으로 선택하세요.')
    if minimum_width not in [0, 7]:
        raise ValueError('도로폭 조건은 전체 또는 등록폭 7m 이상을 선택하세요.')
    if len(hub_ids) < 2 or len(hub_ids) > 9:
        raise ValueError('거점을 2~9개 선택하세요.')
    unique = []
    for hub_id in hub_ids:
        if hub_id in unique:
            raise ValueError('같은 거점을 중복 선택할 수 없습니다.')
        unique.append(hub_id)
    graph = data['graphs'][str(minimum_width)]
    for hub_id in hub_ids:
        if hub_id not in graph['hubs']:
            raise ValueError('현재 거점안에 없는 ID입니다: ' + hub_id)
        hub = graph['hubs'][hub_id]
        if hub['node'] is None:
            raise ValueError(hub_id + ': ' + hub['reason'])
    if start not in hub_ids:
        raise ValueError('출발 거점은 선택한 거점 중에서 고르세요.')
    if order_mode == 'manual' and start != hub_ids[0]:
        raise ValueError('직접 지정에서는 1번 거점이 출발 거점입니다.')
    connections = make_connections(graph)
    paths = {}
    for hub_id in hub_ids:
        paths[hub_id] = shortest_paths(connections, graph['hubs'][hub_id]['node'])
    # 전 거점이 연결되는지 먼저 확인한다. 끊어진 경우 부분 경로를 성공으로 내보내지 않는다.
    for hub_id in hub_ids:
        node = graph['hubs'][hub_id]['node']
        if node not in paths[start]['distances']:
            raise ValueError('선택 조건의 받은 도로망에서 ' + hub_id + '까지 연결되지 않습니다. 거점·도로폭 조건을 확인하세요.')
    # 직접 지정에서는 화면에서 받은 1번~마지막 순서를 그대로 사용한다.
    # 방문 순서만 사람이 정하며, 각 거점 사이 도로 구간은 동일한 최단거리 계산을 쓴다.
    if order_mode == 'manual':
        order = list(hub_ids)
    else:
        # 최근접 이웃법: 현재 거점에서 도로거리가 가장 가까운 미방문 거점을 다음으로 고른다.
        order = [start]
        while len(order) < len(hub_ids):
            current = order[-1]
            next_hub = None
            shortest = float('inf')
            for hub_id in hub_ids:
                if hub_id in order:
                    continue
                distance = paths[current]['distances'][graph['hubs'][hub_id]['node']]
                if distance < shortest:
                    shortest = distance
                    next_hub = hub_id
            order.append(next_hub)
    if return_to_start:
        order.append(start)
    legs = []
    total = 0
    for index in range(len(order) - 1):
        first = order[index]
        second = order[index + 1]
        first_node = graph['hubs'][first]['node']
        second_node = graph['hubs'][second]['node']
        distance = paths[first]['distances'][second_node]
        coordinates = restore_path(paths[first]['previous'], first_node, second_node, graph['nodes'])
        legs.append({'from': first, 'to': second, 'distance_m': round(distance, 1), 'coordinates': coordinates})
        total += distance
    stops = []
    for hub_id in hub_ids:
        stop = dict(graph['hubs'][hub_id])
        stop['id'] = hub_id
        stop['road_coordinates'] = graph['nodes'][stop['node']]
        stops.append(stop)
    method = 'road_shortest_path_then_nearest_neighbour'
    if order_mode == 'manual':
        method = 'manual_order_road_shortest_paths'
    return {'status': 'proposal', 'method': method, 'order_mode': order_mode,
            'minimum_width_m': minimum_width, 'return_to_start': return_to_start,
            'order': order, 'distance_m': round(total, 1), 'legs': legs, 'stops': stops,
            'basis': '팀 1차 내보낸 도로 162구간을 이용한 별도 경로안. 팀 2차의 3.22km 재현값이 아닙니다.',
            'limits': '양방향 도로망 근사 · 전역 최적 아님 · 차고지/일방통행/회전/정차 미반영 · 거점↔도로 접속거리 제외'}
