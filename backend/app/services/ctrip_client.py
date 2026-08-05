"""携程参考：返回与目的地强相关的 App 深链（ctrip://）。"""
from typing import Any
from urllib.parse import quote

from app.services.ctrip_hotel_client import resolve_city_id


def search_ctrip(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    """返回目的地相关的携程 App 深链入口。"""
    dest = (destination or "").strip() or "旅游"
    city_id = resolve_city_id(dest)
    tips: list[dict[str, Any]] = [
        {
            "source": "ctrip",
            "title": f"{dest}旅游攻略",
            "snippet": f"携程上关于{dest}的攻略与玩乐入口",
            "url": "ctrip://wireless/",
            "meta": {"portal": True, "app_url": "ctrip://wireless/"},
        },
    ]
    if city_id is not None:
        tips.extend([
            {
                "source": "ctrip",
                "title": f"{dest}景点门票",
                "snippet": f"{dest}景点、门票与当地玩乐",
                "url": "ctrip://wireless/",
                "meta": {"portal": True, "app_url": "ctrip://wireless/"},
            },
            {
                "source": "ctrip",
                "title": f"{dest}酒店预订",
                "snippet": f"{dest}酒店列表（行程内优选见「携程酒店优选」）",
                "url": "ctrip://wireless/",
                "meta": {"portal": True, "app_url": "ctrip://wireless/"},
            },
            {
                "source": "ctrip",
                "title": f"{dest}美食餐饮",
                "snippet": f"{dest}餐厅与美食推荐",
                "url": "ctrip://wireless/",
                "meta": {"portal": True, "app_url": "ctrip://wireless/"},
            },
            {
                "source": "ctrip",
                "title": f"{dest}一日游/玩乐",
                "snippet": f"{dest}一日游、体验项目",
                "url": "ctrip://wireless/",
                "meta": {"portal": True, "app_url": "ctrip://wireless/"},
            },
        ])
    else:
        tips.extend([
            {
                "source": "ctrip",
                "title": f"{dest}酒店搜索",
                "snippet": f"在携程搜索{dest}酒店",
                "url": "ctrip://wireless/",
                "meta": {"portal": True, "app_url": "ctrip://wireless/"},
            },
            {
                "source": "ctrip",
                "title": "携程旅游频道",
                "snippet": "景点、游记与玩乐",
                "url": "ctrip://wireless/",
                "meta": {"portal": True, "app_url": "ctrip://wireless/"},
            },
        ])
    return tips[:max_results]
