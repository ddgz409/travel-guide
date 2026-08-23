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
                "向用户展示可点击选项卡片，用于规划行程时逐步追问缺失信息。"
                "一次只问一个维度，提供 2-4 个选项。\n"
                "- 人数缺失 → 用本工具问人数：选项如 1人/2人/3-4人/5人及以上（chips）\n"
                "- 交通方式缺失 → 用本工具问交通方式：选项如 自驾/高铁/飞机/公共交通/跟团（chips）\n"
                "- 天数缺失 → 用本工具问天数（chips）\n"
                "- 用户已经明确提供人数/交通方式/天数时，【不得】重复询问。\n"
                "- 【禁止】用 ask_user_date 代替人数或交通方式询问。\n"
                "- 多个候选目的地 → style=select_list（列表+确认）；其余一律 style=chips（快捷按钮）。"
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
                "仅用于询问/确认用户【未提供】的具体出发日期（如 9月3日、下周三、2026/9/3）。\n"
                "如果用户已经明确提供了出发日期，禁止调用本工具。\n"
                "本工具【不得】用于询问旅行天数，【不得】用于询问人数，【不得】用于询问交通方式——"
                "这些一律用 ask_user_choice 弹选项卡片。"
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
                "仅当以下五项核心信息全部明确后才调用，开始生成行程："
                "destination（目的地）、days（天数）、travelers（人数）、transport（交通方式）、start_date（出发日期）。\n"
                "如果这些信息已全部由用户消息或历史对话获得，【禁止】调用任何询问工具，【直接】调用 finalize_plan。\n"
                "例：用户说「规划青甘环线7天6晚2人自驾9月3日出发」→ 应直接 finalize_plan，而不是 ask_user_date。\n"
                "若存在缺失字段，先按顺序用对应工具补齐（天数→人数→交通方式→出发日期）后再调用，不要过早调用。"
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
**行程规划模式（必须用卡片，严禁文字提问）**
仅当用户**明确想要生成一份新的行程/攻略**时启用（如「帮我规划/安排/制定/生成 行程/攻略」「X 日游」）。
- 若用户只是咨询（推荐目的地/景点介绍/餐厅推荐/穿衣/天气/签证/怎么玩/有什么好玩的），直接回答，**不要**调用规划工具，也不要追问。
- 收集信息时**必须**调用 `ask_user_choice` / `ask_user_date` 弹出可点卡片，**绝对禁止**用普通文字提问，**绝对禁止**把多个问题堆在一条文本里。

**信息收集规则（严格遵守）：**
1. 首先从用户当前消息和历史对话中，提取已经明确提供的信息（目的地、天数、人数、交通方式、出发日期）。
2. **不得重新询问用户已经明确提供的信息。**
3. 按以下顺序检查缺失信息：**天数 → 人数 → 交通方式 → 出发日期**。
4. **只询问第一个缺失的信息**，一次只弹一张卡片；用户回答后，下一回合再检查并询问下一个缺失字段。
5. 对应工具：
   - 天数缺失 → `ask_user_choice`（chips，选项如 3天2晚 / 5天4晚 / 7天6晚 / 10天9晚）
   - 人数缺失 → `ask_user_choice`（chips，选项如 1人 / 2人 / 3-4人 / 5人及以上）
   - 交通方式缺失 → `ask_user_choice`（chips，选项如 自驾 / 高铁 / 飞机 / 公共交通 / 跟团）
   - 出发日期缺失 → `ask_user_date`（日历选择器）
6. **如果目的地、天数、人数、交通方式、出发日期五项全部明确，禁止调用任何询问工具，也禁止用文字罗列/描述行程，必须【直接调用 `finalize_plan`】。**
7. 注意：「依次收集信息」不等于「无论用户是否已经提供都必须重新询问」。正确逻辑：**提取已有信息 → 找第一个缺失字段 → 只询问该字段 → 全部完成后 finalize**。
8. 用户说「青甘」「青甘环线」「西北大环线」「甘南环线」等**知名环线名**（「青甘」是「青甘环线」的简称），或**省份名**（如「山东」「云南」）时，目的地就是该名称，直接作为 `finalize_plan` 的 destination（系统会自动展开成城市路线），**不要追问起点城市、不要要求选单城市、也不要让用户确认目的地**。
9. 用户已给出明确日期（如「9.3」「9月3日」「2026/9/3」「下周三」）时直接使用，**不要**弹日历反复确认；仅在出发日期缺失或不明确时才用 `ask_user_date`。
10. 人数/交通方式缺失时，**不得**用 `ask_user_date` 代替询问。

