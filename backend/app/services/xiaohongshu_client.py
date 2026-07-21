"""小红书参考：返回可在浏览器打开的搜索入口（不做笔记爬取）。

官方 search_result 在 App 外经常无效，改用「网页搜索 + 站内关键字」双保险链接。
"""
from typing import Any
from urllib.parse import quote


def _xhs_search_url(keyword: str) -> str:
    """尽量兼容手机浏览器打开的小红书搜索页。"""
    kw = quote(keyword.strip())
    # type=51 笔记；附带 source，降低直接 404/空白概率
    return (
        f"https://www.xiaohongshu.com/search_result"
        f"?keyword={kw}&type=51&source=web_search_result_notes"
    )


def search_xiaohongshu(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    """返回目的地相关的小红书搜索入口链接。"""
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
            "url": _xhs_search_url(kw),
            "meta": {"portal": True},
        })
    return tips
