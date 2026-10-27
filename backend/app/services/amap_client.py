"""高德地图 API 客户端。

封装地理编码、POI 周边搜索、路线规划、天气查询。
文档: https://lbs.amap.com/api/webservice/guide/api/georegeo
"""
from __future__ import annotations

import logging
import threading
import time as _time
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

AMAP_BASE = "https://restapi.amap.com/v3"
AMAP_MIN_INTERVAL_S = 0.35
_amap_throttle_lock = threading.Lock()
_amap_last_call = 0.0


def _amap_throttle() -> None:
    global _amap_last_call
    with _amap_throttle_lock:
        now = _time.time()
        gap = AMAP_MIN_INTERVAL_S - (now - _amap_last_call)
        if gap > 0:
            _time.sleep(gap)
        _amap_last_call = _time.time()


def _is_qps_error(exc: Exception) -> bool:
    msg = str(exc).upper()
    return "CUQPS" in msg or "10021" in msg or "EXCEEDED" in msg


def _is_key_switch_error(exc: Exception) -> bool:
    """日配额 / QPS / Key 无效 → 换下一个 Key 重试。"""
    msg = str(exc).upper()
    if _is_qps_error(exc):
        return True
    for token in (
        "USER_DAILY_QUERY_OVER_LIMIT",
        "10044",
        "DAILY_QUERY_OVER_LIMIT",
        "INVALID_USER_KEY",
        "10001",
        "USERKEY_PLAT_NOMATCH",
        "10009",
    ):
        if token in msg:
            return True
    return False


_key_pool_lock = threading.Lock()
# Key 冷却至该时间戳后可重试（日配额约 1h 后恢复；无效 Key 冷却 7 天）
_exhausted_until: dict[str, float] = {}


def _exhaust_cooldown_s(reason: str) -> float:
    msg = str(reason).upper()
    if "INVALID_USER_KEY" in msg or "10001" in msg or "USERKEY" in msg:
        return 86400.0 * 7
    if "DAILY" in msg or "10044" in msg or "OVER_LIMIT" in msg:
        return 3600.0
    if _is_qps_error(Exception(reason)):
        return 120.0
    return 1800.0


def _purge_exhausted_keys() -> None:
    now = _time.time()
    expired = [k for k, until in _exhausted_until.items() if now >= until]
    for k in expired:
        _exhausted_until.pop(k, None)


def _mask_key(key: str) -> str:
    k = (key or "").strip()
    if len(k) <= 8:
        return "***"
    return f"...{k[-8:]}"


def _mark_key_exhausted(key: str, reason: str) -> None:
    cooldown = _exhaust_cooldown_s(reason)
    until = _time.time() + cooldown
    with _key_pool_lock:
        prev = _exhausted_until.get(key, 0.0)
        if until <= prev:
            return
        _exhausted_until[key] = until
        logger.warning(
            "高德 Key %s 暂不可用（%s），%.0f 分钟后重试",
            _mask_key(key),
            reason,
            cooldown / 60.0,
        )


def _active_amap_keys(override: list[str] | None = None) -> list[str]:
    keys = override if override is not None else settings.amap_api_keys
    with _key_pool_lock:
        _purge_exhausted_keys()
        return [k for k in keys if k and k not in _exhausted_until]

# POI 类型码（高德开放平台）
# 详见 https://lbs.amap.com/api/webservice/guide/api/search
POI_TYPES = {
    "attraction": "110000",  # 风景名胜
    "meal": "050000",  # 餐饮服务
    "hotel": "100000",  # 住宿服务
    # 人文：博物馆 / 展览馆 / 美术馆 / 图书馆 / 文化馆
    "culture": "140100,140200,140400,140500,140600",
}


@dataclass
class GeoResult:
    """地理编码结果。"""

    location: str  # "经度,纬度" (GCJ02)
    lng: float
    lat: float
    city: str | None = None
    adcode: str | None = None  # 区域编码，可用于天气查询
    formatted: str | None = None
    district: str | None = None  # 区县名（县级市时 city 为州名/空，靠它匹配）
    level: str | None = None


def _normalize_photo_url(url: str) -> str | None:
    u = (url or "").strip()
    if not u:
        return None
    if u.startswith("//"):
        u = "https:" + u
    if u.startswith("http://"):
        u = "https://" + u[7:]
    if not u.startswith("https://"):
        return None
    return u