**最后一步铁律：**
只要五项信息齐全，**本轮必须且只能调用 `finalize_plan`**——不要写文字行程，不要说「好的，我来为您规划」「以下是行程建议」这类开场白，不要再询问任何信息。调用 `finalize_plan` 后系统会自动给出「查看攻略」按钮。
"""

# 触发规划对话模式：必须明确包含「生成新行程」意图词，避免「推荐个餐厅」「有什么攻略」等咨询误判
PLANNING_TRIGGER = re.compile(
    r"(?:规划|安排|制定|设计|生成|做).*(?:行程|攻略|旅行计划|旅游计划|路线|环线|环岛)|"
    r"帮我.*(?:规划|安排|制定|设计|生成|排)|"
    r"(?:一|两|三|四|五|六|七|八|九|\d+)\s*(?:日游|天行程|天旅游|天攻略)",
    re.I,
)

# 规划动词（用于「规划 + 已知目的地」的宽松命中）
_PLAN_VERB = re.compile(r"(?:规划|安排|制定|设计|生成|做)", re.I)

# 咨询类关键词：命中则不算规划（即使误中 PLANNING_TRIGGER 也排除）
CONSULT_HINT = re.compile(
    r"介绍|推荐.*(?:餐厅|美食|酒店|景点|目的地)|有什么|怎么样|好不好|"
    r"穿什么|穿搭|天气|签证|注意|避坑|坑|多少钱|预算|"
    r"怎么去|怎么玩|攻略推荐|哪里.*(?:好吃|好玩|好看)",
    re.I,
)

# 天数/时长表达：命中 = 用户在安排行程时长（配合已知目的地判定「想规划」）
_DURATION_RE = re.compile(
    r"\d+\s*天|"
    r"[一二三四五六七八九十两几]\s*天|"
    r"(?:一|两|二|三|四|五|六|七|八|九|十)\s*个?\s*星期|"
    r"一周|"
    r"(?:一|两|三|四|五|六|七|八|九|十)\s*日游",
    re.I,
)

# 环线/省份的常用简称 → 规范全称（触发判定与 finalize 目的地解析共用）
# 如「青甘环线」常被说成「青甘」
_DEST_ABBR_TO_FULL: dict[str, str] = {"青甘": "青甘环线"}
_DEST_ABBR = frozenset(_DEST_ABBR_TO_FULL)


def _contains_known_destination(raw: str) -> bool:
    """文本中是否出现已知环线名、简称或省份名（如「青甘环线」「青甘」「山东」）。"""
    from app.services.destination_validator import PROVINCE_CITIES, RING_ROUTES

    for name in RING_ROUTES:
        if name in raw:
            return True
    for abbr in _DEST_ABBR:
        if abbr in raw:
            return True
    for name in PROVINCE_CITIES:
        if name in raw:
            return True
    return False


def _normalize_destination_alias(text: str) -> str:
    """把环线/省份简称解析为规范全称（如「青甘」→「青甘环线」）；未命中则原样返回。"""
    return _DEST_ABBR_TO_FULL.get((text or "").strip(), text)


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
    if PLANNING_TRIGGER.search(raw):
        return True
    # 「规划/安排 + 已知环线或省份名」也算规划（如「规划青甘环线」「规划山东」）
    if _PLAN_VERB.search(raw) and _contains_known_destination(raw):
        return True
    # 自然说法：已知目的地 + 天数/时长 → 视为要规划（如「青甘环线7天」「去青甘玩一个星期」）
    if _contains_known_destination(raw) and _DURATION_RE.search(raw):
        return True
    return False


# AI 已经主动开口规划（如「我来为您规划一份西宁攻略」）时，
# 后续用户短回复（「5天」「9.3」）也应保持规划工具可用
_ASSISTANT_PLANNING_RE = re.compile(
    r"(?:为|帮|给).{0,16}(?:您|你|用户)?.{0,12}(?:规划|安排|制定|设计|生成).{0,16}(?:行程|攻略|环线|环岛)"
    r"|规划(?:一份|一个|您的|你的|X|N)?.{0,12}(?:行程|攻略|环线|环岛)",
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

        # 轻量护栏：目的地/天数/人数/交通方式/出发日期 五项齐全才允许 finalize，
        # 缺失则回给 LLM 指示其用对应卡片补齐，避免过早生成。
        days = args.get("days")
        travelers = args.get("travelers")
        transport = (args.get("transport") or "").strip()
        start = (args.get("start_date") or "").strip()
        end = (args.get("end_date") or "").strip()
        missing: list[str] = []
        if not dest:
            missing.append("目的地")
        has_days = days not in (None, "")
        has_date_range = bool(start) and bool(end)
        if not has_days and not has_date_range:
            missing.append("天数")
        if travelers in (None, ""):
            missing.append("人数")
        if not transport:
            missing.append("交通方式")
        if not start:
            missing.append("出发日期")
        if missing:
            return {
                "ok": False,
                "error": (
                    "禁止在信息不全时 finalize，缺失字段："
                    + "、".join(missing)
                    + "。请立即用对应卡片补齐（顺序：天数→人数→交通方式→出发日期），"
                    "只询问第一个缺失字段，不要用文字提问。"
                ),
            }

        if not dest:
            return {"ok": False, "error": "缺少 destination"}
        # 简称解析：如「青甘」→「青甘环线」，便于环线/城市展开
        dest = _normalize_destination_alias(dest)
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
        if not start and not end:
            days = args.get("days")
            try:
                d = max(1, min(int(days), 14)) if days else 2
            except (TypeError, ValueError):
                d = 2
            start, end = _default_dates(d)
        elif not end:
            # 只给了出发日期：按天数从 start 推算 end，保留用户选择的日期
            days = args.get("days")
            try:
                d = max(1, min(int(days), 14)) if days else 2
            except (TypeError, ValueError):
                d = 2
            try:
                start_dt = date.fromisoformat(start)
            except ValueError:
                start_dt = None
            if start_dt is not None:
                end = (start_dt + timedelta(days=d - 1)).isoformat()
            else:
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


# ===== 确定性信息提取（兜底：不依赖 LLM 自觉）=====

_CN_NUM = {
    "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
}


def _cn_to_int(s: str) -> int | None:
    """中文数字转 int，支持「十」「十一」「二十」「二十五」「两」。"""
    s = (s or "").strip()
    if not s:
        return None
    if "十" in s:
        parts = s.split("十")
        tens = _CN_NUM.get(parts[0], 1) if parts[0] else 1
        ones = _CN_NUM.get(parts[1], 0) if len(parts) > 1 and parts[1] else 0
        return tens * 10 + ones
    return _CN_NUM.get(s)


_DAYS_PATTERNS: list[tuple[re.Pattern, Any]] = [
    (re.compile(r"(\d+)\s*天\s*(\d+)\s*晚"), lambda m: int(m.group(1))),  # 7天6晚 → 7
    (re.compile(r"(\d+)\s*天"), lambda m: int(m.group(1))),  # 7天 / 玩7天
    (re.compile(r"([一二三四五六七八九十两]+)\s*天"), lambda m: _cn_to_int(m.group(1))),
    (re.compile(r"一?个?星期"), lambda m: 7),  # 一个星期 / 玩一个星期
    (re.compile(r"一周"), lambda m: 7),
    (re.compile(r"(\d+)\s*日游"), lambda m: int(m.group(1))),
    (re.compile(r"([一二三四五六七八九十两]+)\s*日游"), lambda m: _cn_to_int(m.group(1))),
]

_TRAVELERS_RE = re.compile(r"(\d+)\s*(?:[-~至到]\s*\d+)?\s*(?:个|位)?人")
_TRAVELERS_CN_RE = re.compile(r"([一二三四五六七八九十两]+)\s*(?:个|位)?人")

# 交通方式按长度降序，避免「公共交通」被「公交」先命中
_TRANSPORT_WORDS = [
    "公共交通", "自驾", "高铁", "动车", "火车", "飞机",
    "大巴", "汽车", "地铁", "公交", "跟团", "骑行", "租车", "包车",
]

_DATE_ISO_RE = re.compile(r"(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})\s*日?")
_DATE_MD_RE = re.compile(r"(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]")
_DATE_CN_RE = re.compile(r"([一二三四五六七八九十]+)\s*月\s*([一二三四五六七八九十]+)\s*[日号]")
_DATE_DOT_RE = re.compile(r"(\d{1,2})[./](\d{1,2})")  # 9.3 / 9/3，不含连字符避免误命中「3-4人」
_DATE_WEEK_RE = re.compile(r"下(?:周|星期)([一二三四五六日天])")

_WEEKDAY = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}


def _detect_destination(text: str) -> str | None:
    from app.services.destination_validator import PROVINCE_CITIES, RING_ROUTES

    for name in RING_ROUTES:
        if name in text:
            return name
    for abbr, full in _DEST_ABBR_TO_FULL.items():
        if abbr in text:
            return full
    for name in PROVINCE_CITIES:
        if name in text:
            return name
    return None


def _detect_days(text: str) -> int | None:
    # 取最后一次出现（用户中途改天数时以最新为准）
    best: tuple[int, int] | None = None
    for pat, fn in _DAYS_PATTERNS:
        for m in pat.finditer(text):
            try:
                val = fn(m)
            except (TypeError, ValueError):
                continue
            if isinstance(val, int) and val > 0:
                if best is None or m.start() > best[0]:
                    best = (m.start(), val)
    return best[1] if best else None


def _detect_travelers(text: str) -> int | None:
    best: tuple[int, int] | None = None
    for m in _TRAVELERS_RE.finditer(text):
        try:
            v = max(1, int(m.group(1)))
        except (TypeError, ValueError):
            continue
        if best is None or m.start() > best[0]:
            best = (m.start(), v)
    for m in _TRAVELERS_CN_RE.finditer(text):
        v = _cn_to_int(m.group(1))
        if v is not None and (best is None or m.start() > best[0]):
            best = (m.start(), v)
    return best[1] if best else None


def _detect_transport(text: str) -> str | None:
    best: tuple[int, str] | None = None
    for w in _TRANSPORT_WORDS:
        idx = text.rfind(w)
        if idx >= 0 and (best is None or idx > best[0]):
            best = (idx, w)
    return best[1] if best else None


def _md_to_iso(mon: int, day: int, today: date) -> str | None:
    try:
        d = date(today.year, mon, day)
        if d < today:
            d = date(today.year + 1, mon, day)
        return d.isoformat()
    except ValueError:
        return None


def _detect_start_date(text: str) -> str | None:
    today = date.today()
    cands: list[tuple[int, str]] = []  # (出现位置, ISO 日期)，取最后
    for m in _DATE_ISO_RE.finditer(text):
        try:
            cands.append((m.start(), date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()))
        except ValueError:
            pass
    for m in _DATE_MD_RE.finditer(text):
        v = _md_to_iso(int(m.group(1)), int(m.group(2)), today)
        if v:
            cands.append((m.start(), v))
    for m in _DATE_DOT_RE.finditer(text):
        v = _md_to_iso(int(m.group(1)), int(m.group(2)), today)
        if v:
            cands.append((m.start(), v))
    for m in _DATE_CN_RE.finditer(text):
        mon, day = _cn_to_int(m.group(1)), _cn_to_int(m.group(2))
        if mon and day:
            v = _md_to_iso(mon, day, today)
            if v:
                cands.append((m.start(), v))
    for word, delta in (("后天", 2), ("明天", 1), ("今天", 0)):
        idx = text.rfind(word)
        if idx >= 0:
            cands.append((idx, (today + timedelta(days=delta)).isoformat()))
    m = _DATE_WEEK_RE.search(text)
    if m:
        days_ahead = (_WEEKDAY[m.group(1)] - today.weekday() + 7) % 7
        if days_ahead == 0:
            days_ahead = 7
        cands.append((m.start(), (today + timedelta(days=days_ahead)).isoformat()))
    if not cands:
        return None
    cands.sort(key=lambda x: x[0])
    return cands[-1][1]


def parse_plan_fields(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """从对话中的用户消息确定性提取行程字段（destination/days/travelers/transport/start_date）。"""
    user_text = " ".join(
        (m.get("content") or "") for m in messages if m.get("role") == "user"
    )
    fields: dict[str, Any] = {}
    dest = _detect_destination(user_text)
    if dest:
        fields["destination"] = dest
    days = _detect_days(user_text)
    if days is not None:
        fields["days"] = days
    travelers = _detect_travelers(user_text)
    if travelers is not None:
        fields["travelers"] = travelers
    transport = _detect_transport(user_text)
    if transport:
        fields["transport"] = transport
    start = _detect_start_date(user_text)
    if start:
        fields["start_date"] = start
    return fields


def missing_plan_fields(fields: dict[str, Any]) -> list[str]:
    """按收集顺序返回缺失字段：天数 → 人数 → 交通方式 → 出发日期。"""
    order = ["days", "travelers", "transport", "start_date"]
    return [f for f in order if fields.get(f) in (None, "")]


def _ask_card_event(field: str, dest: str, days: int | None) -> dict[str, Any] | None:
    """确定性生成缺失字段的卡片事件（对齐工具卡片格式）。"""
    if field == "days":
        return {
            "type": "action",
            "payload": {
                "action": "show_choices",
                "style": "chips",
                "options": [
                    {"label": "3天2晚", "send": "3天2晚"},
                    {"label": "5天4晚", "send": "5天4晚"},
                    {"label": "7天6晚", "send": "7天6晚"},
                    {"label": "10天9晚", "send": "10天9晚"},
                ],
            },
        }
    if field == "travelers":
        return {
            "type": "action",
            "payload": {
                "action": "show_choices",
                "style": "chips",
                "options": [
                    {"label": "1人", "send": "1人"},
                    {"label": "2人", "send": "2人"},
                    {"label": "3-4人", "send": "3-4人"},
                    {"label": "5人及以上", "send": "5人及以上"},
                ],
            },
        }
    if field == "transport":
        return {
            "type": "action",
            "payload": {
                "action": "show_choices",
                "style": "chips",
                "options": [
                    {"label": "自驾", "send": "自驾"},
                    {"label": "高铁", "send": "高铁"},
                    {"label": "飞机", "send": "飞机"},
                    {"label": "公共交通", "send": "公共交通"},
                    {"label": "跟团", "send": "跟团"},
                ],
            },
        }
    if field == "start_date":
        return {
            "type": "action",
            "payload": {
                "action": "show_date_picker",
                "destination": dest,
                "suggest_days": days or 3,
            },
        }
    return None


def plan_fallback_events(messages: list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    """确定性回退：解析对话历史，产出缺失字段卡片或 finalize 事件。

    - 目的地已识别、五项齐全 → 直接产出 navigate_generate（finalize）
    - 目的地已识别、有缺失 → 产出第一个缺失字段的卡片
    - 目的地未识别（无法判定）→ 返回 None，交给 LLM 处理
    """
    fields = parse_plan_fields(messages)
    if not fields.get("destination"):
        return None
    missing = missing_plan_fields(fields)
    if not missing:
        result = execute_planning_tool("finalize_plan", fields)
        if result.get("ok"):
            return [{"type": "action", "payload": result["result"]}]
        return None
    event = _ask_card_event(missing[0], fields["destination"], fields.get("days"))
    if event:
        return [event]
    return None
