"""爬取共用工具：HTTP 重试、剥标签、Bing site 搜索。"""
import logging
import re
import time
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9",
}


def strip_html(html: str) -> str:
    html = re.sub(r"<(script|style|nav|footer|header)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&[a-zA-Z]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_text(url: str, *, retries: int = 2, timeout: float = 8.0) -> str | None:
    """GET 文本；失败重试 retries 次（共 1+retries 次尝试）。"""
    last_err: Exception | None = None
    attempts = retries + 1
    for i in range(attempts):
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as client:
                resp = client.get(url, headers=DEFAULT_HEADERS)
                resp.raise_for_status()
                return resp.text
        except Exception as e:
            last_err = e
            logger.warning("fetch_text fail %s attempt %s: %s", url, i + 1, e)
            if i < attempts - 1:
                time.sleep(0.5)
    logger.warning("fetch_text gave up %s: %s", url, last_err)
    return None


def bing_site_search(site: str, query: str, max_results: int = 6) -> list[dict[str, str]]:
    """Bing site: 搜索，返回 [{title, snippet, url}]。"""
    q = f"site:{site} {query}"
    url = f"https://www.bing.com/search?q={quote(q)}&count={max_results}"
    html = fetch_text(url, retries=2, timeout=8.0)
    if not html:
        return []
    results: list[dict[str, str]] = []
    pairs = re.findall(
        r'<h2[^>]*>\s*<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>',
        html,
        re.S,
    )
    for href, title_html in pairs:
        if "bing.com" in href or "microsoft.com" in href:
            continue
        title = re.sub(r"<[^>]+>", "", title_html).strip()[:120]
        if not title:
            continue
        snippet = ""
        idx = html.find(href)
        if idx >= 0:
            after = html[idx : idx + 2000]
            p_match = re.search(r"<p[^>]*>(.*?)</p>", after, re.S)
            if p_match:
                snippet = re.sub(r"<[^>]+>", "", p_match.group(1)).strip()[:300]
        results.append({"title": title, "snippet": snippet, "url": href})
        if len(results) >= max_results:
            break
    return results
