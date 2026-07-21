"""小红书参考：返回网页搜索入口 + App 深链（客户端优先唤起 App）。"""

from typing import Any
from urllib.parse import quote


def _xhs_web_url(keyword: str) -> str:
    """官网搜索页（系统浏览器打开；内置 WebView 常被拦成空白）。"""
    kw = quote(keyword.strip())
    return f"https://www.xiaohongshu.com/search_result?keyword={kw}"


def _xhs_app_url(keyword: str) -> str:
    """小红书 App 搜索结果深链。"""
    kw = quote(keyword.strip())
    return f"xhsdiscover://search/result?keyword={kw}"


def search_xiaohongshu(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    """返回目的地相关的小红书搜索入口（网页 url + app 深链）。"""
    dest = (destination or "").strip() or "旅游"
    queries = [
        (f"{dest}旅游攻略", f"{dest} 旅游攻略", f"小红书上关于{dest}的行程与避坑笔记"),
        (f"{dest}必去景点", f"{dest} 必去景点", f"{dest}热门打卡与景点真实体验"),
        (f"{dest}美食推荐", f"{dest} 美食推荐", f"{dest}本地人气餐厅与小吃"),
        (f"{dest}住宿推荐", f"{dest} 住哪里", f"{dest}住宿区域与酒店口碑"),
        (f"{dest}一日游", f"{dest} 一日游 路线", f"{dest}经典一日路线参考"),
        (f"{dest}交通攻略", f"{dest} 交通 地铁", f"{dest}市内交通与地铁出行建议"),
    ]
    tips: list[dict[str, Any]] = []
    for title, kw, sn in queries[:max_results]:
        tips.append({
            "source": "xiaohongshu",
            "title": title,
            "snippet": sn,
            "url": _xhs_web_url(kw),
            "meta": {
                "portal": True,
                "keyword": kw,
                "app_url": _xhs_app_url(kw),
            },
        })
    return tips
