"""AI Agent 工具定义与执行。

让 LLM 通过 function calling 直接操作用户数据（查行程、删行程等）。
所有破坏性操作（删除）都需要前端二次确认。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, TYPE_CHECKING

from sqlalchemy.orm import Session

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)

# ---------- 工具 schema（OpenAI function calling 格式） ----------

AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_trips",
            "description": "列出当前用户的所有行程（标题、目的地、日期、状态）。当用户问「查看攻略列表」「我的行程有哪些」「看看列表里的攻略」等时调用。",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_trip",
            "description": "查看某个行程的详细内容（每日安排、景点、美食）。当用户问某次旅行的具体安排时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trip_id": {
                        "type": "string",
                        "description": "行程 ID（从 list_trips 结果中获取）",
                    },
                },
                "required": ["trip_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_trip",
            "description": "删除指定行程。这是不可逆操作，系统会自动弹出确认窗口。当用户说「删除攻略」「删掉北京行程」「帮我删了那个攻略」时，先 list_trips 找到对应行程再调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trip_id": {
                        "type": "string",
                        "description": "要删除的行程 ID",
                    },
                },
                "required": ["trip_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_trip",
            "description": "在 App 中打开某个行程的详情页面。当用户说「打开 XX 行程」「看一下 XX 的安排」时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "trip_id": {
                        "type": "string",
                        "description": "行程 ID",
                    },
                },
                "required": ["trip_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "view_shared_trip",
            "description": "查看分享链接里的行程内容（任何人分享的链接都可以，不需要是本人的行程）。当用户发来一个包含 /share/ 的链接，或者说「帮我看看/分析这个行程」时调用。",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "完整分享链接（如 http://81.71.159.218:8000/share/xxxx）或链接末尾的 token",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "open_shared_trip",
            "description": "在 App 中打开分享链接对应的行程页面（可查看完整行程并加入协作）。当用户说「打开这个分享/链接」时调用，token 从 view_shared_trip 的结果中获取。",
            "parameters": {
                "type": "object",
                "properties": {
                    "token": {
                        "type": "string",
                        "description": "分享 token",
                    },
                },
                "required": ["token"],
            },
        },
    },
]

_SHARE_TOKEN_RE = re.compile(r"/share/([A-Za-z0-9_-]+)")


def _extract_share_token(text: str) -> str:
    """从完整链接或裸 token 中提取 share token。"""
    m = _SHARE_TOKEN_RE.search(text.strip())
    if m:
        return m.group(1)
    return text.strip().rstrip("/").split("/")[-1]

# 需要用户确认后才能执行的工具
CONFIRM_REQUIRED = {"delete_trip"}

AGENT_SYSTEM_SUFFIX = """

---
你可以通过调用工具直接操作用户的 App 数据。规则：
1. 用户问「我有哪些行程」「查看攻略列表」「看看我的行程/攻略」→ 调 list_trips。App 会自动弹出卡片列表，你只需简短总结，不必逐条复述
2. 用户说「删除/删掉/删了 XX 攻略/行程」→ 先调 list_trips 找到对应行程，然后直接调 delete_trip。
   系统会自动向用户弹出确认窗口，由用户点击按钮决定是否真的删除。不要在对话里反复询问确认，也不要跳转生成页面。
