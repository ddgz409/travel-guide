"""城市探索路由：城市信息搜索 + 逆地理编码。"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import get_optional_user
from app.models import User
from app.services.amap_client import AmapError, get_amap_client
from app.services.destination_service import get_city_info

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
