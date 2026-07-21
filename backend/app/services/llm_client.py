"""通用 LLM 客户端（OpenAI 兼容接口）。

服务器默认：智谱 glm-4（.env）。
登录用户可在「设置」中填写自己的 API Key / 选择模型，生成时优先使用用户配置。
"""
from __future__ import annotations

import json
import logging
from typing import Any, TYPE_CHECKING

import httpx

from app.core.config import get_settings

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)
settings = get_settings()

# 提供商预设（可被 LLM_BASE_URL / LLM_MODEL 覆盖）
PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4",
        "label": "智谱 GLM",
    },
    "doubao": {
        # 火山方舟 OpenAI 兼容；模型可为模型名或接入点 ep-xxx
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "model": "doubao-seed-1-6",
        "label": "豆包（火山方舟）",
    },
    "mimo": {
        "base_url": "https://api.xiaomimimo.com/v1",
        "model": "mimo-v2.5-pro",
        "label": "小米 MiMo",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-v4-flash",
        "label": "DeepSeek",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "label": "OpenAI 兼容",
    },
}

# 设置页推荐模型列表（仍可手填自定义）
# 智谱 API model 编码，见 https://docs.bigmodel.cn/cn/guide/start/model-overview
SUGGESTED_MODELS: dict[str, list[str]] = {
    "zhipu": [
        # 新一代（推荐）
        "glm-5.2",
        "glm-5.1",
        "glm-5",
        "glm-5-turbo",
        "glm-4.7",
        "glm-4.7-flash",  # 免费
        "glm-4.7-flashx",
        "glm-4.6",
        "glm-4.5-air",
        "glm-4.5-airx",
        "glm-4.5-flash",  # 免费（即将下线）
        # 经典 / 服务器默认
        "glm-4",
        "glm-4-plus",
        "glm-4-air",
        "glm-4-long",
        "glm-4-flash",
        "glm-4-flash-250414",  # 免费
        "glm-4-flashx-250414",
    ],
    "doubao": [
        # 火山方舟模型名（也可用控制台接入点 ID：ep-xxxxxxxx）
        "doubao-seed-2-0-pro-260215",
        "doubao-seed-2-0-mini-260215",
        "doubao-seed-1-6",
        "doubao-seed-1-6-flash",
        "doubao-1-5-pro-32k",
        "doubao-1-5-lite-32k",
        "doubao-pro-32k",
        "doubao-lite-32k",
    ],
    "mimo": [
        "mimo-v2.5-pro",
        "mimo-v2.5",
    ],
    "deepseek": ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat"],
    "openai": ["gpt-4o-mini", "gpt-4o"],
}

DEFAULT_PROVIDER = "zhipu"
DEFAULT_MODEL = "glm-4"

# 兼容旧测试名
_PROVIDER_PRESETS = PROVIDER_PRESETS


class LLMError(Exception):
    """LLM 调用异常。"""


