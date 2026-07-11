"""认证相关 Pydantic 模型。"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    """注册请求。"""

    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    """登录请求。"""

    username: str
    password: str


class UserOut(BaseModel):
    """用户响应。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    created_at: datetime


class Token(BaseModel):
    """登录成功返回的令牌。"""

    access_token: str
    token_type: str = "bearer"
    user: UserOut
