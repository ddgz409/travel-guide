"""城市探索服务：本地精选 + 高德轻量 POI，极速返回。

图片由客户端 /place-images 懒加载；不做 LLM 与阻塞式坐标补全。
"""
from __future__ import annotations

import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from collections.abc import Generator
from typing import TYPE_CHECKING, Any

from app.services.amap_client import AmapError, POI_TYPES, Poi, get_amap_client
from app.services.destination_landmarks import is_micro_poi, landmarks_for

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)

_CITY_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_S = 3600

FOOD_HINTS: dict[str, list[str]] = {
    "北京": ["北京烤鸭", "炸酱面", "涮羊肉"],
    "上海": ["小笼包", "生煎", "本帮菜"],
    "成都": ["火锅", "龙抄手", "担担面"],
    "杭州": ["西湖醋鱼", "东坡肉", "片儿川"],
    "西安": ["肉夹馍", "羊肉泡馍", "凉皮"],
    "广州": ["早茶", "肠粉", "煲仔饭"],
    "厦门": ["沙茶面", "土笋冻", "海蛎煎"],
    "三亚": ["海鲜", "清补凉", "椰子鸡"],
    "大理": ["乳扇", "饵丝", "酸辣鱼"],
}

# 人文（博物馆/美术馆/图书馆等）本地兜底，避免无高德 Key 时人文 Tab 为空
CULTURE_HINTS: dict[str, list[str]] = {
    "北京": ["中国国家博物馆", "首都博物馆", "国家图书馆", "中国美术馆"],
    "上海": ["上海博物馆", "中华艺术宫", "上海当代艺术博物馆", "上海图书馆"],
    "成都": ["成都博物馆", "金沙遗址博物馆", "四川博物院", "成都永陵博物馆"],
    "杭州": ["浙江省博物馆", "中国丝绸博物馆", "浙江美术馆", "杭州博物馆"],
    "西安": ["陕西历史博物馆", "西安博物院", "西安碑林博物馆", "西安美术馆"],
    "厦门": ["厦门市博物馆", "华侨博物院", "厦门美术馆", "陈嘉庚纪念馆"],
    "三亚": ["三亚市博物馆", "崖州古城", "大小洞天旅游区"],
    "大理": ["大理州博物馆", "喜洲古镇", "大理古城"],
    "广州": ["广东省博物馆", "广州艺术博物院", "广东美术馆", "南越王博物院"],
}


def _cache_get(city: str) -> dict[str, Any] | None:
    entry = _CITY_CACHE.get(city)
    if not entry:
        return None
    ts, data = entry
    if time.time() - ts > _CACHE_TTL_S:
        _CITY_CACHE.pop(city, None)
        return None
    return data


def _cache_set(city: str, data: dict[str, Any]) -> None:
    _CITY_CACHE[city] = (time.time(), data)


def _poi_desc(poi: Poi, fallback: str) -> str:
    parts: list[str] = []
    if poi.address:
        parts.append(poi.address[:36])
    if poi.rating:
        parts.append(f"评分 {poi.rating}")
    text = " · ".join(parts)
    return text[:50] if text else fallback


def _poi_to_item(poi: Poi, desc: str) -> dict[str, Any]:
    item: dict[str, Any] = {"name": poi.name, "desc": desc[:50]}
    item["lng"] = poi.lng
    item["lat"] = poi.lat
    if poi.address:
        item["address"] = poi.address
    return item


def _local_foods(city: str) -> list[dict[str, Any]]:
    for key, names in FOOD_HINTS.items():
        if key in city or city in key:
            return [
                {"name": n, "desc": "本地特色美食"}
                for n in names[:3]
            ]
    return [
        {"name": "当地特色菜", "desc": "本地特色美食"},
        {"name": "网红小吃", "desc": "本地人推荐"},
        {"name": "老字号", "desc": "值得尝试"},
    ]


def _local_culture(city: str) -> list[dict[str, Any]]:
    for key, names in CULTURE_HINTS.items():
        if key in city or city in key:
            return [
                {"name": n, "desc": "城市人文地标"}
                for n in names[:4]
            ]
    return [
        {"name": "城市博物馆", "desc": "了解城市历史"},
        {"name": "美术馆", "desc": "艺术人文空间"},
        {"name": "图书馆", "desc": "文化地标"},
    ]


