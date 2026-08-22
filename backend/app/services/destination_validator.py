"""目的地校验：地理编码 + 模糊推荐，避免无效地名进入生成流程。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import get_close_matches

from app.services.amap_client import AmapError, get_amap_client

# 常见旅游城市（用于「你是不是想找」）
COMMON_CITIES: tuple[str, ...] = (
    "北京", "上海", "广州", "深圳", "杭州", "成都", "西安", "南京", "苏州", "重庆",
    "武汉", "长沙", "厦门", "青岛", "大连", "三亚", "丽江", "拉萨", "昆明", "贵阳",
    "哈尔滨", "沈阳", "天津", "济南", "郑州", "合肥", "南昌", "福州", "南宁", "海口",
    "宁波", "无锡", "常州", "温州", "珠海", "桂林", "敦煌", "洛阳", "开封", "扬州",
    "威海", "烟台", "秦皇岛", "北戴河", "大理", "香格里拉", "九寨沟", "张家界", "黄山",
    "澳门", "香港", "台北", "乌鲁木齐", "呼和浩特", "银川", "西宁", "兰州", "太原",
    "石家庄", "长春", "顺德", "佛山", "东莞", "惠州", "绍兴", "嘉兴", "湖州", "泉州",
    "漳州", "湛江", "北海", "腾冲", "景德镇", "婺源", "莫干山", "千岛湖", "普陀山",
)


@dataclass
class DestinationCheckResult:
    valid: bool
    message: str = ""
    resolved_name: str | None = None
    suggestions: list[str] | None = None

    def to_dict(self) -> dict:
        return {
            "valid": self.valid,
            "message": self.message,
            "resolved_name": self.resolved_name,
            "suggestions": self.suggestions or [],
        }


# 知名环线 / 路线 -> 城市序列（用户输入「青甘环线」等即可展开）
RING_ROUTES: dict[str, list[str]] = {
    "青甘环线": ["西宁", "茶卡", "大柴旦", "敦煌", "张掖", "祁连", "西宁"],
    "甘南环线": ["兰州", "夏河", "扎尕那", "郎木寺", "玛曲", "若尔盖", "兰州"],
    "川西环线": ["成都", "康定", "新都桥", "稻城", "亚丁", "成都"],
    "西北大环线": ["西宁", "塔尔寺", "青海湖", "茶卡", "大柴旦", "敦煌", "嘉峪关", "张掖", "祁连", "西宁"],
    "新疆环线": ["乌鲁木齐", "吐鲁番", "喀纳斯", "禾木", "赛里木湖", "伊宁", "乌鲁木齐"],
    "云南大环线": ["昆明", "大理", "丽江", "香格里拉", "泸沽湖", "昆明"],
}

# 路线分隔符
_ROUTE_SEPS = re.compile(r"[-—–→→~·、,，;；/]+|(?:\s*[到至往]\s*)")


def parse_route(raw: str) -> tuple[list[str], bool]:
    """解析目的地为城市序列。

    返回 (cities, is_route)。若识别为多城市路线，cities 长度 >= 2。
    单城市原样返回 [raw]。
    """
    text = (raw or "").strip()
    if not text:
        return [], False
    # 已知环线名
    if text in RING_ROUTES:
        return list(RING_ROUTES[text]), True
    # 「环线」关键词 + 起点：如「成都环线」→ 补全不了，仍按单城市处理
    # 显式分隔符拆分
    parts = [p for p in _ROUTE_SEPS.split(text) if p.strip()]
    # 去重保序
    seen: list[str] = []
    for p in parts:
        p = p.strip()
        if p and p not in seen:
            seen.append(p)
    if len(seen) >= 2:
        return seen, True
    return [text], False


def _suggest(raw: str) -> list[str]:
    q = raw.strip()
    if not q:
        return []
    hits = get_close_matches(q, COMMON_CITIES, n=5, cutoff=0.45)
    if hits:
        return hits
    # 子串匹配：输入「杭」→ 杭州
    partial = [c for c in COMMON_CITIES if q in c or c.startswith(q)]
    return partial[:5]


def _friendly_amap_message(raw: str, err: AmapError) -> str:
    text = str(err)
    if "无法解析" in text:
        base = f"未找到「{raw}」这个地点，请检查是否输错，或从下方热门城市中选择"
    elif "INVALID_USER_KEY" in text or "10001" in text:
        base = "地图服务暂不可用，请稍后再试"
    elif "DAILY_QUERY_OVER" in text or "10003" in text:
        base = "地图查询次数已达上限，请稍后再试"
    else:
        base = f"无法识别「{raw}」，请换一个真实存在的城市或区县名称"
    tips = _suggest(raw)
    if tips:
        base += f"。你是不是想找：{'、'.join(tips)}？"
    return base


def _normalize_place(s: str) -> str:
    return (
        s.replace("[]", "")
        .replace("市", "")
        .replace("省", "")
        .replace("自治区", "")
        .replace("特别行政区", "")
        .replace("地区", "")
        .strip()
    )


def _geo_matches_input(raw: str, geo) -> bool:
    """避免高德把生造地名漂移到无关城市。"""
    needle = _normalize_place(raw)
    if len(needle) < 2:
        return False
    haystacks = [
        _normalize_place(geo.city or ""),
        _normalize_place(geo.formatted or ""),
    ]
    for hay in haystacks:
        if not hay:
            continue
        if needle in hay or hay in needle:
            return True
        if len(needle) >= 2 and hay[:2] == needle[:2]:
            return True
    return False


def check_destination(raw: str) -> DestinationCheckResult:
    """校验目的地是否可被高德地理编码识别。"""
    name = (raw or "").strip()
    if not name:
        return DestinationCheckResult(valid=False, message="请输入目的地")
    if len(name) < 2:
        return DestinationCheckResult(
            valid=False,
            message="地名太短，请输入完整的城市或区县名称",
            suggestions=_suggest(name),
        )

    amap = get_amap_client()
    try:
        geo = amap.geocode(name)
    except AmapError as e:
        return DestinationCheckResult(
            valid=False,
            message=_friendly_amap_message(name, e),
            suggestions=_suggest(name),
        )

    if not _geo_matches_input(name, geo):
        tips = _suggest(name)
        msg = f"未找到「{name}」这个地点，请检查是否输错，或从下方热门城市中选择"
        if tips:
            msg += f"。你是不是想找：{'、'.join(tips)}？"
        return DestinationCheckResult(
            valid=False,
            message=msg,
            suggestions=tips,
        )

    resolved = (geo.city or name).strip()
    if resolved in ("[]", ""):
        resolved = name
    # 去掉高德返回的空数组字符串
    resolved = resolved.replace("[]", "").strip() or name

    return DestinationCheckResult(
        valid=True,
        message="",
        resolved_name=resolved,
        suggestions=[],
    )
