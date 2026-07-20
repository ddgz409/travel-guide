"""小红书公开搜索爬取（直连失败则 Bing site 降级）。"""
import logging
import re
from typing import Any
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, fetch_text

logger = logging.getLogger(__name__)

_NOTE_HREF = re.compile(
    r'href="(https://www\.xiaohongshu\.com/(?:explore|search_result)/[^"]+)"[^>]*>([^<]{2,80})',
    re.I,
)


def _parse_xhs_html(html: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, title in _NOTE_HREF.findall(html):
        if url in seen:
            continue
        seen.add(url)
        tips.append({
            "source": "xiaohongshu",
            "title": title.strip()[:120],
            "snippet": "",
            "url": url,
            "meta": None,
        })
        if len(tips) >= max_results:
            break
    return tips


def search_xiaohongshu(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    keyword = quote(f"{destination} 旅游攻略")
    url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}"
    html = fetch_text(url, retries=2)
    tips = _parse_xhs_html(html or "", max_results) if html else []
    if tips:
        logger.info("xiaohongshu direct: %d tips for %s", len(tips), destination)
        return tips[:max_results]

    logger.info("xiaohongshu fallback bing for %s", destination)
    raw = bing_site_search("xiaohongshu.com", f"{destination} 旅游攻略", max_results=max_results)
    return [
        {
            "source": "xiaohongshu",
            "title": r["title"][:120],
            "snippet": (r.get("snippet") or "")[:300],
            "url": r["url"],
            "meta": None,
        }
        for r in raw
    ][:max_results]
