"""API 路由聚合。"""
from fastapi import APIRouter

from app.api import app_update, auth, chat, destination, expenses, trips

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(trips.router)
api_router.include_router(expenses.router)
api_router.include_router(chat.router)
api_router.include_router(destination.router)
api_router.include_router(app_update.router)
