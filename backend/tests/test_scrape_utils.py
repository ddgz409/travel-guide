from unittest.mock import MagicMock, patch

from app.services.scrape_utils import bing_site_search, ddg_site_search, fetch_text, strip_html


def test_strip_html_removes_tags():
    assert "你好" in strip_html("<p>你好</p><script>x</script>")
    cleaned = strip_html("<script>alert(1)</script>hi")
    assert "alert" not in cleaned


def test_fetch_text_retries_then_none():
    with patch("app.services.scrape_utils.httpx.Client") as Client, patch(
        "app.services.scrape_utils.time.sleep"
    ):
        client = MagicMock()
        Client.return_value.__enter__.return_value = client
        client.get.side_effect = Exception("boom")
        assert fetch_text("https://example.com", retries=2) is None
        assert client.get.call_count == 3


def test_bing_site_search_parses_h2_links():
    html = '''
    <html><body>
    <h2><a href="https://www.xiaohongshu.com/explore/1">成都攻略</a></h2>
    <p>宽窄巷子很棒</p>
    <h2><a href="https://www.bing.com/foo">skip</a></h2>
    </body></html>
    '''
    with patch("app.services.scrape_utils.fetch_text", return_value=html):
        results = bing_site_search("xiaohongshu.com", "成都 旅游攻略", max_results=6)
    assert len(results) == 1
    assert results[0]["title"] == "成都攻略"


def test_bing_falls_back_to_ddg_on_captcha():
    captcha = "<html>Captcha challenge b_results</html>"
    ddg = '''
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.xiaohongshu.com%2Fexplore%2Fabc123def456789012345678">
    成都三日游
    </a>
    <a class="result__snippet">宽窄巷子</a>
    '''
    with patch(
        "app.services.scrape_utils.fetch_text",
        side_effect=[captcha, ddg],
    ):
        results = bing_site_search("xiaohongshu.com", "成都 旅游攻略", max_results=6)
    assert len(results) == 1
    assert "xiaohongshu.com/explore/" in results[0]["url"]
    assert "成都三日游" in results[0]["title"]


def test_ddg_site_search_filters_site():
    ddg = '''
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.xiaohongshu.com%2Fexplore%2Faaaaaaaaaaaaaaaaaaaaaaaa">笔记A</a>
    <a class="result__snippet">摘要A</a>
    <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fx">跳过</a>
    <a class="result__snippet">no</a>
    '''
    with patch("app.services.scrape_utils.fetch_text", return_value=ddg):
        results = ddg_site_search("xiaohongshu.com", "成都", max_results=6)
    assert len(results) == 1
    assert results[0]["url"].endswith("aaaaaaaaaaaaaaaaaaaaaaaa")
