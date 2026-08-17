"""城市探索路由：城市信息搜索 + 逆地理编码。"""
from __future__ import annotations

import json
import logging
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse

from app.core.deps import get_optional_user
from app.models import User
from app.services.amap_client import AmapError, get_amap_client
from app.services.destination_service import (
    city_info_stream,
    get_city_covers,
    get_city_info,
    get_place_images,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/destinations", tags=["城市探索"])

_ALLOWED_IMG_HOSTS = ("store.is.autonavi.com", "aos-cdn-image.amap.com", "img.alicdn.com")


def _allowed_image_url(url: str) -> bool:
    parsed = urlparse(url.strip())
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    host = parsed.netloc.lower()
    if host in _ALLOWED_IMG_HOSTS:
        return True
    return host.endswith(".autonavi.com") or host.endswith(".amap.com")


@router.get("/info")
def city_info(
    city: str = Query(..., min_length=1, max_length=128),
    user: User | None = Depends(get_optional_user),
):
    """联网搜索城市特色美食和热门景点，返回结构化 JSON。

    游客用服务器默认 Key，登录用户用自己的 Key。
    无有效数据时 foods/spots 为空数组。
    """
    result = get_city_info(city.strip(), user)
    return result


@router.get("/info-stream")
def city_info_stream_endpoint(
    city: str = Query(..., min_length=1, max_length=128),
    user: User | None = Depends(get_optional_user),
):
    """SSE 流式搜索城市真实信息：进度、LLM 预览、最终结果。"""

    def generate():
        try:
            for chunk in city_info_stream(city.strip(), user):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("City info stream error")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/place-images")
def place_images(
    city: str = Query(..., min_length=1, max_length=128),
    name: str = Query(..., min_length=1, max_length=128),
    kind: str = Query("", pattern="^(|foods|spots)$"),
    limit: int = Query(3, ge=1, le=6),
    poi_id: str = Query("", max_length=64),
):
    """地点封面图：优先高德 POI 实景图，必要时回退小红书。"""
    return get_place_images(city.strip(), name.strip(), kind, limit, poi_id)


@router.get("/img")
def proxy_place_image(
    url: str = Query(..., min_length=12, max_length=512),
):
    """代理高德 POI 图片，避免 App 直连 autonavi CDN 失败。"""
    parsed = urlparse(url.strip())
    if not _allowed_image_url(url):
        raise HTTPException(status_code=400, detail="不允许的图片地址")
    try:
        with httpx.Client(timeout=12.0, follow_redirects=True) as client:
            resp = client.get(url.strip())
            resp.raise_for_status()
            ctype = resp.headers.get("content-type") or "image/jpeg"
            return Response(
                content=resp.content,
                media_type=ctype,
                headers={"Cache-Control": "public, max-age=86400"},
            )
    except httpx.HTTPError as e:
        logger.warning("proxy image failed url=%s: %s", url[:80], e)
        raise HTTPException(status_code=502, detail="图片加载失败") from e


@router.post("/city-covers")
def city_covers(body: list[dict[str, str]]):
    """批量城市封面：[{city, landmark}, ...]，高德 POI 图。"""
    if len(body) > 12:
        body = body[:12]
    covers = get_city_covers(body)
    return {"covers": covers}


@router.get("/regeo")
def regeo(
    lng: float = Query(..., description="经度"),
    lat: float = Query(..., description="纬度"),
):
    """逆地理编码：经纬度 -> 城市名。

    用于首页「当前定位城市」卡片。
    """
    try:
        client = get_amap_client()
        return client.regeo(lng, lat)
    except AmapError as e:
        logger.warning("regeo failed lng=%s lat=%s: %s", lng, lat, e)
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.exception("regeo unexpected error")
        raise HTTPException(status_code=500, detail=f"逆地理编码失败: {e}")
