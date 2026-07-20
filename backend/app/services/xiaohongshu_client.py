"""小红书公开搜索爬取（直连失败则 Bing/DDG site 降级）。"""
import logging
import re
from typing import Any
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, fetch_text

logger = logging.getLogger(__name__)

_NOTE_HREF = re.compile(
    r'href="(https://www\.xiaohongshu\.com/explore/[a-zA-Z0-9]+[^"]*)"[^>]*>([^<]{2,80})',
    re.I,
)
_EXPLORE_URL = re.compile(
    r"https://www\.xiaohongshu\.com/explore/[a-zA-Z0-9]{16,}",
    re.I,
)
_BAD_TITLE = {"小红书", "登录", "注册", "Xiaohongshu", "首页", "探索"}


def _is_note_url(url: str) -> bool:
    if not url or "xiaohongshu.com/explore/" not in url:
        return False
    if any(x in url for x in ("/login", "customer.", "live.", "city.", "help")):
        return False
    return bool(_EXPLORE_URL.search(url))


def _parse_xhs_html(html: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for url, title in _NOTE_HREF.findall(html or ""):
        title = title.strip()
        if not _is_note_url(url) or url in seen or title in _BAD_TITLE:
            continue
        seen.add(url.split("?")[0])
        tips.append({
            "source": "xiaohongshu",
            "title": title[:120],
            "snippet": "",
            "url": url.split("?")[0],
            "meta": None,
        })
        if len(tips) >= max_results:
            break
    # 壳页面常无无 a 文本，尝试裸 explore 链接
    if not tips:
        for url in _EXPLORE_URL.findall(html or ""):
            key = url.split("?")[0]
            if key in seen:
                continue
            seen.add(key)
            tips.append({
                "source": "xiaohongshu",
                "title": "小红书笔记",
                "snippet": "",
                "url": key,
                "meta": None,
            })
            if len(tips) >= max_results:
                break
    return tips


def _from_search(destination: str, max_results: int) -> list[dict[str, Any]]:
    tips: list[dict[str, Any]] = []
    seen: set[str] = set()
    for q in (f"{destination} 旅游攻略", f"{destination} 必去 攻略", f"{destination} 美食 推荐"):
        raw = bing_site_search("xiaohongshu.com", q, max_results=max_results)
        for r in raw:
            url = (r.get("url") or "").split("?")[0]
            title = (r.get("title") or "").strip()
            if not _is_note_url(url) or url in seen:
                continue
            if title in _BAD_TITLE or len(title) < 4:
                # 用摘要前几字顶上
                sn = (r.get("snippet") or "").strip()
                title = (sn[:40] if sn else "小红书笔记")
            seen.add(url)
            tips.append({
                "source": "xiaohongshu",
                "title": title[:120],
                "snippet": (r.get("snippet") or "")[:300],
                "url": url,
                "meta": None,
            })
            if len(tips) >= max_results:
                return tips
    return tips


def _portal_tips(destination: str) -> list[dict[str, Any]]:
    """反爬导致笔记抓不到时，提供可点开的搜索入口（保证详情页非空）。"""
    queries = [
        (f"{destination}旅游攻略 · 小红书", f"{destination} 旅游攻略", "查看最新游记、避坑与行程灵感"),
        (f"{destination}必去景点 · 小红书", f"{destination} 必去景点", "热门打卡地与真实体验笔记"),
        (f"{destination}美食推荐 · 小红书", f"{destination} 美食推荐", "本地人气餐厅与小吃推荐"),
    ]
    tips = []
    for title, kw, sn in queries:
        tips.append({
            "source": "xiaohongshu",
            "title": title,
            "snippet": sn,
            "url": f"https://www.xiaohongshu.com/search_result?keyword={quote(kw)}",
            "meta": {"portal": True},
        })
    return tips


def search_xiaohongshu(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    keyword = quote(f"{destination} 旅游攻略")
    url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}"
    html = fetch_text(url, retries=1)
    tips = _parse_xhs_html(html or "", max_results) if html else []
    # 直连多为空壳（feeds=[]），有效笔记链接不足则走搜索引擎
    if len(tips) >= 2 and all(t.get("title") != "小红书笔记" for t in tips[:2]):
        logger.info("xiaohongshu direct: %d tips for %s", len(tips), destination)
        return tips[:max_results]

    logger.info("xiaohongshu fallback search for %s (direct=%d)", destination, len(tips))
    searched = _from_search(destination, max_results)
    if searched:
        return searched
    # 搜索引擎也被拦时：返回搜索入口，避免前端空白
    logger.warning("xiaohongshu scrape empty, using portal links for %s", destination)
    return _portal_tips(destination)[:max_results]
