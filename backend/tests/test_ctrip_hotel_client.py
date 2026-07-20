"""携程酒店软打分与解析单测。"""
from unittest.mock import patch

from app.services.ctrip_hotel_client import (
    CtripHotel,
    _parse_list_html,
    _score_hotel,
    resolve_city_id,
    search_ctrip_hotels,
)


def test_resolve_city_id():
    assert resolve_city_id("成都") == 28
    assert resolve_city_id("成都市") == 28
    assert resolve_city_id("未知星球") is None


def test_parse_list_html_hotel_name_id():
    html = """
    <span class="hotelName">全季酒店(成都太古里东路店)</span>
    <div hotelId="1234567"></div>
    <span>4.8分</span>
    <span class="hotelName">某老旧宾馆成都店</span>
    <div hotelId="7654321"></div>
    <span>4.2分</span>
    """
    hotels = _parse_list_html(html, max_results=6)
    assert len(hotels) == 2
    assert hotels[0].name.startswith("全季")
    assert hotels[0].url.endswith("/hotel/1234567.html")
    assert hotels[0].is_huazhu


def test_score_prefers_huazhu_new_high_rate_near_metro():
    good = CtripHotel(
        name="全季酒店成都宽窄巷子店",
        url="https://hotels.ctrip.com/hotel/12345678.html",
        open_year=2024,
        good_rate=95,
        is_huazhu=True,
        metro_distance_m=300,
        transport_hint=True,
    )
    weak = CtripHotel(
        name="某老旧宾馆",
        url="https://hotels.ctrip.com/hotel/87654321.html",
        open_year=2010,
        good_rate=70,
        is_huazhu=False,
        metro_distance_m=3000,
    )
    assert _score_hotel(good) > _score_hotel(weak)
    assert "华住会" in good.tags


def test_search_uses_city_list():
    html = """
    <span class="hotelName">全季酒店(成都太古里东路店)</span>
    <i hotelId="11112222"></i>
    <span>4.9</span>
    """
    with patch("app.services.ctrip_hotel_client.fetch_text", return_value=html):
        with patch("app.services.ctrip_hotel_client.bing_site_search", return_value=[]):
            hotels = search_ctrip_hotels("成都", max_results=6)
    assert len(hotels) >= 1
    assert hotels[0].name.startswith("全季")
    assert "华住会" in hotels[0].tags


def test_empty_when_all_sources_fail():
    with patch("app.services.ctrip_hotel_client.resolve_city_id", return_value=None):
        with patch("app.services.ctrip_hotel_client.fetch_text", return_value=None):
            with patch("app.services.ctrip_hotel_client.bing_site_search", return_value=[]):
                assert search_ctrip_hotels("未知城") == []
