"""携程参考：直接返回与目的地强相关的页面链接（不做攻略爬取）。"""
from typing import Any
from urllib.parse import quote

from app.services.ctrip_hotel_client import resolve_city_id


def search_ctrip(destination: str, max_results: int = 6) -> list[dict[str, Any]]:
    """返回目的地相关的携程入口链接。"""
    dest = (destination or "").strip() or "旅游"
    city_id = resolve_city_id(dest)
    tips: list[dict[str, Any]] = [
        {
            "source": "ctrip",
            "title": f"{dest}旅游攻略",
            "snippet": f"携程上关于{dest}的攻略与玩乐入口",
            "url": f"https://www.ctrip.com/?destination={quote(dest)}",
            "meta": {"portal": True},
        },
    ]
    if city_id is not None:
        tips.extend([
            {
                "source": "ctrip",
                "title": f"{dest}景点门票",
                "snippet": f"{dest}景点、门票与当地玩乐",
                "url": f"https://you.ctrip.com/sight/{city_id}.html",
                "meta": {"portal": True},
            },
            {
                "source": "ctrip",
                "title": f"{dest}酒店预订",
                "snippet": f"{dest}酒店列表（行程内优选见「携程酒店优选」）",
                "url": f"https://hotels.ctrip.com/hotels/list?city={city_id}",
                "meta": {"portal": True},
            },
            {
                "source": "ctrip",
                "title": f"{dest}美食餐饮",
                "snippet": f"{dest}餐厅与美食推荐",
                "url": f"https://you.ctrip.com/foodlist/{city_id}.html",
                "meta": {"portal": True},
            },
            {
                "source": "ctrip",
                "title": f"{dest}一日游/玩乐",
                "snippet": f"{dest}一日游、体验项目",
                "url": f"https://you.ctrip.com/activities/{city_id}.html",
                "meta": {"portal": True},
            },
        ])
    else:
        tips.extend([
            {
                "source": "ctrip",
                "title": f"{dest}酒店搜索",
                "snippet": f"在携程搜索{dest}酒店",
                "url": f"https://hotels.ctrip.com/hotels/list?cityName={quote(dest)}",
                "meta": {"portal": True},
            },
            {
                "source": "ctrip",
                "title": "携程旅游频道",
                "snippet": "景点、游记与玩乐",
                "url": "https://you.ctrip.com/",
                "meta": {"portal": True},
            },
        ])
    return tips[:max_results]
