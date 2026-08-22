"""规划行程追问工具：LLM 逐步收集细节，前端展示选项卡片/快捷按钮。"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

PLANNING_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "ask_user_choice",
            "description": (
                "向用户展示可点击选项，用于规划行程时逐步追问。"
                "每次只问一个维度（目的地/天数/日期/交通/兴趣等），提供 2-4 个选项。"
                "多个候选目的地用 select_list；简单二选一/三选一用 chips。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "style": {
                        "type": "string",
                        "enum": ["chips", "select_list"],
                        "description": "select_list=列表+确认按钮；chips=竖排快捷按钮",
                    },
                    "options": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "label": {
                                    "type": "string",
                                    "description": "展示给用户的选项文字，可含 emoji",
                                },
                                "send": {
                                    "type": "string",
                                    "description": "用户点击后自动发送的完整回复",
                                },
                            },
                            "required": ["label", "send"],
                        },
                        "minItems": 2,
                        "maxItems": 5,
                    },
                    "confirm_label": {
                        "type": "string",
                        "description": "select_list 模式下的确认按钮文字，默认「确认」",
                    },
                },
                "required": ["style", "options"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_user_date",
            "description": (
                "展示日期选择器，让用户选择出发日期或灵活天数。"
                "在已确定目的地、需要确认出行日期时调用。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "destination": {
                        "type": "string",
                        "description": "已知的目的地，用于生成确认文案",
                    },
                    "suggest_days": {
                        "type": "integer",
                        "description": "建议的游玩天数，默认 3",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finalize_plan",
            "description": (
                "已收集足够信息，开始生成行程。至少需要 destination 和日期范围（或天数）。"
                "在用户确认目的地、天数/日期后再调用，不要过早调用。"
                "若用户已提到人数或出行方式，请一并填入。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "destination": {"type": "string", "description": "目的地城市"},
                    "start_date": {"type": "string", "description": "ISO 日期 YYYY-MM-DD"},
                    "end_date": {"type": "string", "description": "ISO 日期 YYYY-MM-DD"},
                    "days": {
                        "type": "integer",
                        "description": "若未给具体日期，可用天数（从今天/明天起算）",
                    },
                    "travelers": {
                        "type": "integer",
                        "description": "出行人数，如 1/2/4；用户未提时可省略",
                    },
                    "transport": {
                        "type": "string",
                        "description": "出行方式，如 自驾/高铁/飞机/公共交通/跟团；用户未提时可省略",
                    },
                    "interests": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "兴趣标签，如美食、亲子、摄影",
                    },
                    "chat_hint": {
                        "type": "string",
                        "description": "用户原始需求摘要，供生成页参考",
                    },
                },
                "required": ["destination"],
            },
        },
    },
]

PLANNING_SYSTEM_SUFFIX = """

---
**行程规划模式（逐步追问，必须用卡片）**
仅当用户**明确想要生成一份新的行程/攻略**时启用（如「帮我规划/安排/制定/生成 行程/攻略」「X 日游」）。
- 若用户只是咨询（推荐目的地/景点介绍/餐厅推荐/穿衣/天气/签证/怎么玩/有什么好玩的），直接回答，**不要**调用规划工具，也不要追问。
- **收集任何行程细节时，必须调用 `ask_user_choice` 或 `ask_user_date` 弹出可点卡片，绝对禁止用普通文字提问，绝对禁止把多个问题堆在一条文本里。** 需要问什么就用对应的工具弹卡片，一次只弹一张。
- **一次只问一个**问题，一个一个来：无论还缺多少信息（目的地、天数、日期、人数、出行方式、兴趣…），每个回合只追问**一个**维度；用户回答后，下一个回合再问下一个。**绝对不要**在一个回合里同时问多个问题，**绝对不要**连续调用多个 `ask_user_choice` / `ask_user_date`。
1. 用 `ask_user_choice` 给出 2-4 个可点选项（用户点击后会回填输入框，可改可发）
   - 推荐多个目的地 -> style=select_list（列表 + 确认）
   - 天数、人数、出行方式、兴趣等 -> style=chips（快捷按钮，点一下回填）
   - 人数示例：1人 / 2人 / 3-4人 / 5人及以上
   - 出行方式示例：自驾 / 高铁 / 飞机 / 公共交通 / 跟团
3. 需要确认 **具体出发日期** 时，用 `ask_user_date` 展示日历选择器。
   **用户说 "9.3 / 9月3 / 9月三日 / 2026/9/3" 这类日期时，直接视为今年或次年的日期，不要反复追问"是哪一年"**；若不方便确认再弹日历卡片让用户选。
 4. 至少需要 **目的地 + 日期或天数** 才能 `finalize_plan`
 5. 信息足够后调用 `finalize_plan`，系统会自动打开生成页
 6. **绝对不要**在咨询类问题上调用 `finalize_plan` 或跳转生成页
 7. 用户说「青甘环线」「西北大环线」「甘南环线」等**知名环线名**时，目的地就是该环线名，直接作为 `finalize_plan` 的 destination（系统会展开成城市路线），**不要追问起点城市、也不要要求选单城市**。
 8. 用户说**省份名**（如「山东」「云南」「海南」「四川省」）时，目的地就是该省份名，直接作为 `finalize_plan` 的 destination（系统会自动展开成省内热门城市路线），**不要追问具体城市**；只需按流程问天数/日期/人数等即可。