def _parse_photos(raw: object, limit: int = 6) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        u = _normalize_photo_url(str(item.get("url") or ""))
        if u and u not in out:
            out.append(u)
        if len(out) >= limit:
            break
    return out


def _poi_name_score(poi_name: str, keyword: str) -> int:
    """名称匹配分：精确 > 互相包含 > 去常见后缀后相等。用于避免「故宫」命中「天坛」。"""
    a = (poi_name or "").strip()
    b = (keyword or "").strip()
    if not a or not b:
        return 0
    if a == b:
        return 100
    if b in a:
        return 90
    if a in b:
        return 80
    # 去掉「景区/风景区/博物院」等后缀再比
    suffixes = ("风景名胜区", "旅游区", "风景区", "博物院", "博物馆", "公园", "景区", "景点")
    def strip_suf(s: str) -> str:
        for suf in suffixes:
            if s.endswith(suf) and len(s) > len(suf):
                return s[: -len(suf)]
        return s
    aa, bb = strip_suf(a), strip_suf(b)
    if aa and bb and (aa == bb or bb in aa or aa in bb):
        return 70
    return 0


def _pick_best_poi(pois: list[Poi], keyword: str) -> Poi | None:
    """从搜索结果里挑名称最贴近关键词、且尽量有图的 POI。"""
    if not pois:
        return None
    scored: list[tuple[int, int, Poi]] = []
    for p in pois:
        score = _poi_name_score(p.name, keyword)
        has_photo = 1 if p.photos else 0
        scored.append((score, has_photo, p))
    # 先比名称分，再比有无图
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    best_score, _, best = scored[0]
    if best_score > 0:
        return best
    # 名称都对不上时：优先有图的第一条（比瞎用第 0 条稍好）
    with_photos = [p for p in pois if p.photos]
    return with_photos[0] if with_photos else pois[0]


@dataclass
class Poi:
    """POI 搜索结果。"""

    id: str
    name: str
    type: str
    lng: float
    lat: float
    address: str
    tel: str = ""
    opentime: str = ""
    rating: float | None = None  # 评分（如有）
    note: str = ""  # 额外标注（如携程酒店标签）
    photos: list[str] | None = None  # extensions=all 时的高德实景图


@dataclass
class RouteSegment:
    """两点间路线规划结果。"""

    distance_m: int  # 距离（米）
    duration_s: int  # 时间（秒）
    mode: str  # driving / walking / transit
    detail: list[dict] | None = None  # 换乘详情（仅 transit）
    schemes: list[dict] | None = None  # 多套公交方案（transit）
    polyline: list[list[float]] | None = None  # [[lng, lat], ...] 供前端画线


