"""携程酒店现爬 + 软打分排序。

每次完整生成调用；不缓存。字段缺失只降权，不硬淘汰。
列表页用城市 ID + hotelName/hotelId 解析；详情页补字段。
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, fetch_text, strip_html

logger = logging.getLogger(__name__)

CURRENT_YEAR = datetime.now().year
HUAZHU_KEYWORDS = (
    "全季", "汉庭", "桔子", "桔子水晶", "宜必思", "漫心", "海友", "星程",
    "华住", "禧玥", "CitiGO", "城际",
)
LIST_LIMIT = 20
# 详情页很慢；列表页已有评分，默认不抓详情以加速生成
DETAIL_LIMIT = 0

# 常用城市 ID（携程 hotels 列表页）
CITY_IDS: dict[str, int] = {
    "北京": 1, "上海": 2, "天津": 3, "重庆": 4, "哈尔滨": 5, "大连": 6,
    "青岛": 7, "西安": 10, "南京": 12, "无锡": 13, "苏州": 14, "杭州": 17,
    "宁波": 375, "厦门": 25, "福州": 258, "成都": 28, "深圳": 30, "广州": 32,
    "桂林": 33, "昆明": 34, "丽江": 37, "海口": 42, "三亚": 43, "香港": 58,
    "澳门": 59, "长沙": 206, "合肥": 278, "济南": 144, "沈阳": 451,
    "武汉": 477, "郑州": 559, "南昌": 376, "南宁": 380, "贵阳": 33,
    "太原": 105, "石家庄": 428, "长春": 158, "兰州": 100,
}

_BAD_NAMES = {
    "酒店", "酒店预订", "携程", "携程旅行网", "携程旅行", "发布房源",
    "首页", "登录", "注册", "更多", "查看更多",
}

_HOTEL_NAME = re.compile(r'hotelName">([^<]{4,80})</span>')
_HOTEL_ID = re.compile(r'hotelId[=:\"]+(\d{4,})', re.I)
_OPEN_YEAR = re.compile(r"(?:开业|装修)[^0-9]{0,8}(20\d{2})")
_GOOD_RATE = re.compile(r"(?:好评率|好评)[^0-9]{0,6}(\d{2,3}(?:\.\d+)?)\s*%")
_SCORE_4 = re.compile(r"(?:评分|点评分|用户评分)[^0-9]{0,6}([4-5]\.\d)")
_SCORE_NEAR = re.compile(r'([4-5]\.\d)\s*(?:分|/5|/5分)?')
_METRO_M = re.compile(r"(?:距|距离)?[^。；\n]{0,12}地铁[^。；\n]{0,20}?(\d{2,4})\s*米")
_METRO_WALK = re.compile(r"地铁[^。；\n]{0,16}?步行\s*(\d{1,2})\s*分钟")
_DETAIL_URL = re.compile(r"hotels\.ctrip\.com/hotel/(\d+)", re.I)


@dataclass
class CtripHotel:
    name: str
    url: str
    open_year: int | None = None
    good_rate: float | None = None
    is_huazhu: bool = False
    metro_distance_m: int | None = None
    transport_hint: bool = False
    snippet: str = ""
    score: float = 0.0
    tags: list[str] = field(default_factory=list)

    def to_candidate(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "url": self.url,
            "score": round(self.score, 2),
            "tags": self.tags,
            "good_rate": self.good_rate,
            "open_year": self.open_year,
            "is_huazhu": self.is_huazhu,
            "metro_distance_m": self.metro_distance_m,
        }


def resolve_city_id(destination: str) -> int | None:
    """从目的地字符串解析携程城市 ID。"""
    dest = (destination or "").strip()
    if not dest:
        return None
    if dest in CITY_IDS:
        return CITY_IDS[dest]
    for name, cid in CITY_IDS.items():
        if name in dest or dest in name:
            return cid
    return None


def _detect_huazhu(name: str, text: str = "") -> bool:
    blob = f"{name} {text}"
    return any(k in blob for k in HUAZHU_KEYWORDS)


def _score_hotel(h: CtripHotel) -> float:
    score = 0.0
    tags: list[str] = []

    if h.good_rate is not None:
        if h.good_rate >= 90:
            score += 35
            tags.append("好评≥90%")
        elif h.good_rate >= 80:
            score += 18
        else:
            score += 5
    else:
        score += 10

    if h.open_year is not None:
        age = CURRENT_YEAR - h.open_year
        if 0 <= age <= 5:
            score += 25
            tags.append("5年内新店")
        elif age <= 10:
            score += 12
        else:
            score += 4
    else:
        score += 8

    if h.is_huazhu:
        score += 22
        tags.append("华住会")
    else:
        score += 4

    if h.metro_distance_m is not None:
        if h.metro_distance_m <= 500:
            score += 18
            tags.append("近地铁")
        elif h.metro_distance_m <= 1000:
            score += 12
            tags.append("近地铁")
        else:
            score += 6
    else:
        score += 6

    if h.transport_hint:
        score += 8
        tags.append("交通方便")
    else:
        score += 2

    if _DETAIL_URL.search(h.url or ""):
        score += 5

    h.tags = tags
    h.score = score
    return score


def _parse_detail_fields(html: str, hotel: CtripHotel) -> None:
    text = strip_html(html)[:8000]
    m = _OPEN_YEAR.search(text)
    if m:
        hotel.open_year = int(m.group(1))
    m = _GOOD_RATE.search(text)
    if m:
        hotel.good_rate = min(100.0, float(m.group(1)))
    elif (m := _SCORE_4.search(text)):
        hotel.good_rate = min(100.0, float(m.group(1)) * 20)
    m = _METRO_M.search(text)
    if m:
        hotel.metro_distance_m = int(m.group(1))
    elif (m := _METRO_WALK.search(text)):
        hotel.metro_distance_m = int(m.group(1)) * 80
    blob = text[:1500]
    hotel.transport_hint = hotel.transport_hint or any(
        k in blob for k in ("交通便利", "交通方便", "地铁站", "机场大巴", "高铁", "公交直达")
    )
    hotel.is_huazhu = hotel.is_huazhu or _detect_huazhu(hotel.name, text[:500])
    if not hotel.snippet:
        hotel.snippet = text[:200]


def _parse_list_html(html: str, max_results: int) -> list[CtripHotel]:
    """从列表页提取 hotelName + hotelId（按出现顺序对齐）。"""
    if not html:
        return []
    names = _HOTEL_NAME.findall(html)
    ids = _HOTEL_ID.findall(html)
    # 评分按出现顺序尽量对齐
    scores = [float(x) for x in _SCORE_NEAR.findall(html) if 4.0 <= float(x) <= 5.0]

    hotels: list[CtripHotel] = []
    seen: set[str] = set()
    n = min(len(names), len(ids), max_results + 5)
    for i in range(n):
        name = re.sub(r"\s+", " ", names[i]).strip()
        hid = ids[i]
        if not name or name in _BAD_NAMES or hid in seen:
            continue
        seen.add(hid)
        url = f"https://hotels.ctrip.com/hotel/{hid}.html"
        good_rate = None
        if i < len(scores):
            good_rate = min(100.0, scores[i] * 20)
        hotels.append(
            CtripHotel(
                name=name[:120],
                url=url,
                good_rate=good_rate,
                is_huazhu=_detect_huazhu(name),
            )
        )
        if len(hotels) >= max_results:
            break
    return hotels


def _fetch_city_lists(city_id: int, destination: str, max_results: int) -> list[CtripHotel]:
    """按城市 ID 拉列表（最多 2 页：综合 + 全季），控制耗时。"""
    keywords = ["", "全季"]  # 再多品牌会显著拖慢生成
    merged: list[CtripHotel] = []
    seen: set[str] = set()
    for kw in keywords:
        if kw:
            url = (
                f"https://hotels.ctrip.com/hotels/list?city={city_id}"
                f"&keyword={quote(kw)}"
            )
        else:
            url = f"https://hotels.ctrip.com/hotels/list?city={city_id}"
        html = fetch_text(url, retries=1)
        batch = _parse_list_html(html or "", max_results)
        for h in batch:
            key = h.url
            if key in seen:
                continue
            if not kw and destination and destination not in h.name:
                if not h.is_huazhu:
                    continue
            seen.add(key)
            merged.append(h)
        if len(merged) >= max_results:
            break
    return merged[:max_results]


def _from_bing(destination: str, max_results: int) -> list[CtripHotel]:
    queries = [
        f"{destination} 全季酒店",
        f"{destination} 汉庭酒店",
        f"{destination} 酒店",
    ]
    hotels: list[CtripHotel] = []
    seen: set[str] = set()
    for q in queries:
        raw = bing_site_search("hotels.ctrip.com", q, max_results=max_results)
        for r in raw:
            url = r.get("url") or ""
            m = _DETAIL_URL.search(url)
            if not m:
                continue
            name = re.split(r"[_|\-–—]", r.get("title") or "")[0].strip()[:120]
            if not name or name in _BAD_NAMES or url in seen:
                continue
            seen.add(url)
            sn = r.get("snippet") or ""
            h = CtripHotel(
                name=name,
                url=f"https://hotels.ctrip.com/hotel/{m.group(1)}.html",
                snippet=sn[:300],
                is_huazhu=_detect_huazhu(name, sn),
                transport_hint=any(k in sn for k in ("地铁", "交通便利", "交通方便")),
            )
            _parse_detail_fields(f"<p>{sn}</p>", h)
            hotels.append(h)
        if len(hotels) >= max_results:
            break
    return hotels[:max_results]


def search_ctrip_hotels(destination: str, max_results: int = LIST_LIMIT) -> list[CtripHotel]:
    """现爬目的地酒店，软打分后返回（高分在前）。失败返回 []。"""
    hotels: list[CtripHotel] = []
    city_id = resolve_city_id(destination)
    if city_id is not None:
        hotels = _fetch_city_lists(city_id, destination, max_results)
        logger.info(
            "ctrip hotels city=%s id=%s count=%d", destination, city_id, len(hotels)
        )
    else:
        logger.info("ctrip hotels unknown city id for %s", destination)

    # 有城市列表结果时跳过 Bing（慢且常被验证码）
    if len(hotels) < 3:
        logger.info("ctrip hotels bing enrich for %s", destination)
        for h in _from_bing(destination, max_results):
            if h.url not in {x.url for x in hotels}:
                hotels.append(h)

    if DETAIL_LIMIT > 0:
        for h in hotels[:DETAIL_LIMIT]:
            detail = fetch_text(h.url, retries=0, timeout=5.0)
            if detail:
                _parse_detail_fields(detail, h)

    for h in hotels:
        h.is_huazhu = h.is_huazhu or _detect_huazhu(h.name, h.snippet)
        _score_hotel(h)

    hotels.sort(key=lambda x: x.score, reverse=True)
    return hotels[:max_results]
