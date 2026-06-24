"""网页搜索服务：搜索公开的旅游攻略内容，提取摘要供 LLM 参考。

使用 DDGS（DuckDuckGo 搜索，免费无需 API Key）。
"""
import logging
from typing import Any

from ddgs import DDGS

logger = logging.getLogger(__name__)


def search_travel_tips(destination: str, max_results: int = 8) -> list[dict[str, Any]]:
    """搜索目的地旅游攻略，返回 [{title, snippet, url}]。"""
    queries = [
        f"{destination} 旅游攻略 必去景点 推荐",
        f"{destination} 美食推荐 必吃",
    ]

    all_results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    try:
        with DDGS() as ddg:
            for q in queries:
                try:
                    for r in ddg.text(q, max_results=6):
                        url = r.get("href") or ""
                        if url in seen_urls:
                            continue
                        seen_urls.add(url)
                        all_results.append({
                            "title": (r.get("title") or "")[:120],
                            "snippet": (r.get("body") or "")[:300],
                            "url": url,
                        })
                except Exception as e:
                    logger.warning("搜索 '%s' 失败: %s", q, e)

        return all_results[:max_results]

    except Exception as e:
        logger.error("DDGS 搜索异常: %s", e)
        return []
