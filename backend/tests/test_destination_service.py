"""destination_service 单测。"""
from unittest.mock import MagicMock, patch

from app.services.amap_client import Poi
from app.services.destination_service import (
    _CITY_CACHE,
    _fallback_from_amap,
    _local_foods,
    city_info_stream,
    get_city_info,
)


def setup_function() -> None:
    _CITY_CACHE.clear()


def test_fallback_from_amap_builds_foods_and_spots():
    mock_amap = MagicMock()
    mock_amap.api_key = "test-key"
    mock_amap.geocode.return_value = MagicMock(
        location="104.066,30.572",
        city="成都市",
    )
    mock_amap.search_poi_around.side_effect = [
        [
            Poi(
                id="1",
                name="宽窄巷子",
                type="attraction",
                lng=104.0,
                lat=30.6,
                address="青羊区",
                rating=4.7,
            ),
        ],
        [
            Poi(
                id="2",
                name="龙抄手",
                type="meal",
                lng=104.1,
                lat=30.6,
                address="春熙路",
                rating=4.5,
            ),
        ],
    ]

    with patch("app.services.destination_service.get_amap_client", return_value=mock_amap):
        with patch(
            "app.services.destination_service.landmarks_for",
            return_value=["大熊猫繁育研究基地", "锦里古街"],
        ):
            result = _fallback_from_amap("成都")

    assert result["city"] == "成都"
    assert len(result["spots"]) >= 2
    assert len(result["foods"]) == 1
    assert result["foods"][0]["name"] == "龙抄手"
    assert result["foods"][0]["lng"] == 104.1


def test_get_city_info_uses_cache():
    _CITY_CACHE["北京"] = (
        9999999999.0,
        {
            "city": "北京",
            "foods": [{"name": "烤鸭", "desc": "特色"}],
            "spots": [{"name": "故宫", "desc": "必去"}],
        },
    )
    with patch("app.services.destination_service._fallback_from_amap") as mock_fb:
        result = get_city_info("北京")
        mock_fb.assert_not_called()
    assert result["spots"][0]["name"] == "故宫"


def test_get_city_info_fast_amap():
    amap_data = {
        "city": "北京",
        "foods": [{"name": "烤鸭", "desc": "特色"}],
        "spots": [{"name": "故宫", "desc": "必去"}],
    }
    with patch(
        "app.services.destination_service._fallback_from_amap",
        return_value=amap_data,
    ) as mock_amap:
        result = get_city_info("北京")

    mock_amap.assert_called_once_with("北京")
    assert result["foods"][0]["name"] == "烤鸭"


def test_local_foods_fallback():
    foods = _local_foods("成都")
    assert any("火锅" in f["name"] for f in foods)


def test_city_info_stream_returns_result():
    data = {
        "city": "杭州",
        "foods": [{"name": "醋鱼", "desc": "特色"}],
        "spots": [{"name": "西湖", "desc": "必去"}],
    }
    with patch(
        "app.services.destination_service._fallback_from_amap",
        return_value=data,
    ):
        events = list(city_info_stream("杭州"))

    assert events[-1]["type"] == "result"
    assert events[-1]["data"]["spots"][0]["name"] == "西湖"