class LLMClient:
    """OpenAI 兼容 Chat Completions 客户端，要求 JSON 输出。"""

    def __init__(
        self,
        provider: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.provider = (provider or settings.LLM_PROVIDER or DEFAULT_PROVIDER).strip().lower()
        if self.provider not in PROVIDER_PRESETS:
            raise LLMError(
                f"未知 LLM_PROVIDER={self.provider!r}，可选: {', '.join(PROVIDER_PRESETS)}"
            )

        preset = PROVIDER_PRESETS[self.provider]
        # api_key 显式传入非空 → 用用户 key；否则回退服务器 .env
        if api_key and api_key.strip():
            self.api_key = api_key.strip()
        else:
            self.api_key = self._resolve_server_api_key()

        explicit_model = (model or "").strip()
        server_provider = (settings.LLM_PROVIDER or DEFAULT_PROVIDER).strip().lower()
        if explicit_model:
            self.model = explicit_model
        elif self.provider == server_provider:
            # 仅当与服务器默认提供商一致时，才用 .env 的 LLM_MODEL
            self.model = (
                (settings.LLM_MODEL or "").strip()
                or self._legacy_model()
                or preset["model"]
                or DEFAULT_MODEL
            )
        else:
            self.model = preset["model"]

        self.base_url = (
            (base_url or settings.LLM_BASE_URL or preset["base_url"]).rstrip("/")
        )
        self.label = preset["label"]

    @classmethod
    def for_user(cls, user: "User | None") -> "LLMClient":
        """按用户设置构造客户端；无用户或未配置则用服务器默认。"""
        if user is None:
            return cls()
        provider = (getattr(user, "llm_provider", None) or "").strip() or None
        model = (getattr(user, "llm_model", None) or "").strip() or None
        key = (getattr(user, "llm_api_key", None) or "").strip() or None
        return cls(provider=provider, api_key=key, model=model)

    def _resolve_server_api_key(self) -> str:
        if settings.LLM_API_KEY:
            return settings.LLM_API_KEY
        by_provider = {
            "zhipu": settings.ZHIPU_API_KEY,
            "deepseek": settings.DEEPSEEK_API_KEY,
            "doubao": settings.DOUBAO_API_KEY,
            "mimo": settings.MIMO_API_KEY,
        }
        key = (by_provider.get(self.provider) or "").strip()
        if key:
            return key
        # 最后回退服务器默认智谱
        return settings.ZHIPU_API_KEY or ""

    def _legacy_model(self) -> str:
        if self.provider == "zhipu" and settings.ZHIPU_MODEL:
            return settings.ZHIPU_MODEL
        return ""

    @property
    def available(self) -> bool:
        key = (self.api_key or "").strip()
        return bool(key) and key not in {
            "your-zhipu-api-key-here",
            "your-deepseek-api-key-here",
            "your-doubao-api-key-here",
            "your-mimo-api-key-here",
            "your-llm-api-key-here",
        }

    def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """调用 LLM 并解析为 JSON 对象。"""
        if not self.available:
            raise LLMError(
                f"未配置 {self.label} API key。"
                f"请在「设置」中填写自己的 Key，或在服务器 .env 配置 ZHIPU_API_KEY。"
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]
        try:
            content = self._call_http(messages, temperature, max_tokens)
        except LLMError:
            raise
        except Exception as e:
            raise LLMError(f"{self.label} 调用失败: {e}") from e

        return self._parse_json(content)

    def _call_http(
        self, messages: list[dict], temperature: float, max_tokens: int
    ) -> str:
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        logger.info("LLM 请求 provider=%s model=%s", self.provider, self.model)
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                raise LLMError(
                    f"{self.label} HTTP {resp.status_code}: {resp.text[:400]}"
                )
            data = resp.json()
        try:
            return data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as e:
            raise LLMError(f"{self.label} 响应格式异常: {data!r}") from e

    @staticmethod
    def _parse_json(content: str) -> dict[str, Any]:
        text = content.strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.lower().startswith("json"):
                text = text[4:].strip()
        try:
            result = json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError(
                f"LLM 输出无法解析为 JSON: {e}\n原始内容: {content[:500]}"
            ) from e
        if not isinstance(result, dict):
            raise LLMError(f"LLM 输出非 JSON 对象: {type(result)}")
        return result


def mask_api_key(key: str | None) -> str | None:
    """脱敏展示 API Key。"""
    if not key:
        return None
    k = key.strip()
    if len(k) <= 8:
        return "****"
    return f"{k[:4]}****{k[-4:]}"


def effective_llm_settings(user: "User | None") -> dict[str, Any]:
    """供设置页展示的有效配置（不返回完整 key）。"""
    client = LLMClient.for_user(user)
    user_key = (getattr(user, "llm_api_key", None) or "").strip() if user else ""
    return {
        "provider": client.provider,
        "model": client.model,
        "has_api_key": bool(user_key),
        "api_key_hint": mask_api_key(user_key) if user_key else None,
        "using_server_default": not bool(user_key),
        "available_providers": [
            {"id": k, "label": v["label"]} for k, v in PROVIDER_PRESETS.items()
        ],
        "suggested_models": SUGGESTED_MODELS,
        "defaults": {"provider": DEFAULT_PROVIDER, "model": DEFAULT_MODEL},
    }


# 兼容旧名称
ZhipuClient = LLMClient

_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    global _client
    if _client is None:
        _client = LLMClient()
        logger.info(
            "LLM 服务器默认 provider=%s model=%s",
            _client.provider,
            _client.model,
        )
    return _client


def get_zhipu_client() -> LLMClient:
    """兼容旧导入名。"""
    return get_llm_client()
