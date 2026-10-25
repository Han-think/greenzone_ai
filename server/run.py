"""그린존 서버 실행 파일. 프로젝트 루트의 기존 FastAPI 앱을 실행한다."""

import argparse
import os
import sys
from pathlib import Path

import uvicorn


def start_server(port=8000):
    # 이 파일은 server 폴더 안에 있으므로 한 단계 위가 프로젝트 루트다.
    project_root = Path(__file__).resolve().parent.parent

    # 어느 폴더에서 실행해도 기존 main.py와 데이터 파일을 찾도록 위치를 맞춘다.
    os.chdir(project_root)
    sys.path.insert(0, str(project_root))

    # main.py의 app은 이미 지도·배출 안내·관리자 URL을 연결한 FastAPI 객체다.
    # localhost는 현재 PC에서만 접속한다. 브라우저도 같은 주소를 사용한다.
    # 로그인 세션이 메모리에 있으므로 이번 시연은 서버 프로세스 1개로 실행한다.
    print(f"그린존 실행 주소: http://localhost:{port}")
    print("종료하려면 이 터미널에서 Ctrl+C를 누르세요.")
    # 주소 검색 쿼리가 터미널 접근 로그에 남지 않도록 기본 로그를 끈다.
    uvicorn.run("main:app", host="localhost", port=port, workers=1, access_log=False)


# 이 파일을 직접 실행했을 때만 서버를 켠다. import할 때는 실행하지 않는다.
if __name__ == "__main__":
    # argparse는 터미널에서 --port 숫자를 선택적으로 읽는다. 기본값은 8000이다.
    parser = argparse.ArgumentParser(description="그린존 로컬 서버 실행")
    parser.add_argument("--port", type=int, default=8000, help="실행 포트 (기본 8000)")
    args = parser.parse_args()
    start_server(args.port)
