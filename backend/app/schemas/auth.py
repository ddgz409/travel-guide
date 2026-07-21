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


class LlmSettingsOut(BaseModel):
    """用户 LLM 设置（不返回完整 API Key）。"""

    provider: str
    model: str
    has_api_key: bool
    api_key_hint: str | None = None
    using_server_default: bool = True
    available_providers: list[dict[str, str]] = Field(default_factory=list)
    suggested_models: dict[str, list[str]] = Field(default_factory=dict)
    defaults: dict[str, str] = Field(default_factory=dict)


class LlmSettingsUpdate(BaseModel):
    """更新 LLM 设置。api_key 为 null 表示不改；空字符串表示清除（改回服务器默认）。"""

    provider: str | None = Field(default=None, max_length=32)
    model: str | None = Field(default=None, max_length=64)
    api_key: str | None = Field(default=None, max_length=256)
