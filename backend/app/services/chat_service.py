"""AI 旅行助手聊天服务（httpx 直调，流式 SSE）。

不复用 LLMClient.chat_json（它强制 json_object），
而是参照其 URL/headers/body 构造逻辑，添加 streaming + 联网搜索。
不依赖 LangChain —— 避免其版本适配问题。

联网策略（可在 llm 参数里用 web_search 覆盖）：
- zhipu + auto/on  → 智谱原生 web_search 工具
- 其他 + auto/on   → 服务端 Bing 搜索，结果注入 system prompt
- off              → 不联网，纯模型知识
"""
from __future__ import annotations

import json
import logging
from datetime import date
from enum import Enum
from typing import TYPE_CHECKING, Any, Generator

import httpx

from app.core.config import get_settings
from app.services.llm_client import DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_PRESETS
from app.services.chat_intent import detect_plan_intent
from app.services.web_search import format_web_snippets, search_web_snippets

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_CONTEXT_MESSAGES = 10

SYSTEM_PROMPT_BASE = """你是「知径」AI 旅行助手，专注于旅行领域。

你可以帮助用户：
- 推荐目的地、景点、美食、住宿
- 规划行程路线和交通方式
- 回答签证、天气、文化习俗等旅行问题
- 提供实用的旅行建议和避坑指南

今天是 {today}。回答简洁实用，用中文，可用 Markdown 格式化。""".format(
    today=date.today().isoformat(),
)


class WebSearchMode(str, Enum):
    OFF = "off"
    ZHIPU_NATIVE = "zhipu_native"
    BING = "bing"


def resolve_web_search_mode(provider: str, llm_override: dict | None = None) -> WebSearchMode:
    """解析联网模式。llm_override.web_search: true | false | 'auto'（默认 auto）。"""
    raw = None
    if llm_override:
        raw = llm_override.get("web_search")
    if raw is False or raw == "off":
        return WebSearchMode.OFF
    if raw is True or raw == "on":
        return WebSearchMode.ZHIPU_NATIVE if provider == "zhipu" else WebSearchMode.BING
    # auto：智谱走原生，其它走 Bing fallback
    if provider == "zhipu":
        return WebSearchMode.ZHIPU_NATIVE
    return WebSearchMode.BING


def web_search_mode_label(mode: WebSearchMode) -> str:
    if mode == WebSearchMode.ZHIPU_NATIVE:
        return "智谱联网搜索"
    if mode == WebSearchMode.BING:
        return "网页搜索"
    return "离线模式"


