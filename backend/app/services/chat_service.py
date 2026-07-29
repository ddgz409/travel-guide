"""AI 旅行助手聊天服务（httpx 直调，流式 SSE）。

不复用 LLMClient.chat_json（它强制 json_object），
而是参照其 URL/headers/body 构造逻辑，添加 streaming + 智谱联网搜索。
不依赖 LangChain —— 避免其版本适配问题。
"""
from __future__ import annotations

import json
import logging
from datetime import date
from typing import TYPE_CHECKING, Any, Generator

import httpx

from app.core.config import get_settings
from app.services.llm_client import DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_PRESETS

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_CONTEXT_MESSAGES = 10

SYSTEM_PROMPT = """你是「旅迹」AI 旅行助手，专注于旅行领域。

你可以帮助用户：
- 推荐目的地、景点、美食、住宿
- 规划行程路线和交通方式
- 回答签证、天气、文化习俗等旅行问题
- 提供实用的旅行建议和避坑指南

今天是 {today}。回答时请注意时效性，优先给出最新的信息。
回答简洁实用，用中文，可用 Markdown 格式化。""".format(
    today=date.today().isoformat(),
)


def resolve_llm_config(
    llm_override: dict | None = None,
    user: "User | None" = None,
) -> dict[str, str]:
    """解析 LLM 配置，返回 {provider, api_key, model, base_url}。"""
    if llm_override and (llm_override.get("api_key") or "").strip():
        provider = (llm_override.get("provider") or DEFAULT_PROVIDER).strip().lower()
        api_key = llm_override["api_key"].strip()
        model = (llm_override.get("model") or "").strip()
        base_url = (llm_override.get("base_url") or "").strip().rstrip("/")
        if not model:
            model = PROVIDER_PRESETS.get(provider, {}).get("model", DEFAULT_MODEL)
        if not base_url:
            base_url = PROVIDER_PRESETS.get(provider, {}).get("base_url", "")
        return {"provider": provider, "api_key": api_key, "model": model, "base_url": base_url}

    if user is not None:
        provider = (getattr(user, "llm_provider", None) or "").strip() or DEFAULT_PROVIDER
        model = (getattr(user, "llm_model", None) or "").strip()
        key = (getattr(user, "llm_api_key", None) or "").strip()
        base = (getattr(user, "llm_base_url", None) or "").strip().rstrip("/")
        if key:
            if not model:
                model = PROVIDER_PRESETS.get(provider, {}).get("model", DEFAULT_MODEL)
            if not base:
                base = PROVIDER_PRESETS.get(provider, {}).get("base_url", "")
            return {"provider": provider, "api_key": key, "model": model, "base_url": base}

    provider = (settings.LLM_PROVIDER or DEFAULT_PROVIDER).strip().lower()
    model = (settings.LLM_MODEL or "").strip() or PROVIDER_PRESETS.get(provider, {}).get("model", DEFAULT_MODEL)
    base_url = (settings.LLM_BASE_URL or "").strip().rstrip("/") or PROVIDER_PRESETS.get(provider, {}).get("base_url", "")

    api_key = (settings.LLM_API_KEY or "").strip()
    if not api_key:
        by_provider = {
            "zhipu": settings.ZHIPU_API_KEY,
            "deepseek": settings.DEEPSEEK_API_KEY,
            "doubao": settings.DOUBAO_API_KEY,
            "mimo": settings.MIMO_API_KEY,
        }
        api_key = (by_provider.get(provider) or "").strip()
    if not api_key:
        api_key = (settings.ZHIPU_API_KEY or "").strip()

    return {"provider": provider, "api_key": api_key, "model": model, "base_url": base_url}


def chat_stream(
    messages: list[dict[str, str]],
    provider: str,
    api_key: str,
    model: str,
    base_url: str,
) -> Generator[dict[str, str], None, None]:
    """流式聊天，逐块 yield {"type": "reasoning"|"content"|"error", "content": "..."}。"""
    if not api_key:
        yield {"type": "error", "content": "⚠️ 未配置 API Key，请在「设置」中填写。"}
        return

    # 构造消息（系统提示 + 最近 N 条对话）
    system_msg = {"role": "system", "content": SYSTEM_PROMPT}
    recent = messages[-MAX_CONTEXT_MESSAGES:]
    payload_messages = [system_msg] + recent

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": payload_messages,
        "temperature": 0.7,
        "max_tokens": 2048,
        "stream": True,
    }

    # 智谱 GLM-4 联网搜索
    if provider == "zhipu":
        body["tools"] = [{
            "type": "web_search",
            "web_search": {"enable": True, "search_result": False},
        }]

    logger.info("Chat stream provider=%s model=%s base=%s", provider, model, base_url)

    try:
        with httpx.Client(timeout=90.0) as client:
            with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    yield {"type": "error", "content": f"❌ 请求失败 (HTTP {resp.status_code})"}
                    return

                for raw_line in resp.iter_lines():
                    line = raw_line.strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        # 思考过程（DeepSeek-R1 / 智谱 GLM-4.5+ 等模型支持）
                        reasoning = delta.get("reasoning_content", "")
                        if reasoning:
                            yield {"type": "reasoning", "content": reasoning}
                        # 正式回答
                        content = delta.get("content", "")
                        if content:
                            yield {"type": "content", "content": content}
                    except (json.JSONDecodeError, KeyError, IndexError):
                        pass
    except httpx.HTTPError as e:
        logger.exception("Chat stream HTTP error")
        yield {"type": "error", "content": f"❌ 网络错误：{e}"}
    except Exception as e:
        logger.exception("Chat stream error")
        yield {"type": "error", "content": f"❌ 未知错误：{e}"}
