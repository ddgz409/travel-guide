"""携程酒店软打分与解析单测。"""
from unittest.mock import patch

from app.services.ctrip_hotel_client import (
    CtripHotel,
    _score_hotel,
    search_ctrip_hotels,
)


def test_score_prefers_huazhu_new_high_rate_near_metro():
    good = CtripHotel(
        name="全季酒店成都宽窄巷子店",
        url="https://hotels.ctrip.com/hotel/1.html",
        open_year=2024,
        good_rate=95,
        is_huazhu=True,
        metro_distance_m=300,
        transport_hint=True,
    )
    weak = CtripHotel(
        name="某老旧宾馆",
        url="https://hotels.ctrip.com/hotel/2.html",
        open_year=2010,
        good_rate=70,
        is_huazhu=False,
        metro_distance_m=3000,
    )
    assert _score_hotel(good) > _score_hotel(weak)
    assert "华住会" in good.tags
    assert "好评≥90%" in good.tags
    assert "5年内新店" in good.tags


def test_search_falls_back_to_bing_and_sorts():
    bing = [
        {
            "title": "全季酒店成都店_携程",
            "snippet": "好评率95% 距地铁200米 2023年开业",
            "url": "https://hotels.ctrip.com/hotel/abc.html",
        },
        {
            "title": "普通旅馆",
            "snippet": "评分一般",
            "url": "https://hotels.ctrip.com/hotel/xyz.html",
        },
    ]
    with patch("app.services.ctrip_hotel_client.fetch_text", return_value=None):
        with patch("app.services.ctrip_hotel_client.bing_site_search", return_value=bing):
            hotels = search_ctrip_hotels("成都", max_results=6)
    assert len(hotels) >= 1
    assert hotels[0].name.startswith("全季")
    assert hotels[0].score >= hotels[-1].score


def test_empty_when_all_sources_fail():
    with patch("app.services.ctrip_hotel_client.fetch_text", return_value=None):
        with patch("app.services.ctrip_hotel_client.bing_site_search", return_value=[]):
            assert search_ctrip_hotels("成都") == []
