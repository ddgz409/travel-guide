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
from app.services.web_search import format_web_snippets, search_web_snippets
from app.services.planning_tools import (
    PLANNING_SYSTEM_SUFFIX,
    PLANNING_TOOLS,
    PLANNING_TOOL_NAMES,
    execute_planning_tool,
    is_planning_conversation,
)
from app.services.agent_tools import (
    AGENT_SYSTEM_SUFFIX,
    COLLECTION_EDIT_TOOLS,
    CONFIRM_REQUIRED,
    SHARE_TOOLS,
    TRIP_MGMT_TOOLS,
    execute_tool,
    preview_tool,
)
from app.services.chat_intent import is_trip_management_intent

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
    agent_enabled: bool = False,
    planning_enabled: bool = False,
) -> str:
    parts = [SYSTEM_PROMPT_BASE]
    parts.append(f"\n你当前使用的模型是 {model}（由 {provider} 提供）。")
    parts.append(
        "\n当用户明确要求规划完整旅游行程时，请用逐步追问收集细节（目的地、天数、日期等），"
        "信息足够后再生成。若只是咨询建议、穿衣搭配、景点介绍等，则正常对话回答。"
    )

    if trip_context:
        parts.append(f"\n---\n用户当前关联的行程信息：\n{trip_context}\n---")

    if planning_enabled:
        parts.append(PLANNING_SYSTEM_SUFFIX)

    if agent_enabled:
        parts.append(AGENT_SYSTEM_SUFFIX)

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


def _parse_tool_calls(chunk: dict[str, Any]) -> list[dict[str, Any]] | None:
    """从 streaming chunk 提取 tool_calls（兼容智谱/OpenAI 格式）。"""
    choice = chunk.get("choices", [{}])[0]
    delta = choice.get("delta", {})
    tc = delta.get("tool_calls")
    if tc:
        return tc
    # 有些模型在非 stream chunk 中直接给 message.tool_calls
    msg = choice.get("message", {})
    return msg.get("tool_calls")


def _run_llm_stream(
    url: str,
    headers: dict[str, str],
    body: dict[str, Any],
) -> Generator[dict[str, Any], None, None]:
    """单次 LLM 流式请求，yield 原始 chunk。"""
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
                    yield json.loads(data)
                except json.JSONDecodeError:
                    pass


