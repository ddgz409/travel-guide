"""城市探索路由：城市信息搜索 + 逆地理编码。"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.core.deps import get_optional_user
from app.models import User
from app.services.amap_client import AmapError, get_amap_client
from app.services.destination_service import (
    city_info_stream,
    get_city_info,
    get_place_images,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/destinations", tags=["城市探索"])


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
):
    """从小红书笔记抓取地点真实封面图。"""
    return get_place_images(city.strip(), name.strip(), kind, limit)


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
