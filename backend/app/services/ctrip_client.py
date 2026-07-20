"""携程攻略站公开搜索爬取（直连失败则 Bing site 降级）。"""
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


def _parse_ctrip_html(html: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, title in _CTRIP_HREF.findall(html):
        if "javascript" in url.lower():
            continue
        if url in seen:
            continue
        seen.add(url)
        full = url if url.startswith("http") else f"https:{url}"
        tips.append({
            "source": "ctrip",
            "title": title.strip()[:120],
            "snippet": "",
            "url": full,
            "meta": None,
        })
        if len(tips) >= max_results:
            break
    return tips


def search_ctrip(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    path = quote(destination)
    url = f"https://you.ctrip.com/searchsite/{path}"
    html = fetch_text(url, retries=2)
    tips = _parse_ctrip_html(html or "", max_results) if html else []
    if tips:
        logger.info("ctrip direct: %d tips for %s", len(tips), destination)
        return tips[:max_results]

    logger.info("ctrip fallback bing for %s", destination)
    raw = bing_site_search("ctrip.com", f"{destination} 旅游攻略", max_results=max_results)
    return [
        {
            "source": "ctrip",
            "title": r["title"][:120],
            "snippet": (r.get("snippet") or "")[:300],
            "url": r["url"],
            "meta": None,
        }
        for r in raw
    ][:max_results]
