"""城市探索服务：本地精选 + 高德轻量 POI，极速返回。

图片由客户端 /place-images 懒加载（优先高德 POI 图）；城市接口返回时也会补全 POI 封面。
"""
from __future__ import annotations

import hashlib
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError, as_completed
from collections.abc import Generator
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from app.services.amap_client import AmapError, POI_TYPES, Poi, get_amap_client
from app.services.destination_landmarks import is_micro_poi, landmarks_for
from app.services.image_quality import check_image_quality, pick_best_image

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)

_CITY_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL_S = 3600

_COVERS_DIR = Path(__file__).resolve().parents[2] / "static" / "covers"
_COVERS_DIR.mkdir(parents=True, exist_ok=True)


def _cached_cover_url(city: str, name: str, url: str) -> str | None:
    """把好图下载到 static/covers，返回稳定 URL；失败返回原 URL。"""
    if not url or not url.startswith("http"):
        return url
    try:
        safe = f"{city}_{name}".replace(" ", "_").replace("/", "_").replace("\\", "_")[:60]
        digest = hashlib.md5(url.encode("utf-8")).hexdigest()[:8]
        filename = f"{safe}_{digest}.jpg"
        path = _COVERS_DIR / filename
        if path.exists() and path.stat().st_size > 1024:
            return f"/static/covers/{filename}"
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
        content = resp.content
        if len(content) < 1024:
            return url
        path.write_bytes(content)
        return f"/static/covers/{filename}"
    except Exception:
        return url


# 本地美食（菜名，按名气排序）——美食 Tab 展示的是「菜」，不是饭店名
FOOD_HINTS: dict[str, list[str]] = {
    "北京": [
        "北京烤鸭", "涮羊肉", "炸酱面", "卤煮火烧", "炒肝",
        "驴打滚", "门钉肉饼", "糖葫芦", "豆汁儿", "老北京面茶",
    ],
    "上海": [
        "小笼包", "生煎", "葱油拌面", "红烧肉", "白斩鸡",
        "排骨年糕", "蟹壳黄", "大馄饨", "酒酿圆子", "青团",
    ],
    "成都": [
        "火锅", "担担面", "龙抄手", "串串香", "钵钵鸡",
        "夫妻肺片", "麻婆豆腐", "钟水饺", "甜水面", "三大炮",
    ],
    "杭州": [
        "西湖醋鱼", "东坡肉", "龙井虾仁", "叫花鸡", "片儿川",
        "宋嫂鱼羹", "葱包桧", "定胜糕", "猫耳朵", "西湖藕粉",
    ],
    "西安": [
        "肉夹馍", "羊肉泡馍", "凉皮", "Biangbiang面", "臊子面",
        "甑糕", "葫芦头", "灌汤包", "镜糕", "油泼面",
    ],
    "广州": [
        "早茶", "肠粉", "煲仔饭", "白切鸡", "烧鹅",
        "云吞面", "艇仔粥", "萝卜牛杂", "双皮奶", "叉烧",
    ],
    "厦门": [
        "沙茶面", "海蛎煎", "土笋冻", "姜母鸭", "花生汤",
        "面线糊", "五香卷", "烧肉粽", "鱼丸汤", "闽南薄饼",
    ],
    "三亚": [
        "海鲜大餐", "椰子鸡", "清补凉", "文昌鸡", "抱罗粉",
        "海南粉", "和乐蟹", "东山羊", "芒果肠粉", "陵水酸粉",
    ],
    "大理": [
        "乳扇", "饵丝", "酸辣鱼", "大理砂锅鱼", "喜洲粑粑",
        "豌豆粉", "凉鸡米线", "烧饵块", "雕梅", "诺邓火腿",
    ],
}

