import os
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

# .env 파일 불러오기
load_dotenv()

app = FastAPI()

# <-- static 폴더를 웹 서버에 마운트(연결)하는 코드 추가
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/data", StaticFiles(directory="data"), name="data")

templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    # .env에서 키 값을 읽어옵니다.
    vworld_key = os.environ.get("VWORLD_KEY")
    juso_key = os.environ.get("JUSO_KEY")
    
    # index.html 파일에 변수(vworld_key)를 담아서 화면에 뿌려줍니다.
    return templates.TemplateResponse(
        request=request, 
        name="index.html", 
        context={"vworld_key": vworld_key, "juso_key": juso_key}
    )