"""网页搜索服务：搜索公开旅游攻略，抓取正文供 LLM 参考。

使用 Bing 搜索 HTML 页面（无需 API Key），解析搜索结果，
再抓取马蜂窝/穷游等页面正文。
"""
import logging
import re
from typing import Any
from urllib.parse import quote, unquote

import httpx

logger = logging.getLogger(__name__)

FETCH_TIMEOUT = 8.0
MAX_CONTENT_LEN = 2000


def _bing_search(query: str, max_results: int = 6) -> list[dict[str, str]]:
    """用 httpx 请求 Bing 搜索 HTML，解析结果。"""
    url = f"https://www.bing.com/search?q={quote(query)}&count={max_results}"
    try:
        with httpx.Client(timeout=10, follow_redirects=True) as client:
            resp = client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            resp.raise_for_status()
            html = resp.text

        results = []
        # Bing 结果块用 b_algo 标记，提取每个块里的第一个链接和标题
        # 用宽松方式：找所有 <h2><a href=...> 标题</a></h2> 模式
        pairs = re.findall(
            r'<h2[^>]*>\s*<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>',
            html, re.S,
        )
        for href, title_html in pairs[:max_results]:
            title = re.sub(r'<[^>]+>', '', title_html).strip()
            # 提取该链接附近的一段文本作为摘要
            idx = html.find(href)
            snippet = ""
            if idx > 0:
                # 往后找 <p> 标签
                after = html[idx:idx + 2000]
                p_match = re.search(r'<p[^>]*>(.*?)</p>', after, re.S)
                if p_match:
                    snippet = re.sub(r'<[^>]+>', '', p_match.group(1)).strip()[:300]
            # 跳过 Bing 内部链接
            if "bing.com" in href or "microsoft.com" in href:
                continue
            if title:
                results.append({
                    "title": title[:120],
                    "snippet": snippet,
                    "url": href,
                })
        return results
    except Exception as e:
        logger.warning("Bing 搜索失败 '%s': %s", query, e)
        return []


def _strip_html(html: str) -> str:
    """简易 HTML 正文提取。"""
    html = re.sub(r"<(script|style|nav|footer|header)[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&[a-z]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _fetch_content(url: str) -> str:
    """抓取单个网页正文。"""
    try:
        with httpx.Client(timeout=FETCH_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            resp.raise_for_status()
            text = _strip_html(resp.text)
            return text[:MAX_CONTENT_LEN]
    except Exception as e:
        logger.warning("抓取网页失败 %s: %s", url, e)
        return ""


def search_travel_tips(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    """搜索目的地旅游攻略，抓取马蜂窝等正文。

    返回 [{title, snippet, url, content}]，content 为网页正文。
    """
    queries = [
        f"{destination} 旅游攻略 必去景点",
        f"{destination} 美食推荐",
    ]

    all_results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for q in queries:
        results = _bing_search(q, max_results=4)
        for r in results:
            if r["url"] in seen_urls:
                continue
            seen_urls.add(r["url"])
            all_results.append(r)
            if len(all_results) >= max_results:
                break
        if len(all_results) >= max_results:
            break

    # 抓取前 2 篇正文（不限网站）
    fetched = 0
    for r in all_results:
        if fetched >= 2:
            break
        url = r["url"]
        content = _fetch_content(url)
        if content and len(content) > 100:
            r["content"] = content
            fetched += 1
            logger.info("抓取正文 %s: %d 字", url, len(content))

    return all_results[:max_results]