# 人文（博物馆/美术馆/图书馆等，按名气排序）本地兜底，避免无高德 Key 时人文 Tab 为空
CULTURE_HINTS: dict[str, list[str]] = {
    "北京": [
        "首都博物馆", "国家图书馆", "中国美术馆", "中国科学技术馆",
        "北京鲁迅博物馆", "中华世纪坛", "老舍纪念馆", "国家大剧院",
    ],
    "上海": [
        "中华艺术宫", "上海当代艺术博物馆", "上海科技馆", "上海历史博物馆",
        "上海图书馆", "刘海粟美术馆", "西岸美术馆", "上海电影博物馆",
    ],
    "成都": [
        "成都博物馆", "金沙遗址博物馆", "四川博物院", "四川美术馆",
        "成都永陵博物馆", "成都图书馆", "东郊记忆", "成都当代美术馆",
    ],
    "杭州": [
        "浙江省博物馆", "中国丝绸博物馆", "浙江美术馆", "杭州博物馆",
        "中国茶叶博物馆", "良渚博物院", "杭州工艺美术博物馆", "浙江图书馆",
    ],
    "西安": [
        "西安博物院", "西安碑林博物馆", "陕西考古博物馆", "西安美术馆",
        "大唐西市博物馆", "大明宫遗址博物馆", "西安曲江艺术博物馆", "西安图书馆",
    ],
    "厦门": [
        "厦门市博物馆", "华侨博物院", "厦门科技馆", "厦门美术馆",
        "陈嘉庚纪念馆", "厦门文化馆",
    ],
    "三亚": [
        "三亚市博物馆", "崖州古城", "大小洞天旅游区", "南山文化旅游区",
    ],
    "大理": [
        "大理州博物馆", "周城扎染", "云南提督府旧址", "大理图书馆",
        "凤阳邑古村", "巍山古城",
    ],
    "广州": [
        "广东省博物馆", "广州艺术博物院", "广东美术馆", "南越王博物院",
        "广州图书馆", "广州大剧院",
    ],
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
    if poi.id:
        item["poi_id"] = poi.id
    if poi.address:
        item["address"] = poi.address
    if poi.photos:
        item["image"] = poi.photos[0]
        item["images"] = poi.photos[:3]
    return item


def _enrich_items_with_photos(
    items: list[dict[str, Any]],
    city: str,
    kind: str,
    *,
    max_items: int = 4,
) -> list[dict[str, Any]]:
    """为缺少封面的条目串行补全高德 POI 实景图（避免 QPS 超限）。"""
    if not items:
        return items
    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        return items

    poi_type = POI_TYPES.get("meal") if kind == "foods" else POI_TYPES.get("attraction")
    out = [dict(it) for it in items]
    count = 0
    for idx, it in enumerate(out):
        if count >= max_items:
            break
        if it.get("image") or not (it.get("name") or "").strip():
            continue
        name = str(it.get("name") or "").strip()
        photos = amap.get_poi_photos(
            poi_id=str(it.get("poi_id") or "").strip() or None,
            keyword=name,
            city=city,
            poi_type=poi_type,
            limit=3,
        )
        if photos:
            out[idx]["image"] = photos[0]
            out[idx]["images"] = photos[:3]
        count += 1
        time.sleep(0.15)
    return out


def _local_foods(city: str) -> list[dict[str, Any]]:
    for key, names in FOOD_HINTS.items():
        if key in city or city in key:
            return [
                {"name": n, "desc": "当地特色美食"}
                for n in names
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
                for n in names
            ]
    return [
        {"name": "城市博物馆", "desc": "了解城市历史"},
        {"name": "美术馆", "desc": "艺术人文空间"},
        {"name": "图书馆", "desc": "文化地标"},
    ]


def _fallback_from_amap(city: str) -> dict[str, Any]:
    """本地精选景点/美食/人文（按名气排序）+ 高德景点/人文补充，毫秒~秒级返回。"""
    city = (city or "").strip()
    # 本地精选库已按名气排序，全量返回（北京等热门城市 10+ 条）
    spot_names = landmarks_for(city)
    spots: list[dict[str, Any]] = [
        {"name": n, "desc": f"{city}热门必去"} for n in spot_names
    ]
    foods = _local_foods(city)
    culture = _local_culture(city)

    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        return {
            "city": city,
            "foods": foods,
            "spots": spots,
            "humanities": culture,
        }

    try:
        geo = amap.geocode(city)
        city_name = geo.city or city
    except AmapError as e:
        logger.warning("get_city_info geocode failed city=%s: %s", city, e)
        return {
            "city": city,
            "foods": foods,
            "spots": spots,
            "humanities": culture,
        }

    def load_extra_spots() -> list[dict[str, Any]]:
        # 本地精选不足 8 条时，用高德风景名胜补足
        if len(spots) >= 8:
            return []
        try:
            around = amap.search_poi_around(
                geo.location,
                POI_TYPES["attraction"],
                radius=20000,
                limit=12,
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
                if len(spots) + len(extra) >= 8:
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
                limit=12,
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
            if len(items) >= 10:
                break
        return items

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            f_spots = pool.submit(load_extra_spots) if len(spots) < 8 else None
            f_culture = pool.submit(load_culture)
            if f_spots:
                spots.extend(f_spots.result(timeout=5))
            culture = f_culture.result(timeout=5) or culture
    except FuturesTimeoutError:
        logger.warning("city info amap parallel timeout city=%s", city)

    if not foods:
        foods = _local_foods(city_name)

    spots = _enrich_items_with_photos(spots, city_name, "spots")
    foods = _enrich_items_with_photos(foods, city_name, "foods")

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
    poi_id: str = "",
) -> dict[str, Any]:
    """单地点图片：仅高德 POI 实景图，质量检测过滤黑图/纯色。"""
    city = (city or "").strip()
    name = (name or "").strip()
    limit = max(1, min(limit, 6))
    poi_type = POI_TYPES.get("meal") if kind == "foods" else POI_TYPES.get("attraction") if kind == "spots" else None

    good_url: str | None = None
    source: str | None = None
    amap = get_amap_client()

    try:
        if (amap.api_key or "").strip():
            # 多拿几张，逐个质量检测
            raw = amap.get_poi_photos(
                poi_id=poi_id.strip() or None,
                keyword=name,
                city=city or None,
                poi_type=poi_type,
                limit=max(limit, 6),
            )
            good_url = pick_best_image(raw)
            # 未指定类型且未命中时，退一步用景点类型再搜一次，
            # 否则部分 POI 关键词搜索拿不到照片（收藏夹地点多为景点）
            if not good_url and poi_type is None:
                raw = amap.get_poi_photos(
                    poi_id=poi_id.strip() or None,
                    keyword=name,
                    city=city or None,
                    poi_type=POI_TYPES["attraction"],
                    limit=max(limit, 6),
                )
                good_url = pick_best_image(raw)
            if good_url:
                source = "amap"
    except Exception:
        logger.exception("amap place images failed city=%s name=%s", city, name)

    cached_url = _cached_cover_url(city, name, good_url) if good_url else None

    return {
        "city": city,
        "name": name,
        "kind": kind,
        "image": cached_url,
        "images": [cached_url] if cached_url else [],
        "source": source,
    }


def get_city_covers(pairs: list[dict[str, str]]) -> dict[str, str | None]:
    """批量拉取热门城市代表景点封面（串行 + 缓存，避免高德 QPS 超限）。"""
    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        return {}
    out: dict[str, str | None] = {}
    for row in pairs:
        city = (row.get("city") or "").strip()
        landmark = (row.get("landmark") or city).strip()
        if not city:
            continue
        try:
            photos = amap.get_poi_photos(
                keyword=landmark,
                city=city,
                poi_type=POI_TYPES["attraction"],
                limit=6,
            )
            good = pick_best_image(photos)
            out[city] = _cached_cover_url(city, landmark, good) if good else None
        except Exception:
            logger.exception("city cover failed city=%s landmark=%s", city, landmark)
            out[city] = None
        time.sleep(0.35)
    return out