3. 用户说「打开 XX 行程」→ 先调 list_trips 找到 ID，再调 open_trip
4. 删除是危险操作，但确认弹窗是系统的安全兜底，你只需找到正确的行程即可
5. 如果找不到用户说的行程，告知用户并列出现有行程供选择
6. 用户发来分享链接（含 /share/）或让你分析别人的行程 → 调 view_shared_trip，然后根据行程内容给出你的分析/建议
7. 用户说「打开这个分享/链接」→ 调 open_shared_trip（token 用 view_shared_trip 返回的 share_token）
"""


def preview_tool(
    name: str,
    args: dict[str, Any],
    db: Session,
    user: "User | None",
) -> dict[str, Any]:
    """为确认弹窗准备数据：只读取信息，不执行实际操作。"""
    from app.models import Trip

    if user is None:
        return {"ok": False, "error": "请先登录后再操作行程数据"}

    if name == "delete_trip":
        trip_id = (args.get("trip_id") or "").strip()
        if not trip_id:
            return {"ok": False, "error": "缺少 trip_id"}
        trip = db.get(Trip, trip_id)
        if trip is None or trip.user_id != user.id:
            return {"ok": False, "error": "行程不存在或无权限删除"}
        return {
            "ok": True,
            "result": {
                "trip_id": trip.id,
                "title": trip.title,
                "destination": trip.destination,
                "start_date": str(trip.start_date),
                "end_date": str(trip.end_date),
            },
        }

    return {"ok": False, "error": f"工具 {name} 不需要确认"}


# ---------- 工具执行器 ----------

def _fmt_trip(trip: Any) -> dict[str, Any]:
    return {
        "trip_id": trip.id,
        "title": trip.title,
        "destination": trip.destination,
        "start_date": str(trip.start_date),
        "end_date": str(trip.end_date),
        "travelers": trip.travelers,
        "status": trip.status,
        "created_at": str(trip.created_at),
    }


def _trip_detail(trip: Any) -> dict[str, Any]:
    d = _fmt_trip(trip)
    d["days"] = []
    for day in (trip.days or []):
        items = []
        for it in (day.items or []):
            items.append({
                "name": it.name,
                "type": it.type,
                "time_slot": it.time_slot,
                "description": (it.description or "")[:100],
                "cost": it.cost,
                "rating": it.rating,
            })
        d["days"].append({
            "day_index": day.day_index,
            "date": str(day.date),
            "summary": day.summary,
            "items": items,
        })
    return d


def execute_tool(
    name: str,
    args: dict[str, Any],
    db: Session,
    user: "User | None",
) -> dict[str, Any]:
    """执行 agent 工具，返回 {ok, result|error, needs_confirm}。"""
    from sqlalchemy import select

    from app.models import Trip

    # 分享链接相关工具：任何持有者都能看，不需要登录/归属校验
    if name == "view_shared_trip":
        raw = (args.get("url") or "").strip()
        if not raw:
            return {"ok": False, "error": "缺少分享链接"}
        token = _extract_share_token(raw)
        trip = db.scalar(select(Trip).where(Trip.share_token == token))
        if trip is None:
            return {"ok": False, "error": "分享链接无效或已失效"}
        result = _trip_detail(trip)
        result["share_token"] = token
        result["share_mode"] = trip.share_mode or "read"
        return {"ok": True, "result": result}

    if name == "open_shared_trip":
        token = _extract_share_token((args.get("token") or "").strip())
        if not token:
            return {"ok": False, "error": "缺少分享 token"}
        trip = db.scalar(select(Trip).where(Trip.share_token == token))
        if trip is None:
            return {"ok": False, "error": "分享链接无效或已失效"}
        return {
            "ok": True,
            "result": {"token": token, "title": trip.title, "navigate": True},
        }

    if user is None:
        return {"ok": False, "error": "请先登录后再操作行程数据"}

    if name == "list_trips":
        trips = (
            db.query(Trip)
            .filter(Trip.user_id == user.id)
            .order_by(Trip.created_at.desc())
            .limit(50)
            .all()
        )
        if not trips:
            return {"ok": True, "result": {"trips": [], "message": "你还没有任何行程记录"}}
        return {"ok": True, "result": {"trips": [_fmt_trip(t) for t in trips]}}

    if name == "get_trip":
        trip_id = (args.get("trip_id") or "").strip()
        if not trip_id:
            return {"ok": False, "error": "缺少 trip_id"}
        trip = db.get(Trip, trip_id)
        if trip is None or trip.user_id != user.id:
            return {"ok": False, "error": "行程不存在或无权限查看"}
        return {"ok": True, "result": _trip_detail(trip)}

    if name == "delete_trip":
        trip_id = (args.get("trip_id") or "").strip()
        if not trip_id:
            return {"ok": False, "error": "缺少 trip_id"}
        trip = db.get(Trip, trip_id)
        if trip is None or trip.user_id != user.id:
            return {"ok": False, "error": "行程不存在或无权限删除"}
        title = trip.title
        dest = trip.destination
        db.delete(trip)
        db.commit()
        logger.info("Agent deleted trip %s (%s) for user %s", trip_id, dest, user.id)
        return {"ok": True, "result": {"deleted": True, "title": title, "destination": dest}}

    if name == "open_trip":
        trip_id = (args.get("trip_id") or "").strip()
        if not trip_id:
            return {"ok": False, "error": "缺少 trip_id"}
        trip = db.get(Trip, trip_id)
        if trip is None or trip.user_id != user.id:
            return {"ok": False, "error": "行程不存在"}
        return {"ok": True, "result": {"trip_id": trip.id, "title": trip.title, "navigate": True}}

    return {"ok": False, "error": f"未知工具: {name}"}