"""

# 触发规划对话模式：必须明确包含「生成新行程」意图词，避免「推荐个餐厅」「有什么攻略」等咨询误判
PLANNING_TRIGGER = re.compile(
    r"(?:规划|安排|制定|设计|生成|做).*(?:行程|攻略|旅行计划|旅游计划|路线)|"
    r"帮我.*(?:规划|安排|制定|设计|生成|排)|"
    r"(?:一|两|三|四|五|六|七|八|九|\d+)\s*(?:日游|天行程|天旅游|天攻略)",
    re.I,
)

# 咨询类关键词：命中则不算规划（即使误中 PLANNING_TRIGGER 也排除）
CONSULT_HINT = re.compile(
    r"介绍|推荐.*(?:餐厅|美食|酒店|景点|目的地)|有什么|怎么样|好不好|"
    r"穿什么|穿搭|天气|签证|注意|避坑|坑|多少钱|预算|"
    r"怎么去|怎么玩|攻略推荐|哪里.*(?:好吃|好玩|好看)",
    re.I,
)


def is_planning_conversation(text: str) -> bool:
    raw = (text or "").strip()
    if len(raw) < 3:
        return False
    from app.services.chat_intent import is_trip_management_intent

    if is_trip_management_intent(raw):
        return False
    # 咨询类问题不算规划（避免「推荐个去哪玩」误触发）
    if CONSULT_HINT.search(raw):
        return False
    return bool(PLANNING_TRIGGER.search(raw))


# AI 已经主动开口规划（如「我来为您规划一份西宁攻略」）时，
# 后续用户短回复（「5天」「9.3」）也应保持规划工具可用
_ASSISTANT_PLANNING_RE = re.compile(
    r"(?:为|帮|给).{0,16}(?:您|你|用户)?.{0,12}(?:规划|安排|制定|设计|生成).{0,16}(?:行程|攻略)"
    r"|规划(?:一份|一个|您的|你的|X|N)?.{0,12}(?:行程|攻略)",
    re.I,
)


def is_planning_assistant_message(text: str) -> bool:
    """判断 assistant 消息是否已表明正在规划行程（用于保持规划工具可用）。"""
    raw = (text or "").strip()
    if len(raw) < 6:
        return False
    return bool(_ASSISTANT_PLANNING_RE.search(raw))


def _default_dates(days: int = 2) -> tuple[str, str]:
    start = date.today() + timedelta(days=1)
    end = start + timedelta(days=max(1, days) - 1)
    return start.isoformat(), end.isoformat()


PLANNING_TOOL_NAMES = frozenset({"ask_user_choice", "ask_user_date", "finalize_plan"})


def execute_planning_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "ask_user_date":
        dest = (args.get("destination") or "").strip()
        try:
            days = max(2, min(int(args.get("suggest_days") or 3), 14))
        except (TypeError, ValueError):
            days = 3
        return {
            "ok": True,
            "result": {
                "ui": True,
                "kind": "date_picker",
                "destination": dest,
                "suggest_days": days,
            },
        }

    if name == "ask_user_choice":
        options = args.get("options") or []
        if len(options) < 2:
            return {"ok": False, "error": "至少需要 2 个选项"}
        cleaned = []
        for o in options[:5]:
            label = (o.get("label") or "").strip()
            send = (o.get("send") or label).strip()
            if label and send:
                cleaned.append({"label": label, "send": send})
        if len(cleaned) < 2:
            return {"ok": False, "error": "选项格式无效"}
        style = args.get("style") or "chips"
        if style not in ("chips", "select_list"):
            style = "chips"
        return {
            "ok": True,
            "result": {
                "ui": True,
                "style": style,
                "options": cleaned,
                "confirm_label": (args.get("confirm_label") or "确认").strip() or "确认",
            },
        }

    if name == "finalize_plan":
        dest = (args.get("destination") or "").strip()
        if not dest:
            return {"ok": False, "error": "缺少 destination"}
        from app.services.destination_validator import (
            check_destination,
            check_route_city,
            parse_route,
        )

        # 路线感知校验：环线名（如「青甘环线」）展开为城市序列逐个校验；
        # 单城市走原逻辑。resolved 保持原样，便于生成侧 _resolve_route 再次展开。
        cities, is_route = parse_route(dest)
        if is_route and len(cities) >= 2:
            for c in cities:
                rc = check_route_city(c)
                if not rc.valid:
                    return {"ok": False, "error": f"路线中的「{c}」无效：{rc.message}"}
            resolved = dest
        else:
            check = check_destination(dest)
            if not check.valid:
                return {"ok": False, "error": check.message}
            resolved = check.resolved_name or dest
        start = (args.get("start_date") or "").strip()
        end = (args.get("end_date") or "").strip()
        if not start or not end:
            days = args.get("days")
            try:
                d = max(1, min(int(days), 14)) if days else 2
            except (TypeError, ValueError):
                d = 2
            start, end = _default_dates(d)

        interests = args.get("interests") or ["文化", "美食"]
        if not isinstance(interests, list):
            interests = ["文化", "美食"]

        # 人数/出行方式：用户提到才带，避免默认值误导生成
        travelers = args.get("travelers")
        try:
            travelers = max(1, min(int(travelers), 20)) if travelers not in (None, "") else None
        except (TypeError, ValueError):
            travelers = None
        transport = (args.get("transport") or "").strip() or None

        result: dict[str, Any] = {
            "action": "navigate_generate",
            "destination": resolved,
            "start_date": start,
            "end_date": end,
            "interests": interests,
            "mode": "custom",
            "auto_submit": True,
            "chat_hint": (args.get("chat_hint") or "").strip() or f"规划{resolved}行程",
        }
        if is_route and len(cities) >= 2:
            result["route"] = cities
        if travelers is not None:
            result["travelers"] = travelers
        if transport:
            result["transport"] = transport
        return {"ok": True, "result": result}

    return {"ok": False, "error": f"未知规划工具: {name}"}
