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
    # 微信/浏览器打开的分享页公网地址，例如 http://81.71.159.218:3000
    PUBLIC_SHARE_BASE: str = "http://81.71.159.218:3000"

    # 数据库
    DATABASE_URL: str = "sqlite:///./travel_guide.db"

    # JWT
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 天

    # 高德地图 Web 服务（主 Key + 备用 Key，配额用尽时自动切换）
    AMAP_API_KEY: str = ""
    AMAP_API_KEY_BACKUP: str = ""
    # 可选：逗号分隔多个 Key，优先级从左到右（设置后覆盖上面两个）
    AMAP_API_KEYS: str = ""

    @property
    def amap_api_keys(self) -> List[str]:
        """去重后的高德 Key 列表（主 → 备 → 其余）。"""
        raw: list[str] = []
        if self.AMAP_API_KEYS.strip():
            raw = [k.strip() for k in self.AMAP_API_KEYS.split(",")]
        else:
            raw = [self.AMAP_API_KEY.strip(), self.AMAP_API_KEY_BACKUP.strip()]
        seen: set[str] = set()
        out: list[str] = []
        for k in raw:
            if k and k not in seen:
                seen.add(k)
                out.append(k)
        return out

    # LLM 服务器默认：智谱 glm-4（用户可在设置页覆盖自己的 key/模型）
    # LLM_PROVIDER: zhipu | doubao | mimo | deepseek | openai
    LLM_PROVIDER: str = "zhipu"
    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = ""  # 空则用提供商默认
    LLM_MODEL: str = "glm-4-flash-250414"

    # 各提供商服务器级 Key（用户未自填时回退）
    ZHIPU_API_KEY: str = ""
    ZHIPU_MODEL: str = "glm-4-flash-250414"
    # 视觉模型（拍照识景 / 看酒店·车票·地图截图）
    ZHIPU_VISION_MODEL: str = "glm-4.6v-flash"
    DOUBAO_API_KEY: str = ""  # 火山方舟
    MIMO_API_KEY: str = ""  # 小米 MiMo
    DEEPSEEK_API_KEY: str = ""

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
