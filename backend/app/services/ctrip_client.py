"""携程攻略参考爬取（直连常 432，主路径 Bing/DDG site 降级）。"""
import logging
import re
from typing import Any
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, fetch_text

logger = logging.getLogger(__name__)

_CTRIP_HREF = re.compile(
    r'href="(https?://(?:you\.)?ctrip\.com/[^"]+)"[^>]*>([^<]{2,100})',
    re.I,
)
_BAD_SUBSTR = (
    "login", "register", "list-your-property", "/jiudian/",
    "javascript:", "passport", "accounts.",
)
_GOOD_PATH = ("/sight/", "/travels/", "/place/", "/food/", "/tourguide/", "/asks/")


def _is_tip_url(url: str) -> bool:
    u = (url or "").lower()
    if "ctrip.com" not in u:
        return False
    if any(b in u for b in _BAD_SUBSTR):
        return False
    return any(p in u for p in _GOOD_PATH) or "you.ctrip.com" in u


def _parse_ctrip_html(html: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, title in _CTRIP_HREF.findall(html or ""):
        full = url if url.startswith("http") else f"https:{url}"
        title = title.strip()
        if not _is_tip_url(full) or full in seen or len(title) < 4:
            continue
        seen.add(full)
        tips.append({
            "source": "ctrip",
            "title": title[:120],
            "snippet": "",
            "url": full,
            "meta": None,
        })
        if len(tips) >= max_results:
            break
    return tips


def _from_search(destination: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    queries = [
        ( "you.ctrip.com", f"{destination} 旅游攻略" ),
        ( "you.ctrip.com", f"{destination} 必去景点" ),
        ( "ctrip.com", f"{destination} 游记" ),
    ]
    for site, q in queries:
        raw = bing_site_search(site, q, max_results=max_results)
        for r in raw:
            url = r.get("url") or ""
            title = (r.get("title") or "").strip()
            if not _is_tip_url(url) or url in seen:
                continue
            if len(title) < 4:
                title = (r.get("snippet") or "携程攻略")[:40]
            seen.add(url)
            tips.append({
                "source": "ctrip",
                "title": title[:120],
                "snippet": (r.get("snippet") or "")[:300],
                "url": url,
                "meta": None,
            })
            if len(tips) >= max_results:
                return tips
    return tips


def _portal_tips(destination: str) -> list[dict[str, Any]]:
    """反爬（432）导致攻略抓不到时，提供可点开的搜索/目的地入口。"""
    from app.services.ctrip_hotel_client import resolve_city_id

    city_id = resolve_city_id(destination)
    tips = [
        {
            "source": "ctrip",
            "title": f"{destination}旅游攻略 · 携程搜索",
            "snippet": "打开携程查看景点、游记与行程参考（站点有反爬，自动抓取可能为空）",
            "url": f"https://www.ctrip.com/?destination={quote(destination)}",
            "meta": {"portal": True},
        },
    ]
    if city_id is not None:
        tips.append({
            "source": "ctrip",
            "title": f"{destination}酒店与出行 · 携程",
            "snippet": "同城酒店列表（已按偏好软排序的数据见「携程酒店优选」）",
            "url": f"https://hotels.ctrip.com/hotels/list?city={city_id}",
            "meta": {"portal": True},
        })
        tips.append({
            "source": "ctrip",
            "title": f"{destination}景点玩乐 · 携程",
            "snippet": "门票、一日游与当地玩乐",
            "url": f"https://you.ctrip.com/sight/{city_id}.html",
            "meta": {"portal": True},
        })
    else:
        tips.append({
            "source": "ctrip",
            "title": f"{destination}攻略站入口",
            "snippet": "前往携程旅游频道浏览公开攻略",
            "url": "https://you.ctrip.com/",
            "meta": {"portal": True},
        })
    return tips


def search_ctrip(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    path = quote(destination)
    url = f"https://you.ctrip.com/searchsite/{path}"
    html = fetch_text(url, retries=1)
    tips = _parse_ctrip_html(html or "", max_results) if html else []
    if tips:
        logger.info("ctrip direct: %d tips for %s", len(tips), destination)
        return tips[:max_results]

    logger.info("ctrip fallback search for %s", destination)
    searched = _from_search(destination, max_results)
    if searched:
        return searched[:max_results]
    logger.warning("ctrip scrape empty (often HTTP 432), using portal links for %s", destination)
    return _portal_tips(destination)[:max_results]
