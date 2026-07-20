from unittest.mock import patch

from app.services.ctrip_client import search_ctrip
from app.services.xiaohongshu_client import search_xiaohongshu


def test_xhs_parses_note_links_from_html():
    html = '''
    <html><a href="https://www.xiaohongshu.com/explore/64abcdef64abcdef64abcdef">成都必去</a>
    <a href="https://www.xiaohongshu.com/explore/64defabc64defabc64defabc">美食清单</a>
    </html>
    '''
    with patch("app.services.xiaohongshu_client.fetch_text", return_value=html):
        with patch("app.services.xiaohongshu_client.bing_site_search") as bing:
            tips = search_xiaohongshu("成都", max_results=6)
            bing.assert_not_called()
    assert len(tips) == 2
    assert tips[0]["source"] == "xiaohongshu"


def test_xhs_falls_back_to_search_when_empty():
    with patch("app.services.xiaohongshu_client.fetch_text", return_value="<html></html>"):
        with patch(
            "app.services.xiaohongshu_client.bing_site_search",
            return_value=[{
                "title": "笔记A",
                "snippet": "摘要",
                "url": "https://www.xiaohongshu.com/explore/aaaaaaaaaaaaaaaaaaaaaaaa",
            }],
        ):
            tips = search_xiaohongshu("成都")
    assert len(tips) == 1
    assert tips[0]["source"] == "xiaohongshu"


def test_ctrip_falls_back_to_search():
    with patch("app.services.ctrip_client.fetch_text", return_value=None):
        with patch(
            "app.services.ctrip_client.bing_site_search",
            return_value=[{
                "title": "景点B",
                "snippet": "评分4.8",
                "url": "https://you.ctrip.com/sight/chengdu/1.html",
            }],
        ):
            tips = search_ctrip("成都")
    assert len(tips) == 1
    assert tips[0]["source"] == "ctrip"


def test_xhs_portal_when_all_scrape_fails():
    with patch("app.services.xiaohongshu_client.fetch_text", return_value="<html></html>"):
        with patch("app.services.xiaohongshu_client.bing_site_search", return_value=[]):
            tips = search_xiaohongshu("成都")
    assert len(tips) >= 1
    assert tips[0]["meta"]["portal"] is True
    assert "xiaohongshu.com/search_result" in tips[0]["url"]


def test_ctrip_portal_when_all_scrape_fails():
    with patch("app.services.ctrip_client.fetch_text", return_value=None):
        with patch("app.services.ctrip_client.bing_site_search", return_value=[]):
            tips = search_ctrip("成都")
    assert len(tips) >= 1
    assert tips[0]["meta"]["portal"] is True
