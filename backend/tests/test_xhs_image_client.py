"""xhs_image_client 单测。"""
from unittest.mock import patch

from app.services.xhs_image_client import fetch_xhs_images


def test_fetch_xhs_images_from_note_page():
    note_url = "https://www.xiaohongshu.com/explore/abc123"
    img = "https://sns-webpic-qc.xhscdn.com/202608061508/test.jpg"
    html = f'<meta property="og:image" content="{img}" />'

    with patch(
        "app.services.xhs_image_client._collect_note_urls",
        return_value=[note_url],
    ):
        with patch("app.services.xhs_image_client.fetch_text", return_value=html):
            urls = fetch_xhs_images("北京", "故宫", "spots", limit=2)

    assert urls == [img]


def test_fetch_xhs_images_uses_cache():
    with patch(
        "app.services.xhs_image_client._collect_note_urls",
        return_value=[],
    ) as mock_collect:
        from app.services import xhs_image_client

        xhs_image_client._cache.clear()
        fetch_xhs_images("上海", "外滩", "spots", limit=1)
        fetch_xhs_images("上海", "外滩", "spots", limit=1)
        assert mock_collect.call_count == 1
