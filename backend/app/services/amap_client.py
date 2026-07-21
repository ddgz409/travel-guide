"""高德地图 API 客户端。

封装地理编码、POI 周边搜索、路线规划、天气查询。
文档: https://lbs.amap.com/api/webservice/guide/api/georegeo
"""
import logging
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

AMAP_BASE = "https://restapi.amap.com/v3"

# POI 类型码（高德开放平台）
# 详见 https://lbs.amap.com/api/webservice/guide/api/search
POI_TYPES = {
    "attraction": "110000",  # 风景名胜
    "meal": "050000",  # 餐饮服务
    "hotel": "100000",  # 住宿服务
}


@dataclass
class GeoResult:
    """地理编码结果。"""

    location: str  # "经度,纬度" (GCJ02)
    lng: float
    lat: float
    city: str | None = None
    adcode: str | None = None  # 区域编码，可用于天气查询


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
    rating: float | None = None  # 评分（如有）
    note: str = ""  # 额外标注（如携程酒店标签）


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


class AmapError(Exception):
    """高德 API 调用异常。"""


class AmapClient:
    """高德地图 API 客户端。"""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.AMAP_API_KEY
        self._client = httpx.Client(timeout=10.0)

    def _check(self, data: dict) -> None:
        """校验高德响应状态。"""
        status = data.get("status")
        if status != "1":
            raise AmapError(f"高德 API 错误: {data.get('info')} (infocode={data.get('infocode')})")

    def geocode(self, address: str) -> GeoResult:
        """地理编码：地址 -> 坐标 + 城市。"""
        resp = self._client.get(
            f"{AMAP_BASE}/geocode/geo",
            params={"key": self.api_key, "address": address},
        )
        resp.raise_for_status()
        data = resp.json()
        self._check(data)
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
        )

    def search_poi_around(
        self,
        location: str,
        poi_type: str,
        radius: int = 20000,
        limit: int = 30,
        city: str | None = None,
    ) -> list[Poi]:
        """周边 POI 搜索。

        location: "lng,lat"  poi_type: POI_TYPES 中的值或类型码
        """
        params = {
            "key": self.api_key,
            "location": location,
            "types": poi_type,
            "radius": radius,
            "offset": limit,
            "page": 1,
            "extensions": "all",
            "sortrule": "weight",  # 按权重排序
        }
        if city:
            params["city"] = city
        resp = self._client.get(f"{AMAP_BASE}/place/around", params=params)
        resp.raise_for_status()
        data = resp.json()
        self._check(data)
        pois: list[Poi] = []
        for p in data.get("pois") or []:
            loc = p.get("location") or ""
            if not loc:
                continue
            try:
                lng, lat = loc.split(",")
                rating = None
                biz_ext = p.get("biz_ext") or {}
                if isinstance(biz_ext, dict) and biz_ext.get("rating"):
                    try:
                        rating = float(biz_ext["rating"])
                    except (ValueError, TypeError):
                        rating = None
                pois.append(
                    Poi(
                        id=p.get("id", ""),
                        name=p.get("name", ""),
                        type=p.get("type", ""),
                        lng=float(lng),
                        lat=float(lat),
                        address=p.get("address") or "",
                        tel=p.get("tel") or "",
                        rating=rating,
                    )
                )
            except (ValueError, KeyError):
                continue
        return pois

    def search_poi_by_keyword(
        self,
        keyword: str,
        city: str | None = None,
        limit: int = 10,
        *,
        city_limit: bool = False,
        poi_type: str | None = None,
    ) -> list[Poi]:
        """关键词 POI 搜索。

        city_limit=True 时结果限制在指定城市（景点搜索框必开）。
        """
        params: dict = {
            "key": self.api_key,
            "keywords": keyword,
            "offset": limit,
            "page": 1,
            "extensions": "all",
        }
        if city:
            params["city"] = city
            if city_limit:
                params["citylimit"] = "true"
        if poi_type:
            params["types"] = poi_type
        resp = self._client.get(f"{AMAP_BASE}/place/text", params=params)
        resp.raise_for_status()
        data = resp.json()
        self._check(data)
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
                rating = None
                biz_ext = p.get("biz_ext") or {}
                if isinstance(biz_ext, dict) and biz_ext.get("rating"):
                    try:
                        rating = float(biz_ext["rating"])
                    except (ValueError, TypeError):
                        rating = None
                pois.append(
                    Poi(
                        id=p.get("id", ""),
                        name=p.get("name", ""),
                        type=p.get("type", ""),
                        lng=float(lng),
                        lat=float(lat),
                        address=p.get("address") or "",
                        tel=p.get("tel") or "",
                        rating=rating,
                    )
                )
            except (ValueError, KeyError):
                continue
        return pois

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
        params: dict = {"key": self.api_key, "origin": origin, "destination": destination}
        if mode == "transit":
            # transit 必须传 city，否则高德返回错误
            params["city"] = city or "北京"
        try:
            resp = self._client.get(f"{AMAP_BASE}{path}", params=params)
            resp.raise_for_status()
            data = resp.json()
            self._check(data)
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

    def weather(self, adcode: str) -> dict | None:
        """天气查询。返回当天天气信息，失败返回 None。"""
        try:
            resp = self._client.get(
                f"{AMAP_BASE}/weather/weatherInfo",
                params={"key": self.api_key, "city": adcode, "extensions": "base"},
            )
            resp.raise_for_status()
            data = resp.json()
            self._check(data)
            lives = data.get("lives") or []
            return lives[0] if lives else None
        except (AmapError, httpx.HTTPError) as e:
            logger.warning("天气查询失败 %s: %s", adcode, e)
            return None

    def close(self) -> None:
        self._client.close()


# 模块级单例，供服务层复用
_client: AmapClient | None = None


def get_amap_client() -> AmapClient:
    global _client
    if _client is None:
        _client = AmapClient()
    return _client