def chat_stream(
    messages: list[dict[str, str]],
    provider: str,
    api_key: str,
    model: str,
    base_url: str,
    llm_override: dict | None = None,
    trip_context: str = "",
    db: Any = None,
    user: "User | None" = None,
) -> Generator[dict[str, Any], None, None]:
    """流式聊天，逐块 yield {"type": "reasoning"|"content"|"error"|"action"|"tool_call"|"tool_result", ...}。"""
    if not api_key:
        yield {"type": "error", "content": "⚠️ 未配置 API Key，请在「设置」中填写。"}
        return

    user_text = _last_user_message(messages)
    # 规划改为 LLM 逐步追问，不再在这里直接跳转生成页
    agent_enabled = user is not None and db is not None
    # 意图门控：仅当用户明确表达行程管理/查看列表意图时才注入行程工具，
    # 避免咨询类问题（推荐/介绍/怎么玩）被 LLM 误调 list_trips 弹出「我的攻略」列表
    mgmt_tools_enabled = agent_enabled and is_trip_management_intent(user_text)
    planning_enabled = not trip_context and (
        is_planning_conversation(user_text)
        or any(
            is_planning_conversation(m.get("content", ""))
            for m in messages
            if m.get("role") == "user"
        )
    )

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
        agent_enabled=agent_enabled,
        planning_enabled=planning_enabled,
    )
    system_msg = {"role": "system", "content": sys_content}
    recent = messages[-MAX_CONTEXT_MESSAGES:]
    payload_messages = [system_msg] + recent

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    logger.info(
        "Chat stream provider=%s model=%s web_search=%s agent=%s mgmt=%s planning=%s base=%s",
        provider,
        model,
        mode.value,
        agent_enabled,
        mgmt_tools_enabled,
        planning_enabled,
        base_url,
    )

    # Agent 循环：LLM 可能多次调用工具
    # 限制 3 轮，避免自问自答死循环；追问类工具（ask_user_choice/date）后立即停止等待用户回复
    max_rounds = 3
    for _round in range(max_rounds):
        body: dict[str, Any] = {
            "model": model,
            "messages": payload_messages,
            "temperature": 0.7,
            "max_tokens": 2048,
            "stream": True,
        }

        fn_tools: list[dict[str, Any]] = []
        if planning_enabled:
            fn_tools.extend(PLANNING_TOOLS)
        if agent_enabled:
            # 分享工具始终可用；行程管理工具仅在有明确管理意图时注入
            fn_tools.extend(SHARE_TOOLS)
            if mgmt_tools_enabled:
                fn_tools.extend(TRIP_MGMT_TOOLS)
                # 把已有攻略做成/编辑成共享贴子（帖子/清单/收藏夹）也属于管理意图
                fn_tools.extend(COLLECTION_EDIT_TOOLS)

        if mode == WebSearchMode.ZHIPU_NATIVE:
            body["tools"] = [{
                "type": "web_search",
                "web_search": {"enable": True, "search_result": False},
            }]
            if fn_tools:
                body["tools"] = body["tools"] + fn_tools
        elif fn_tools:
            body["tools"] = fn_tools

        try:
            # 收集本次流式响应的 tool_calls 和 content
            tool_calls_acc: dict[int, dict[str, Any]] = {}
            content_acc = ""
            finish_reason = ""

            for chunk in _run_llm_stream(url, headers, body):
                if chunk.get("type") == "error":
                    yield chunk
                    return

                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                finish_reason = choice.get("finish_reason") or finish_reason

                # tool_calls 流式累加
                tc = delta.get("tool_calls")
                if tc:
                    for item in tc:
                        idx = item.get("index", 0)
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": "", "type": "function", "function": {"name": "", "arguments": ""}}
                        if item.get("id"):
                            tool_calls_acc[idx]["id"] = item["id"]
                        fn = item.get("function", {})
                        if fn.get("name"):
                            tool_calls_acc[idx]["function"]["name"] = fn["name"]
                        if fn.get("arguments"):
                            tool_calls_acc[idx]["function"]["arguments"] += fn["arguments"]

                reasoning = delta.get("reasoning_content", "")
                if reasoning:
                    yield {"type": "reasoning", "content": reasoning}
                content = delta.get("content", "")
                if content:
                    content_acc += content
                    yield {"type": "content", "content": content}

            # 没有 tool_calls → 对话结束
            if not tool_calls_acc:
                return

            # 有 tool_calls → 执行工具，把结果追加到 messages，继续下一轮
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": content_acc or None}
            assistant_msg["tool_calls"] = [tool_calls_acc[i] for i in sorted(tool_calls_acc)]
            payload_messages.append(assistant_msg)

            # 本轮是否触发了需要用户回复的工具（ask_user_choice / ask_user_date）
            # 如果是，执行完工具后必须停下来等用户回复，不能继续让 LLM 自问自答
            awaiting_user_reply = False

            for idx in sorted(tool_calls_acc):
                tc = tool_calls_acc[idx]
                fn_name = tc["function"]["name"]
                fn_args_raw = tc["function"]["arguments"]
                try:
                    fn_args = json.loads(fn_args_raw) if fn_args_raw else {}
                except json.JSONDecodeError:
                    fn_args = {}

                logger.info("Agent tool call: %s(%s)", fn_name, fn_args)
                yield {"type": "tool_call", "tool": fn_name, "args": fn_args}

                # 一次只问一个：同一回合内模型若连续发起多个追问/生成工具，
                # 只执行第一个，其余直接跳过，避免连环弹出多个问题卡片
                if awaiting_user_reply and fn_name in PLANNING_TOOL_NAMES:
                    skip = (
                        "已向用户提出一个问题并等待回复，请停止继续追问，"
                        "等用户回答后再问下一个问题。"
                    )
                    yield {"type": "tool_result", "tool": fn_name, "result": skip}
                    payload_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": skip,
                    })
                    continue

                if fn_name in PLANNING_TOOL_NAMES:
                    result = execute_planning_tool(fn_name, fn_args)
                    if result.get("ok"):
                        info = result.get("result") or {}
                        if fn_name == "ask_user_choice":
                            awaiting_user_reply = True
                            yield {
                                "type": "action",
                                "payload": {
                                    "action": "show_choices",
                                    "style": info.get("style", "chips"),
                                    "options": info.get("options") or [],
                                    "confirm_label": info.get("confirm_label", "确认"),
                                },
                            }
                        elif fn_name == "ask_user_date":
                            awaiting_user_reply = True
                            yield {
                                "type": "action",
                                "payload": {
                                    "action": "show_date_picker",
                                    "destination": info.get("destination") or "",
                                    "suggest_days": info.get("suggest_days") or 3,
                                },
                            }
                        elif fn_name == "finalize_plan":
                            yield {"type": "action", "payload": info}
                    if not result.get("ok"):
                        tool_output = f"错误：{result.get('error', '未知错误')}"
                    else:
                        tool_output = json.dumps(
                            result["result"], ensure_ascii=False, default=str
                        )
                    yield {"type": "tool_result", "tool": fn_name, "result": tool_output}
                    payload_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": tool_output,
                    })
                    continue

                # 危险操作：不执行，发确认事件让前端弹窗，结果由前端走 REST 完成
                if fn_name in CONFIRM_REQUIRED:
                    preview = preview_tool(fn_name, fn_args, db, user)
                    if preview.get("ok"):
                        info = preview["result"]
                        yield {
                            "type": "confirmation_required",
                            "payload": {"tool": fn_name, **info},
                        }
                        tool_output = json.dumps(
                            {
                                "pending_confirmation": True,
                                "message": f"已向用户弹出删除确认窗口（行程：{info['title']}），等待用户点击确认或取消。请简短告知用户查看弹窗。",
                            },
                            ensure_ascii=False,
                        )
                        yield {"type": "tool_result", "tool": fn_name, "result": tool_output}
                        payload_messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": tool_output,
                        })
                        continue
                    result = preview
                    tool_output = f"错误：{preview.get('error', '未知错误')}"
                    yield {"type": "tool_result", "tool": fn_name, "result": tool_output}
                    payload_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": tool_output,
                    })
                    continue

                # open_trip / open_shared_trip / edit_collection_from_trip 是纯前端动作，直接发 action 事件
                if fn_name in ("open_trip", "open_shared_trip", "edit_collection_from_trip"):
                    result = execute_tool(fn_name, fn_args, db, user)
                    if result.get("ok") and result.get("result", {}).get("navigate"):
                        if fn_name == "open_trip":
                            yield {
                                "type": "action",
                                "payload": {
                                    "action": "open_trip",
                                    "trip_id": result["result"]["trip_id"],
                                    "title": result["result"]["title"],
                                },
                            }
                        elif fn_name == "open_shared_trip":
                            yield {
                                "type": "action",
                                "payload": {
                                    "action": "open_share",
                                    "token": result["result"]["token"],
                                    "title": result["result"]["title"],
                                },
                            }
                        else:
                            # edit_collection_from_trip：打开发布收藏夹编辑页，前端流式填入地点
                            r = result["result"]
                            yield {
                                "type": "action",
                                "payload": {
                                    "action": "open_collection_editor",
                                    "trip_id": r.get("trip_id"),
                                    "title": r.get("title") or "",
                                    "summary": r.get("summary") or "",
                                    "destination": r.get("destination") or "",
                                    "emoji": r.get("emoji") or "📁",
                                    "places": r.get("places") or [],
                                },
                            }
                else:
                    result = execute_tool(fn_name, fn_args, db, user)

                if not result.get("ok"):
                    tool_output = f"错误：{result.get('error', '未知错误')}"
                else:
                    tool_output = json.dumps(result["result"], ensure_ascii=False, default=str)
                    if fn_name == "list_trips":
                        info = result.get("result") or {}
                        yield {
                            "type": "action",
                            "payload": {
                                "action": "show_trip_list",
                                "trips": info.get("trips") or [],
                                "message": info.get("message"),
                            },
                        }

                yield {"type": "tool_result", "tool": fn_name, "result": tool_output}

                payload_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": tool_output,
                })

            # 本轮触发了 ask_user_choice / ask_user_date -> 等用户回复，停止循环
            if awaiting_user_reply:
                return

        except httpx.HTTPError as e:
            logger.exception("Chat stream HTTP error")
            yield {"type": "error", "content": f"❌ 网络错误：{e}"}
            return
        except Exception as e:
            logger.exception("Chat stream error")
            yield {"type": "error", "content": f"❌ 未知错误：{e}"}
            return

    # 超过最大轮次：给用户明确提示
    yield {"type": "content", "content": "\n\n（操作步骤较多，请回复上面的选项，或直接告诉我你想怎么做）"}
