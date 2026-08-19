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
**行程规划模式（逐步追问）**
当用户想要规划/安排/生成/推荐 行程或攻略时：
1. 不要一次抛出一长串问题；每次只追问 **一个** 关键信息
2. 用 `ask_user_choice` 给出 2-4 个可点选项（用户点击后会自动作为回复发送）
   - 推荐多个目的地 → style=select_list（列表 + 确认）
   - 天数、交通、兴趣等 → style=chips（快捷按钮，点一下即发送）
3. 需要确认 **具体出发日期** 时，用 `ask_user_date` 展示日历选择器（不要用 chips 代替）
4. 选项 label 要简短可读；send 要是用户会说出口的完整句子
5. 至少需要 **目的地 + 日期或天数** 才能 `finalize_plan`
6. 信息足够后调用 `finalize_plan`，系统会自动打开生成页
7. 若用户只是咨询（穿衣、签证、景点介绍），正常回答，不要调用规划工具
"""

# 触发规划对话模式（但不直接跳转）
PLANNING_TRIGGER = re.compile(
    r"规划|安排|制定|设计|生成|推荐.*(?:城市|目的地|去哪)|"
    r"(?:去哪|去哪里|什么地方).*(?:玩|旅游|旅行)|"
    r"(?:行程|攻略|旅行计划|旅游计划)|"
    r"(?:一|两|三|四|五|六|七|八|九|\d+)\s*日游",
    re.I,
)


def is_planning_conversation(text: str) -> bool:
    raw = (text or "").strip()
    if len(raw) < 3:
        return False
    from app.services.chat_intent import is_trip_management_intent

    if is_trip_management_intent(raw):
        return False
    return bool(PLANNING_TRIGGER.search(raw))


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
        from app.services.destination_validator import check_destination

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

        return {
            "ok": True,
            "result": {
                "action": "navigate_generate",
                "destination": resolved,
                "start_date": start,
                "end_date": end,
                "interests": interests,
                "mode": "custom",
                "auto_submit": True,
                "chat_hint": (args.get("chat_hint") or "").strip() or f"规划{resolved}行程",
            },
        }

    return {"ok": False, "error": f"未知规划工具: {name}"}
