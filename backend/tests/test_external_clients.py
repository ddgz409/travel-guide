from app.services.ctrip_client import search_ctrip
from app.services.xiaohongshu_client import search_xiaohongshu


def test_xhs_returns_destination_links():
    tips = search_xiaohongshu("成都", max_results=6)
    assert len(tips) >= 3
    assert all(t["source"] == "xiaohongshu" for t in tips)
    assert all("成都" in t["title"] for t in tips)
    assert all("xiaohongshu.com/search_result" in t["url"] for t in tips)
    assert "%E6%88%90%E9%83%BD" in tips[0]["url"] or "成都" in tips[0]["url"]


def test_ctrip_returns_destination_links():
    tips = search_ctrip("成都", max_results=6)
    assert len(tips) >= 2
    assert all(t["source"] == "ctrip" for t in tips)
    assert any("成都" in t["title"] for t in tips)
    assert any("ctrip.com" in t["url"] for t in tips)
