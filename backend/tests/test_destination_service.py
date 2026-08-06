"""destination_service 单测。"""
from unittest.mock import MagicMock, patch

from app.services.amap_client import Poi
from app.services.destination_service import (
    _CITY_CACHE,
    _fallback_from_amap,
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
            "app.services.destination_service.resolve_landmarks",
            return_value=["大熊猫繁育研究基地", "锦里古街"],
        ):
            result = _fallback_from_amap("成都")

    assert result["city"] == "成都"
    assert len(result["spots"]) >= 2
    assert len(result["foods"]) == 1
    assert result["foods"][0]["name"] == "龙抄手"
    assert result["foods"][0]["lng"] == 104.1
    assert result["foods"][0]["address"] == "春熙路"


def test_get_city_info_fast_amap_skips_llm():
    amap_data = {
        "city": "北京",
        "foods": [{"name": "烤鸭", "desc": "特色"}],
        "spots": [{"name": "故宫", "desc": "必去"}],
    }
    with patch(
        "app.services.destination_service._fallback_from_amap",
        return_value=amap_data,
    ) as mock_amap:
        with patch("app.services.destination_service._try_llm") as mock_llm:
            with patch("app.services.destination_service._finalize_city_info") as mock_fin:
                mock_fin.return_value = amap_data
                result = get_city_info("北京")

    mock_amap.assert_called_once()
    mock_llm.assert_not_called()
    assert result["foods"][0]["name"] == "烤鸭"


def test_get_city_info_uses_amap_when_llm_empty():
    with patch(
        "app.services.destination_service._fallback_from_amap",
        return_value={"city": "成都", "foods": [], "spots": []},
    ):
        with patch(
            "app.services.destination_service._try_llm",
            return_value={"city": "成都", "foods": [], "spots": []},
        ):
            with patch(
                "app.services.destination_service._merge_llm_amap",
                return_value={
                    "city": "成都",
                    "foods": [{"name": "火锅", "desc": "本地特色"}],
                    "spots": [{"name": "宽窄巷子", "desc": "热门必去"}],
                },
            ):
                with patch("app.services.destination_service._finalize_city_info") as mock_fin:
                    mock_fin.side_effect = lambda _c, r: r
                    result = get_city_info("成都")

    assert result["foods"][0]["name"] == "火锅"
    assert result["spots"][0]["name"] == "宽窄巷子"


def test_get_city_info_enriches_location_only():
    with patch(
        "app.services.destination_service._fallback_from_amap",
        return_value={
            "city": "北京",
            "foods": [{"name": "烤鸭", "desc": "特色"}],
            "spots": [{"name": "故宫", "desc": "必去"}],
        },
    ):
        with patch("app.services.destination_service._try_llm") as mock_llm:
            with patch(
                "app.services.destination_service._enrich_with_amap_location",
            ) as mock_loc:
                with patch(
                    "app.services.destination_service._enrich_with_xhs_images",
                ) as mock_xhs:
                    get_city_info("北京")
                    mock_llm.assert_not_called()
                    assert mock_loc.call_count == 2
                    mock_xhs.assert_not_called()


def test_city_info_stream_yields_status_and_result():
    llm_events = [
        {"type": "preview", "content": '{"foods":'},
        {
            "_internal": "result",
            "data": {
                "city": "杭州",
                "foods": [{"name": "西湖醋鱼", "desc": "特色"}],
                "spots": [{"name": "西湖", "desc": "必去"}],
            },
        },
    ]

    with patch(
        "app.services.destination_service._fallback_from_amap",
        return_value={"city": "杭州", "foods": [], "spots": []},
    ):
        with patch(
            "app.services.destination_service._stream_llm_city_search",
            return_value=iter(llm_events),
        ):
            with patch("app.services.destination_service._finalize_city_info") as mock_fin:
                mock_fin.side_effect = lambda _c, r: r
                events = list(city_info_stream("杭州"))

    types = [e["type"] for e in events]
    assert "status" in types
    assert "preview" in types
    assert events[-1]["type"] == "result"
    assert events[-1]["data"]["foods"][0]["name"] == "西湖醋鱼"
