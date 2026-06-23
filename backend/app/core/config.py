"""应用配置管理。

所有敏感配置通过环境变量 / .env 文件注入，不在代码中硬编码。
"""
from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置。从环境变量和 .env 文件读取。"""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # 应用
    APP_NAME: str = "旅行攻略生成器"
    API_V1_PREFIX: str = "/api/v1"
    CORS_ORIGINS: str = "http://localhost:3000"

    # 数据库
    DATABASE_URL: str = "sqlite:///./travel_guide.db"

    # JWT
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 天

    # 高德地图
    AMAP_API_KEY: str = ""

    # 智谱 GLM
    ZHIPU_API_KEY: str = ""
    ZHIPU_MODEL: str = "glm-4"

    @field_validator("CORS_ORIGINS")
    @classmethod
    def parse_cors_origins(cls, v: str) -> str:
        return v

    @property
    def cors_origins_list(self) -> List[str]:
        """将逗号分隔的 CORS 来源字符串转为列表。"""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        """是否使用 SQLite。"""
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    """获取配置单例。"""
    return Settings()