def _parse_polyline(raw: str | None, limit: int = 800) -> list[list[float]]:
    """解析高德 polyline 字符串为坐标列表。"""
    if not raw or not isinstance(raw, str):
        return []
    pts: list[list[float]] = []
    # 部分接口用 _ 分隔
    for part in raw.replace("_", ";").split(";"):
        part = part.strip()
        if "," not in part:
            continue
        try:
            lng_s, lat_s = part.split(",", 1)
            pts.append([float(lng_s), float(lat_s)])
        except ValueError:
            continue
    if len(pts) <= limit:
        return pts
    # 过密时等距抽样，保留首尾
    step = max(1, len(pts) // limit)
    sampled = pts[::step]
    if sampled[-1] != pts[-1]:
        sampled.append(pts[-1])
    return sampled[:limit]


def _collect_step_polylines(steps: list | None) -> list[list[float]]:
    pts: list[list[float]] = []
    for step in steps or []:
        if not isinstance(step, dict):
            continue
        pts.extend(_parse_polyline(step.get("polyline")))
    return pts


def _parse_biz_ext(biz_ext: object) -> tuple[float | None, str]:
    rating = None
    opentime = ""
    if isinstance(biz_ext, dict):
        if biz_ext.get("rating"):
            try:
                rating = float(biz_ext["rating"])
            except (ValueError, TypeError):
                rating = None
        for key in ("open_time", "opentime", "open_time2", "opentime2"):
            raw = biz_ext.get(key)
            if raw and str(raw).strip() not in ("", "[]"):
                opentime = str(raw).strip()
                break
    return rating, opentime


class AmapError(Exception):
    """高德 API 调用异常。"""


class AmapClient:
    """高德地图 API 客户端。"""

    def __init__(self, api_key: str | None = None) -> None:
        self._keys_override: list[str] | None = [api_key.strip()] if api_key else None
        self._client = httpx.Client(timeout=10.0)

    @property
    def api_key(self) -> str:
        keys = _active_amap_keys(self._keys_override)
        return keys[0] if keys else ""

    def _check(self, data: dict) -> None:
        """校验高德响应状态。"""
        status = data.get("status")
        if status != "1":
            raise AmapError(f"高德 API 错误: {data.get('info')} (infocode={data.get('infocode')})")

    def _get_json(self, url: str, params: dict, *, retries: int = 2) -> dict:
        """带节流 + 多 Key 自动切换的 GET JSON。"""
        keys = _active_amap_keys(self._keys_override)
        if not keys:
            raise AmapError("未配置可用的高德 API Key")

        last_err: Exception | None = None
        for key in keys:
            p = {**params, "key": key}
            for attempt in range(retries):
                _amap_throttle()
                try:
                    resp = self._client.get(url, params=p)
                    resp.raise_for_status()
                    data = resp.json()
                    self._check(data)
                    return data
                except AmapError as e:
                    last_err = e
                    if _is_key_switch_error(e):
                        _mark_key_exhausted(key, str(e))
                        break
                    if attempt < retries - 1 and _is_qps_error(e):
                        _time.sleep(1.0 * (attempt + 1))
                        continue
                    raise
                except httpx.HTTPError as e:
                    last_err = e
                    if attempt < retries - 1:
                        _time.sleep(0.6)
                        continue
                    raise
        raise AmapError(str(last_err or "所有高德 API Key 均不可用"))

    def geocode(self, address: str) -> GeoResult:
        """地理编码：地址 -> 坐标 + 城市。"""
        data = self._get_json(f"{AMAP_BASE}/geocode/geo", {"address": address})
        geocodes = data.get("geocodes") or []
        if not geocodes:
            raise AmapError(f"无法解析地址: {address}")
        g = geocodes[0]
        loc = g["location"]  # "lng,lat"
        lng, lat = loc.split(",")
        return GeoResult(
            location=loc,
            lng=float(lng),
            lat=float(lat),
            city=g.get("city") or None,
            adcode=g.get("adcode") or None,
            # 注意：高德返回字段是 formatted_address（不是 formatted）
            formatted=g.get("formatted_address") or None,
            district=(g.get("district") or None) if isinstance(g.get("district"), str) else None,
            level=g.get("level") or None,
        )

    def search_poi_around(
        self,
        location: str,
        poi_type: str | None = None,
        radius: int = 20000,
        limit: int = 30,
        city: str | None = None,
        keywords: str | None = None,
        *,
        sortrule: str = "distance",
    ) -> list[Poi]:
        """周边 POI 搜索。

        location: "lng,lat"；keywords 与 poi_type 至少传一个。
        """
        if not poi_type and not keywords:
            raise ValueError("search_poi_around requires keywords or poi_type")
        params = {
            "location": location,
            "radius": radius,
            "offset": min(limit, 25),
            "page": 1,
            "extensions": "all",
            "sortrule": sortrule,
        }
        if poi_type:
            params["types"] = poi_type
        if keywords:
            params["keywords"] = keywords
        if city:
            params["city"] = city
        data = self._get_json(f"{AMAP_BASE}/place/around", params)
        pois: list[Poi] = []
        for p in data.get("pois") or []:
            loc = p.get("location") or ""
            if not loc:
                continue
            try:
                lng, lat = loc.split(",")
                rating, opentime = _parse_biz_ext(p.get("biz_ext") or {})
                pois.append(
                    Poi(
                        id=p.get("id", ""),
                        name=p.get("name", ""),
                        type=p.get("type", ""),
                        lng=float(lng),
                        lat=float(lat),
                        address=p.get("address") or "",
                        tel=p.get("tel") or "",
                        opentime=opentime,
                        rating=rating,
                        photos=_parse_photos(p.get("photos")),
                    )
                )
            except (ValueError, KeyError):
                continue
        return pois

    def search_poi_ranked(
        self,
        city: str,
        poi_type: str,
        *,
        limit: int = 12,
        location: str | None = None,
        radius: int = 50000,
    ) -> list[Poi]:
        """按高德综合权重（weight）拉取城市 POI。

        扫街榜/状元榜暂无公开 Web API；优先 citylimit 全城 text 搜索（综合权重），
        不足时再绕市中心 around + weight 补充。
        """
        city_key = (city or "").strip()
        if not city_key:
            return []

        pois: list[Poi] = []
        seen: set[str] = set()

        def _append_raw(raw: list[Poi]) -> None:
            for p in raw:
                key = (p.name or "").strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                pois.append(p)
                if len(pois) >= limit * 2:
                    return

        kw = "特色餐厅|老字号" if poi_type == POI_TYPES["meal"] else "旅游景点|风景名胜"

        # 1) 关键词 + 类型 + 城市限制（综合权重排序）
        try:
            _append_raw(
                self.search_poi_by_keyword(
                    kw,
                    city=city_key,
                    limit=limit * 2,
                    city_limit=True,
                    poi_type=poi_type,
                ),
            )
        except (AmapError, ValueError) as e:
            logger.warning("ranked poi keyword failed city=%s type=%s: %s", city_key, poi_type, e)

        # 2) 仍不足：全城 types 检索
        if len(pois) < limit:
            try:
                params: dict = {
                    "types": poi_type,
                    "city": city_key,
                    "citylimit": "true",
                    "offset": min(limit * 2, 25),
                    "page": 1,
                    "extensions": "all",
                }
                data = self._get_json(f"{AMAP_BASE}/place/text", params)
                batch: list[Poi] = []
                for p in data.get("pois") or []:
                    loc = p.get("location") or ""
                    if not loc:
                        continue
                    try:
                        lng, lat = loc.split(",")
                        rating, opentime = _parse_biz_ext(p.get("biz_ext") or {})
                        batch.append(
                            Poi(
                                id=p.get("id", ""),
                                name=p.get("name", ""),
                                type=p.get("type", ""),
                                lng=float(lng),
                                lat=float(lat),
                                address=p.get("address") or "",
                                tel=p.get("tel") or "",
                                opentime=opentime,
                                rating=rating,
                                photos=_parse_photos(p.get("photos")),
                            ),
                        )
                    except (ValueError, KeyError):
                        continue
                _append_raw(batch)
            except (AmapError, httpx.HTTPError) as e:
                logger.warning("ranked poi text failed city=%s type=%s: %s", city_key, poi_type, e)

        # 过滤子 POI（如「故宫博物院-中和殿」），按评分排序
        filtered: list[Poi] = []
        for p in pois:
            name = (p.name or "").strip()
            if not name:
                continue
            if "-" in name and _poi_name_score(name.split("-")[0], name) < 70:
                continue
            filtered.append(p)
        filtered.sort(key=lambda p: (-float(p.rating or 0), len(p.name)))
        return filtered[:limit]

    def search_poi_by_keyword(
        self,
        keyword: str,
        city: str | None = None,
        limit: int = 10,
        *,
        page: int = 1,
        city_limit: bool = False,
        poi_type: str | None = None,
        location_center: str | None = None,
    ) -> list[Poi]:
        """关键词 POI 搜索。

        city_limit=True 时结果限制在指定城市（景点搜索框必开）。
        location_center: "lng,lat"，有则按距离排序（添加足迹等场景）。
        """
        params: dict = {
            "keywords": keyword,
            "offset": min(limit, 25),
            "page": max(1, page),
            "extensions": "all",
        }
        if city:
            params["city"] = city
            if city_limit:
                params["citylimit"] = "true"
        if location_center:
            params["location"] = location_center
            params["sortrule"] = "distance"
        if poi_type:
            params["types"] = poi_type
        data = self._get_json(f"{AMAP_BASE}/place/text", params)
        pois: list[Poi] = []
        city_key = (city or "").strip()
        for p in data.get("pois") or []:
            loc = p.get("location") or ""
            if not loc:
                continue
            # 有城市限制时再按 cityname / 地址过滤一遍，避免串城
            if city_key and city_limit:
                cityname = str(p.get("cityname") or "")
                address = str(p.get("address") or "")
                pname = str(p.get("pname") or "")
                blob = f"{cityname}{address}{pname}{p.get('name') or ''}"
                if city_key not in blob and not any(
                    city_key.startswith(c) or c.startswith(city_key)
                    for c in (cityname, pname)
                    if c
                ):
                    # cityname 为空时放行（部分 POI 不带城市字段）
                    if cityname or pname:
                        continue
            try:
                lng, lat = loc.split(",")
                rating, opentime = _parse_biz_ext(p.get("biz_ext") or {})
                pois.append(
                    Poi(
                        id=p.get("id", ""),
                        name=p.get("name", ""),
                        type=p.get("type", ""),
                        lng=float(lng),
                        lat=float(lat),
                        address=p.get("address") or "",
                        tel=p.get("tel") or "",
                        opentime=opentime,
                        rating=rating,
                        photos=_parse_photos(p.get("photos")),
                    )
                )
            except (ValueError, KeyError):
                continue
        return pois

    def get_poi_photos(
        self,
        *,
        poi_id: str | None = None,
        keyword: str | None = None,
        city: str | None = None,
        poi_type: str | None = None,
        limit: int = 3,
    ) -> list[str]:
        """按 POI ID 或「城市+名称」拉取高德实景图（extensions=all）。"""
        limit = max(1, min(limit, 6))
        pid = (poi_id or "").strip()
        kw = (keyword or "").strip()
        # v2：名称匹配 + 主图优先；旧缓存键失效
        cache_key = f"v2|{pid}|{city or ''}|{kw}|{poi_type or ''}|{limit}"
        cached = _photo_cache.get(cache_key)
        if cached is not None:
            return cached[:limit]

        photos: list[str] = []
        if pid:
            try:
                data = self._get_json(
                    f"{AMAP_BASE}/place/detail",
                    {"id": pid, "extensions": "all"},
                )
                for p in data.get("pois") or []:
                    photos = _parse_photos(p.get("photos"), limit)
                    if photos:
                        break
            except (AmapError, httpx.HTTPError) as e:
                logger.warning("poi detail photos failed id=%s: %s", pid, e)

        if not photos and kw:
            try:
                # 多取几条，按名称匹配正确 POI，再取该 POI 主图（photos[0]）
                pois = self.search_poi_by_keyword(
                    kw,
                    city=city,
                    limit=8,
                    city_limit=bool(city),
                    poi_type=poi_type,
                )
                best = _pick_best_poi(pois, kw)
                if best and best.photos:
                    photos = best.photos[:limit]
                elif best and best.id and best.id != pid:
                    photos = self.get_poi_photos(poi_id=best.id, limit=limit)
            except (AmapError, httpx.HTTPError, ValueError) as e:
                logger.warning("poi photo search failed kw=%s city=%s: %s", kw, city, e)

        # 仅缓存成功结果；空列表不缓存，避免 Key 冷却期间误伤后续请求
        if photos:
            _photo_cache[cache_key] = photos
        return photos[:limit]

    def plan_route(
        self, origin: str, destination: str, mode: str = "walking",
        city: str | None = None,
    ) -> RouteSegment | None:
        """路线规划。

        origin/destination: "lng,lat"  mode: driving / walking / transit
        transit 模式需要 city 参数（城市名或 adcode）。
        返回 None 表示规划失败。
        """
        path_map = {
            "driving": "/direction/driving",
            "walking": "/direction/walking",
            "transit": "/direction/transit/integrated",
        }
        path = path_map.get(mode)
        if not path:
            return None
        params: dict = {"origin": origin, "destination": destination}
        if mode == "transit":
            # transit 必须传 city，否则高德返回错误
            params["city"] = city or "北京"
        try:
            data = self._get_json(f"{AMAP_BASE}{path}", params)
            route = data.get("route") or {}
            if mode == "transit":
                # 公交/地铁：返回多条候选方案
                transits = route.get("transits") or []
                if not transits:
                    return None
                schemes: list[dict] = []
                for t in transits[:3]:
                    detail: list[dict] = []
                    poly: list[list[float]] = []
                    for seg in t.get("segments") or []:
                        walking = seg.get("walking") or {}
                        walk_steps = walking.get("steps") or []
                        poly.extend(_collect_step_polylines(walk_steps))
                        if not walk_steps and walking.get("polyline"):
                            poly.extend(_parse_polyline(walking.get("polyline")))
                        if walk_steps:
                            walk_instruction = walk_steps[0].get("instruction", "")
                            walk_dist = sum(int(s.get("distance", 0) or 0) for s in walk_steps)
                            detail.append({
                                "type": "walk",
                                "instruction": (walk_instruction[:100] if walk_instruction else f"步行{walk_dist}米"),
                                "distance_m": walk_dist,
                            })
                        bus = seg.get("bus") or {}
                        for bl in bus.get("buslines") or []:
                            via_stops = bl.get("via_stops") or []
                            poly.extend(_parse_polyline(bl.get("polyline")))
                            detail.append({
                                "type": "bus",
                                "line_name": bl.get("name", ""),
                                "line_type": bl.get("type", ""),
                                "departure_stop": (bl.get("departure_stop") or {}).get("name", ""),
                                "arrival_stop": (bl.get("arrival_stop") or {}).get("name", ""),
                                "via_stops": len(via_stops),
                            })
                    if len(poly) > 800:
                        step = max(1, len(poly) // 800)
                        poly = poly[::step]
                    schemes.append({
                        "distance_m": int(t.get("distance", 0) or 0),
                        "duration_s": int(t.get("duration", 0) or 0),
                        "cost": float(t.get("cost") or 0) if str(t.get("cost") or "").replace(".", "").isdigit() else 0,
                        "walking_distance_m": int(t.get("walking_distance", 0) or 0),
                        "detail": detail,
                        "polyline": poly,
                    })
                best = schemes[0]
                return RouteSegment(
                    distance_m=best["distance_m"],
                    duration_s=best["duration_s"],
                    mode=mode,
                    detail=best["detail"] or None,
                    schemes=schemes,
                    polyline=best.get("polyline") or None,
                )
            # 步行/驾车：路径在 route.paths 里
            paths = route.get("paths") or []
            if not paths:
                return None
            p = paths[0]
            detail = []
            poly = _collect_step_polylines(p.get("steps") or [])
            if not poly and p.get("polyline"):
                poly = _parse_polyline(p.get("polyline"))
            for step in (p.get("steps") or [])[:12]:
                detail.append({
                    "type": "walk" if mode == "walking" else "drive",
                    "instruction": (step.get("instruction") or "")[:120],
                    "distance_m": int(step.get("distance", 0) or 0),
                    "road": step.get("road") or "",
                })
            return RouteSegment(
                distance_m=int(p.get("distance", 0)),
                duration_s=int(p.get("duration", 0)),
                mode=mode,
                detail=detail or None,
                polyline=poly or None,
            )
        except (AmapError, httpx.HTTPError, ValueError) as e:
            logger.warning("路线规划失败 %s -> %s (%s): %s", origin, destination, mode, e)
            return None

    def regeo(self, lng: float, lat: float) -> dict:
        """逆地理编码：坐标 -> 城市/省份。

        返回 {"city": "...", "province": "...", "adcode": "..."}。
        失败时抛出 AmapError。
        """
        data = self._get_json(
            f"{AMAP_BASE}/geocode/regeo",
            {"location": f"{lng},{lat}"},
        )
        regeocode = data.get("regeocode") or {}
        comp = regeocode.get("addressComponent") or {}
        city = comp.get("city") or ""
        province = comp.get("province") or ""
        adcode = comp.get("adcode") or ""
        # 直辖市 city 可能为空数组 []，取 province
        if isinstance(city, list) or not city:
            city = province if province else ""
        if isinstance(province, list):
            province = ""
        return {"city": str(city), "province": str(province), "adcode": str(adcode)}

    def weather(self, adcode: str) -> dict | None:
        """天气查询。返回当天天气信息，失败返回 None。"""
        try:
            data = self._get_json(
                f"{AMAP_BASE}/weather/weatherInfo",
                {"city": adcode, "extensions": "base"},
            )
            lives = data.get("lives") or []
            return lives[0] if lives else None
        except (AmapError, httpx.HTTPError) as e:
            logger.warning("天气查询失败 %s: %s", adcode, e)
            return None

    def close(self) -> None:
        self._client.close()


# 模块级单例，供服务层复用
_client: AmapClient | None = None
_photo_cache: dict[str, list[str]] = {}


def get_amap_client() -> AmapClient:
    global _client
    if _client is None:
        _client = AmapClient()
    return _client
