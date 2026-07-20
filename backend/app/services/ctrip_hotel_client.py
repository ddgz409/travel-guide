"""携程酒店现爬 + 软打分排序。

每次完整生成调用；不缓存。字段缺失只降权，不硬淘汰。
直连失败时用 Bing site:hotels.ctrip.com 降级。
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
DETAIL_LIMIT = 10


@dataclass
class CtripHotel:
    name: str
    url: str
    open_year: int | None = None
    good_rate: float | None = None  # 0-100
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


_HOTEL_LINK = re.compile(
    r'href="(https?://[^"]*hotels\.ctrip\.com/[^"]+|https?://m\.ctrip\.com/webapp/hotel/[^"]+)"[^>]*>([^<]{2,80})',
    re.I,
)
_OPEN_YEAR = re.compile(r"(?:开业|装修)[^0-9]{0,8}(20\d{2})")
_GOOD_RATE = re.compile(r"(?:好评率|好评)[^0-9]{0,6}(\d{2,3}(?:\.\d+)?)\s*%")
_SCORE_4 = re.compile(r"(?:评分|点评分)[^0-9]{0,6}([4-5]\.\d)")
_METRO_M = re.compile(r"(?:距|距离)?[^。；\n]{0,12}地铁[^。；\n]{0,20}?(\d{2,4})\s*米")
_METRO_WALK = re.compile(r"地铁[^。；\n]{0,16}?步行\s*(\d{1,2})\s*分钟")


def _detect_huazhu(name: str, text: str = "") -> bool:
    blob = f"{name} {text}"
    return any(k in blob for k in HUAZHU_KEYWORDS)


def _score_hotel(h: CtripHotel) -> float:
    """软打分：越高越优先。缺字段给中低分。"""
    score = 0.0
    tags: list[str] = []

    # 好评率（权重高）
    if h.good_rate is not None:
        if h.good_rate >= 90:
            score += 35
            tags.append("好评≥90%")
        elif h.good_rate >= 80:
            score += 18
        else:
            score += 5
    else:
        score += 10  # 未知

    # 5 年内新店
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

    # 华住会
    if h.is_huazhu:
        score += 22
        tags.append("华住会")
    else:
        score += 4

    # 地铁
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

    # 交通便利文案
    if h.transport_hint:
        score += 8
        tags.append("交通方便")
    else:
        score += 2

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
        # 4.5 分约映射为 90% 量级软估计
        hotel.good_rate = min(100.0, float(m.group(1)) * 20)
    m = _METRO_M.search(text)
    if m:
        hotel.metro_distance_m = int(m.group(1))
    elif (m := _METRO_WALK.search(text)):
        hotel.metro_distance_m = int(m.group(1)) * 80  # 步行分钟估米数
    blob = text[:1500]
    hotel.transport_hint = any(
        k in blob for k in ("交通便利", "交通方便", "地铁站", "机场大巴", "高铁", "公交直达")
    )
    hotel.is_huazhu = hotel.is_huazhu or _detect_huazhu(hotel.name, text[:500])
    if not hotel.snippet:
        hotel.snippet = text[:200]


def _parse_list_html(html: str, max_results: int) -> list[CtripHotel]:
    hotels: list[CtripHotel] = []
    seen: set[str] = set()
    for url, title in _HOTEL_LINK.findall(html):
        name = re.sub(r"\s+", " ", title).strip()
        if not name or url in seen:
            continue
        if "javascript" in url.lower():
            continue
        seen.add(url)
        hotels.append(
            CtripHotel(
                name=name[:120],
                url=url if url.startswith("http") else f"https:{url}",
                is_huazhu=_detect_huazhu(name),
            )
        )
        if len(hotels) >= max_results:
            break
    return hotels


def _from_bing(destination: str, max_results: int) -> list[CtripHotel]:
    raw = bing_site_search(
        "hotels.ctrip.com",
        f"{destination} 酒店",
        max_results=max_results,
    )
    hotels: list[CtripHotel] = []
    for r in raw:
        title = (r.get("title") or "").split("_")[0].split("-")[0].strip()
        if not title or len(title) < 2:
            continue
        sn = r.get("snippet") or ""
        h = CtripHotel(
            name=title[:120],
            url=r["url"],
            snippet=sn[:300],
            is_huazhu=_detect_huazhu(title, sn),
            transport_hint=any(k in sn for k in ("地铁", "交通便利", "交通方便")),
        )
        # 尝试从摘要抠字段
        _parse_detail_fields(f"<p>{sn}</p>", h)
        hotels.append(h)
    return hotels


def search_ctrip_hotels(destination: str, max_results: int = LIST_LIMIT) -> list[CtripHotel]:
    """现爬目的地酒店，软打分后返回（高分在前）。失败返回 []。"""
    hotels: list[CtripHotel] = []
    # 携程酒店列表公开搜索页（结构常变，失败即 Bing）
    list_url = (
        f"https://hotels.ctrip.com/hotels/list?countryId=1"
        f"&cityName={quote(destination)}&keyword={quote(destination)}"
    )
    html = fetch_text(list_url, retries=2)
    if html:
        hotels = _parse_list_html(html, max_results)
        logger.info("ctrip hotels direct list: %d for %s", len(hotels), destination)

    if not hotels:
        logger.info("ctrip hotels fallback bing for %s", destination)
        hotels = _from_bing(destination, max_results)

    # 抽样详情补字段
    for h in hotels[:DETAIL_LIMIT]:
        if not h.url:
            continue
        detail = fetch_text(h.url, retries=1, timeout=8.0)
        if detail:
            _parse_detail_fields(detail, h)

    for h in hotels:
        h.is_huazhu = h.is_huazhu or _detect_huazhu(h.name, h.snippet)
        _score_hotel(h)

    hotels.sort(key=lambda x: x.score, reverse=True)
    return hotels[:max_results]
