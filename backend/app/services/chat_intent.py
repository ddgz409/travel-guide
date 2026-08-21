"""聊天意图识别：检测是否需要跳转行程规划等 Agent 动作。"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

# 常见目的地（长名优先匹配）
MAJOR_CITIES: tuple[str, ...] = (
    "呼和浩特", "乌鲁木齐", "哈尔滨", "石家庄", "连云港", "张家界",
    "香格里拉", "九寨沟", "布达拉宫", "香港", "澳门", "台北",
    "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州",
    "重庆", "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨",
    "昆明", "贵阳", "南宁", "海口", "福州", "济南", "郑州", "合肥", "南昌",
    "太原", "沈阳", "长春", "宁波", "无锡", "常州", "温州", "珠海", "桂林",
    "敦煌", "洛阳", "开封", "扬州", "威海", "烟台", "秦皇岛", "北戴河",
)

PLAN_PATTERN = re.compile(
    r"(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行计划|旅游计划)"
    r"|(?:帮我|请).*(?:规划|安排|制定|设计|生成).*(?:行程|攻略|旅行|旅游)?"
    r"|(?:一|两|三|四|五|六|七|八|九|\d+)\s*日游",
    re.I,
)

# 行程管理（查 / 删 / 改 / 打开），不应触发「规划新行程」
# 收紧：裸词「查看/看看/列表/有哪些」必须与「行程/攻略/列表」关联，
# 避免「有哪些好玩的」「看看天气」等咨询误判为行程管理
TRIP_MGMT_PATTERN = re.compile(
    r"删除|删掉|删了|移除|清除|去掉|取消|不要了|"
    r"(?:查看|看看|浏览|列出).{0,6}(?:行程|攻略|列表)|"
    r"(?:我的|我有|所有).{0,4}(?:行程|攻略)|"
    r"(?:行程|攻略)列表|有哪些.{0,4}(?:行程|攻略)|"
    r"打开|分享|/share/|"
    r"修改|编辑|更新|"
    r"帖子|收藏夹|发布|发帖|做成清单|转成清单|改成清单|编辑成清单",
    re.I,
)

_MAJOR_SET = frozenset(MAJOR_CITIES)

INTEREST_KEYWORDS: tuple[tuple[str, str], ...] = (
    ("美食", "美食"),
    ("吃货", "美食"),
    ("穿衣", "购物"),
    ("搭配", "购物"),
    ("亲子", "亲子"),
    ("拍照", "摄影"),
    ("摄影", "摄影"),
    ("博物馆", "历史"),
    ("历史", "历史"),
    ("自然", "自然"),
    ("户外", "自然"),
    ("购物", "购物"),
    ("艺术", "艺术"),
    ("文化", "文化"),
    ("人文", "文化"),
)


def _parse_dates(text: str) -> tuple[str, str]:
    today = date.today()
    if "大后天" in text:
        start = today + timedelta(days=3)
    elif "后天" in text:
        start = today + timedelta(days=2)
    elif "明天" in text:
        start = today + timedelta(days=1)
    elif "今天" in text:
        start = today
    else:
        start = today + timedelta(days=1)

    m = re.search(r"(\d+)\s*天", text)
    days = max(1, min(int(m.group(1)), 14)) if m else 1
    end = start + timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def _is_known_city(name: str) -> bool:
    n = (name or "").strip().replace("市", "")
    if len(n) < 2:
        return False
    if n in _MAJOR_SET:
        return True
    return any(n in c or c.startswith(n) for c in MAJOR_CITIES if len(n) >= 2)


def _extract_city(text: str) -> str | None:
    for city in sorted(MAJOR_CITIES, key=len, reverse=True):
        if city in text:
            return city
    m = re.search(r"去([\u4e00-\u9fff]{2,8}?)(?:的|玩|旅游|行)", text)
    if m:
        name = m.group(1).strip()
        if _is_known_city(name):
            return name.replace("市", "")
    m = re.search(r"([\u4e00-\u9fff]{2,6})(?:市|城)?(?:的)?(?:行程|攻略|旅游)", text)
    if m:
        name = m.group(1).strip()
        if _is_known_city(name):
            return name.replace("市", "")
    return None


def _extract_interests(text: str) -> list[str]:
    found: list[str] = []
    for kw, tag in INTEREST_KEYWORDS:
        if kw in text and tag not in found:
            found.append(tag)
    return found or ["文化", "美食"]


def is_trip_management_intent(text: str) -> bool:
    """查列表 / 删除 / 打开已有行程 → 交给 Agent，不走规划跳转。"""
    raw = (text or "").strip()
    if not raw or not TRIP_MGMT_PATTERN.search(raw):
        return False
    # 「帮我规划/生成一份新攻略」仍走规划
    if re.search(
        r"(?:规划|安排|制定|设计|生成)(?:一个|一份|新的)?(?:行程|攻略)",
        raw,
    ):
        return False
    return True


def detect_plan_intent(text: str) -> dict[str, Any] | None:
    """识别「帮我规划行程」类意图，返回跳转 Generate 的参数。"""
    raw = (text or "").strip()
    if len(raw) < 4:
        return None
    if is_trip_management_intent(raw):
        return None
    if not PLAN_PATTERN.search(raw):
        return None
    destination = _extract_city(raw)
    if not destination:
        return None
    start_date, end_date = _parse_dates(raw)
    return {
        "action": "navigate_generate",
        "destination": destination,
        "start_date": start_date,
        "end_date": end_date,
        "interests": _extract_interests(raw),
        "mode": "custom",
        "auto_submit": True,
        "chat_hint": raw,
    }