def _last_user_message(messages: list[dict[str, str]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") == "user":
            return (msg.get("content") or "").strip()
    return ""


def build_system_prompt(
    *,
    provider: str,
    model: str,
    mode: WebSearchMode,
    bing_context: str = "",
    trip_context: str = "",
) -> str:
    parts = [SYSTEM_PROMPT_BASE]
    parts.append(f"\n你当前使用的模型是 {model}（由 {provider} 提供）。")
    parts.append(
        "\n当用户明确要求「规划/安排/生成」完整旅游行程时，客户端会自动跳转专属定制页；"
        "你可用一句话确认并提示「正在打开行程规划」。"
        "若只是咨询建议、穿衣搭配、景点介绍等，则正常对话回答。"
    )

    if trip_context:
        parts.append(f"\n---\n用户当前关联的行程信息：\n{trip_context}\n---")

    if mode == WebSearchMode.ZHIPU_NATIVE:
        parts.append(
            "\n你已开启智谱联网搜索，可以查询实时天气、开放信息、票价等。"
            "若用户问你是否联网，请如实说明：你可以通过联网搜索获取最新信息。"
            "涉及时效性问题时，请优先使用联网结果，不要声称自己是离线模型。"
        )
    elif mode == WebSearchMode.BING:
        parts.append(
            "\n你已开启网页搜索（服务端 Bing），可参考下方搜索结果回答。"
            "若用户问你是否联网，请如实说明：你可以参考公开网页搜索到的信息。"
            "若搜索结果不足以回答，请说明并给出一般性建议。"
        )
        if bing_context:
            parts.append(f"\n---\n与用户问题相关的网页搜索结果：\n{bing_context}\n---")
    else:
        parts.append(
            "\n当前未开启联网搜索。请基于已有知识回答；"
            "涉及实时天气、票价、政策等问题时，请说明信息可能不是最新的。"
        )

    return "".join(parts)


def load_trip_context(trip_id: str | None, db: Any, user_id: str | None) -> str:
    """加载行程摘要供聊天引用。"""
    if not trip_id or not trip_id.strip():
        return ""
    from app.models import Trip

    trip = db.get(Trip, trip_id.strip())
    if trip is None:
        return ""
    if user_id and trip.user_id != user_id:
        guest_id = "00000000-0000-0000-0000-000000000000"
        if trip.user_id != guest_id:
            return ""
    elif user_id is None:
        guest_id = "00000000-0000-0000-0000-000000000000"
        if trip.user_id != guest_id:
            return ""

    lines = [
        f"标题：{trip.title}",
        f"目的地：{trip.destination}",
        f"日期：{trip.start_date} → {trip.end_date}",
        f"人数：{trip.travelers}",
        f"状态：{trip.status}",
    ]
    if trip.budget_total is not None:
        lines.append(f"预算约：¥{int(trip.budget_total)}")
    prefs = trip.preferences or {}
    hint = prefs.get("chat_hint")
    if hint:
        lines.append(f"用户额外需求：{hint}")
    route_opts = prefs.get("route_options") or []
    if route_opts:
        lines.append("可选路线：" + "、".join(str(r.get("title") or r.get("id")) for r in route_opts[:3]))
    for day in (trip.days or [])[:4]:
        items = day.items or []
        names = [it.name for it in items[:4] if it.name]
        if names:
            lines.append(f"Day{day.day_index}：{' → '.join(names)}")
    return "\n".join(lines)


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


def resolve_server_llm_config(
    llm_override: dict | None = None,
) -> dict[str, str]:
    """智能规划扩写等轻量任务：始终用服务器 Key，仅采纳 provider/model 偏好。"""
    config = resolve_llm_config(None, None)
    if llm_override:
        provider = (llm_override.get("provider") or "").strip()
        model = (llm_override.get("model") or "").strip()
        if provider:
            config["provider"] = provider
            preset = PROVIDER_PRESETS.get(provider, {})
            if model:
                config["model"] = model
            elif preset.get("model"):
                config["model"] = preset["model"]
            if preset.get("base_url"):
                config["base_url"] = preset["base_url"]
        elif model:
            config["model"] = model
    return config


def chat_stream(
    messages: list[dict[str, str]],
    provider: str,
    api_key: str,
    model: str,
    base_url: str,
    llm_override: dict | None = None,
    trip_context: str = "",
) -> Generator[dict[str, str], None, None]:
    """流式聊天，逐块 yield {"type": "reasoning"|"content"|"error"|"action", ...}。"""
    if not api_key:
        yield {"type": "error", "content": "⚠️ 未配置 API Key，请在「设置」中填写。"}
        return

    user_text = _last_user_message(messages)
    plan_action = detect_plan_intent(user_text)
    if plan_action:
        yield {"type": "action", "payload": plan_action}
        dest = plan_action.get("destination", "")
        yield {
            "type": "content",
            "content": f"好的，我来帮你规划 **{dest}** 的行程，正在打开专属定制页面…\n\n"
            f"（日期：{plan_action.get('start_date')} → {plan_action.get('end_date')}）",
        }
        return

    mode = resolve_web_search_mode(provider, llm_override)
    bing_context = ""
    if mode == WebSearchMode.BING:
        query = _last_user_message(messages)
        if query:
            try:
                snippets = search_web_snippets(query, max_results=4)
                bing_context = format_web_snippets(snippets)
                logger.info(
                    "Chat bing search query=%r hits=%d",
                    query[:80],
                    len(snippets),
                )
            except Exception:
                logger.exception("Chat bing search failed")

    sys_content = build_system_prompt(
        provider=provider,
        model=model,
        mode=mode,
        bing_context=bing_context,
        trip_context=trip_context,
    )
    system_msg = {"role": "system", "content": sys_content}
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

    if mode == WebSearchMode.ZHIPU_NATIVE:
        body["tools"] = [{
            "type": "web_search",
            "web_search": {"enable": True, "search_result": False},
        }]

    logger.info(
        "Chat stream provider=%s model=%s web_search=%s base=%s",
        provider,
        model,
        mode.value,
        base_url,
    )

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
                        reasoning = delta.get("reasoning_content", "")
                        if reasoning:
                            yield {"type": "reasoning", "content": reasoning}
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
