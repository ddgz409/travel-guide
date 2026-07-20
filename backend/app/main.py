"""FastAPI 应用入口。

启动: uvicorn app.main:app --reload --port 8000
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.core.config import get_settings
from app.core.database import Base, engine, ensure_sqlite_columns

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    description="AI 生成旅行攻略的后端 API",
)

# CORS：允许前端跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.on_event("startup")
def on_startup() -> None:
    """启动时自动建表（MVP 用 create_all，生产应改用 Alembic 迁移）。"""
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_columns()


@app.get("/")
def root():
    return {"name": settings.APP_NAME, "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