def _fallback_from_amap(city: str) -> dict[str, Any]:
    """本地精选景点 + 高德餐饮 POI（并行），毫秒~秒级返回。"""
    city = (city or "").strip()
    spot_names = landmarks_for(city)[:4]
    spots: list[dict[str, Any]] = [
        {"name": n, "desc": f"{city}热门必去"} for n in spot_names
    ]

    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        return {
            "city": city,
            "foods": _local_foods(city),
            "spots": spots,
            "humanities": _local_culture(city),
        }

    try:
        geo = amap.geocode(city)
        city_name = geo.city or city
    except AmapError as e:
        logger.warning("get_city_info geocode failed city=%s: %s", city, e)
        return {
            "city": city,
            "foods": _local_foods(city),
            "spots": spots,
            "humanities": _local_culture(city),
        }

    def load_foods() -> list[dict[str, Any]]:
        try:
            pois = amap.search_poi_around(
                geo.location,
                POI_TYPES["meal"],
                radius=15000,
                limit=4,
                city=city_name,
            )
            return [
                _poi_to_item(p, _poi_desc(p, "本地特色美食"))
                for p in pois
                if p.name
            ][:4]
        except Exception:
            logger.exception("meal poi search failed city=%s", city)
            return []

    def load_extra_spots() -> list[dict[str, Any]]:
        if len(spots) >= 4:
            return []
        try:
            around = amap.search_poi_around(
                geo.location,
                POI_TYPES["attraction"],
                radius=20000,
                limit=8,
                city=city_name,
            )
            extra: list[dict[str, Any]] = []
            seen = {s["name"] for s in spots}
            for poi in around:
                if poi.name in seen or is_micro_poi(poi.name):
                    continue
                seen.add(poi.name)
                extra.append(
                    _poi_to_item(poi, _poi_desc(poi, f"{city_name}人气景点")),
                )
                if len(spots) + len(extra) >= 4:
                    break
            return extra
        except Exception:
            logger.exception("spot poi search failed city=%s", city)
            return []

    def load_culture() -> list[dict[str, Any]]:
        try:
            pois = amap.search_poi_around(
                geo.location,
                POI_TYPES["culture"],
                radius=20000,
                limit=8,
                city=city_name,
            )
        except Exception:
            logger.exception("culture poi search failed city=%s", city)
            return []
        items: list[dict[str, Any]] = []
        seen = {s["name"] for s in spots}
        for poi in pois:
            if not poi.name or poi.name in seen or is_micro_poi(poi.name):
                continue
            # 科教文化类 POI 混入学校/培训等噪点，按名称过滤
            if any(
                k in poi.name
                for k in ("大学", "学院", "学校", "中学", "小学", "幼儿园", "培训", "驾校")
            ):
                continue
            seen.add(poi.name)
            items.append(_poi_to_item(poi, _poi_desc(poi, f"{city_name}人文地标")))
            if len(items) >= 4:
                break
        return items

    foods: list[dict[str, Any]] = []
    culture: list[dict[str, Any]] = _local_culture(city_name)
    try:
        with ThreadPoolExecutor(max_workers=3) as pool:
            f_foods = pool.submit(load_foods)
            f_spots = pool.submit(load_extra_spots) if len(spots) < 4 else None
            f_culture = pool.submit(load_culture)
            foods = f_foods.result(timeout=5)
            if f_spots:
                spots.extend(f_spots.result(timeout=5))
            culture = f_culture.result(timeout=5) or culture
    except FuturesTimeoutError:
        logger.warning("city info amap parallel timeout city=%s", city)

    if not foods:
        foods = _local_foods(city_name)

    logger.info(
        "City info fast city=%s foods=%d spots=%d humanities=%d",
        city,
        len(foods),
        len(spots),
        len(culture),
    )
    return {
        "city": city,
        "foods": foods,
        "spots": spots,
        "humanities": culture,
    }


def city_info_stream(
    city: str,
    user: "User | None" = None,
) -> Generator[dict[str, Any], None, None]:
    """SSE：缓存或高德轻量结果，一次返回。"""
    del user  # 保留签名兼容
    city = (city or "").strip()
    if not city:
        yield {
            "type": "result",
            "data": {"city": city, "foods": [], "spots": [], "humanities": []},
        }
        return

    cached = _cache_get(city)
    if cached:
        yield {
            "type": "status",
            "phase": "cache",
            "message": f"正在打开 {city}…",
        }
        yield {"type": "result", "data": cached}
        return

    yield {
        "type": "status",
        "phase": "load",
        "message": f"正在加载 {city} 热门推荐…",
    }
    result = _fallback_from_amap(city)
    _cache_set(city, result)
    yield {"type": "result", "data": result}


def get_city_info(city: str, user: "User | None" = None) -> dict[str, Any]:
    """极速返回城市美食 + 景点 + 人文概览。"""
    del user
    city = (city or "").strip()
    if not city:
        return {"city": city, "foods": [], "spots": [], "humanities": []}

    cached = _cache_get(city)
    if cached:
        return cached

    result = _fallback_from_amap(city)
    _cache_set(city, result)
    return result


def get_place_images(
    city: str,
    name: str,
    kind: str = "",
    limit: int = 3,
) -> dict[str, Any]:
    """单地点小红书图片（列表/详情懒加载）。"""
    from app.services.xhs_image_client import fetch_xhs_images

    city = (city or "").strip()
    name = (name or "").strip()
    imgs = fetch_xhs_images(city, name, kind, limit=max(1, min(limit, 6)))
    return {
        "city": city,
        "name": name,
        "kind": kind,
        "image": imgs[0] if imgs else None,
        "images": imgs,
    }
