"""API 路由聚合。"""
from fastapi import APIRouter

from app.api import auth, trips

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(trips.router)
