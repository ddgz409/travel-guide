"""从小红书笔记抓取地点真实封面图（搜索引擎找笔记链接 → 解析 xhscdn 图片）。"""
from __future__ import annotations

import logging
import re
from urllib.parse import quote

from app.services.scrape_utils import bing_site_search, ddg_site_search, fetch_text

logger = logging.getLogger(__name__)

_cache: dict[str, list[str]] = {}

NOTE_URL = re.compile(r"https://www\.xiaohongshu\.com/explore/[a-f0-9]+", re.I)
NOTE_ID = re.compile(r"[a-f0-9]{24}")
_IMG_PATTERNS = [
    re.compile(r"https://sns-webpic[^\"'\\s<>]+"),
    re.compile(r"https:\\\\/\\\\/sns-webpic[^\"'\\]+"),
    re.compile(r'"urlDefault"\s*:\s*"(https://[^"]+xhscdn[^"]+)"'),
    re.compile(r'"url"\s*:\s*"(https://sns-webpic[^"]+)"'),
    re.compile(r'property="og:image"\s+content="([^"]+)"'),
    re.compile(r'content="([^"]+)"\s+property="og:image"'),
    re.compile(r'"cover"\s*:\s*\{[^}]*"url(?:Default)?"\s*:\s*"(https://[^"]+xhscdn[^"]+)"'),
]


def _normalize_url(url: str) -> str | None:
    u = url.replace("\\/", "/").replace("\\u002F", "/").strip()
    if u.startswith("//"):
        u = "https:" + u
    if u.startswith("http://"):
        u = "https://" + u[7:]
    if "xhscdn" not in u or "fe-platform" in u or "fe-static" in u:
        return None
    if not u.startswith("https://sns-webpic"):
        return None
    return u


def _extract_images(html: str) -> list[str]:
    if not html:
        return []
    out: list[str] = []
    for pat in _IMG_PATTERNS:
        for raw in pat.findall(html):
            u = _normalize_url(raw)
            if u and u not in out:
                out.append(u)
    return out


def _search_keyword(city: str, name: str, kind: str = "") -> str:
    city = (city or "").strip()
    name = (name or "").strip()
    if kind == "foods":
        return f"{city} {name} 美食"
    if kind == "spots":
        return f"{city} {name} 景点"
    if kind == "humanities":
        return f"{city} {name} 人文"
    return f"{city} {name}"


def _collect_note_urls(keyword: str, max_notes: int = 6) -> list[str]:
    """Bing / DDG 站内搜 + 页面内 explore 链接提取。"""
    seen: set[str] = set()
    urls: list[str] = []

    def add_from_results(rows: list[dict[str, str]]) -> None:
        for row in rows:
            for candidate in (row.get("url") or "", row.get("snippet") or ""):
                for m in NOTE_URL.finditer(candidate):
                    u = m.group(0)
                    if u not in seen:
                        seen.add(u)
                        urls.append(u)

    def add_from_html(html: str | None) -> None:
        if not html:
            return
        for m in NOTE_URL.finditer(html):
            u = m.group(0)
            if u not in seen:
                seen.add(u)
                urls.append(u)

    queries = [
        f"{keyword} 小红书",
        keyword,
        f"{keyword} 攻略",
    ]
    for q in queries:
        if len(urls) >= max_notes:
            break
        bing_rows = bing_site_search("xiaohongshu.com", q, max_results=10)
        add_from_results(bing_rows)
        if len(urls) < max_notes:
            ddg_rows = ddg_site_search("xiaohongshu.com", q, max_results=10)
            add_from_results(ddg_rows)

    if len(urls) < max_notes:
        search_html = fetch_text(
            f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}",
            timeout=9.0,
        )
        add_from_html(search_html)
        # 部分页面只在 JSON 里带 note id
        if search_html:
            for nid in NOTE_ID.findall(search_html):
                u = f"https://www.xiaohongshu.com/explore/{nid}"
                if u not in seen:
                    seen.add(u)
                    urls.append(u)
                if len(urls) >= max_notes:
                    break

    return urls[:max_notes]


def fetch_xhs_images(
    city: str,
    name: str,
    kind: str = "",
    limit: int = 3,
) -> list[str]:
    """按「城市 + 地点 + 分类」搜小红书笔记，返回最多 limit 张封面图 URL。"""
    limit = max(1, min(limit, 6))
    kw = _search_keyword(city, name, kind)
    cache_key = f"{kw}|{limit}"
    if cache_key in _cache:
        return _cache[cache_key][:limit]

    images: list[str] = []
    try:
        note_urls = _collect_note_urls(kw, max_notes=max(3, limit + 1))
    except Exception:
        logger.exception("xhs note search failed kw=%s", kw)
        note_urls = []

    for note_url in note_urls:
        if len(images) >= limit:
            break
        html = fetch_text(note_url, timeout=9.0)
        for img in _extract_images(html or ""):
            if img not in images:
                images.append(img)
            if len(images) >= limit:
                break

    _cache[cache_key] = images
    logger.info("xhs images kw=%s notes=%d count=%d", kw, len(note_urls), len(images))
    return images[:limit]
