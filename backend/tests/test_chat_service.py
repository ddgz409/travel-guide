from app.services.chat_service import (
    WebSearchMode,
    build_system_prompt,
    resolve_web_search_mode,
    web_search_mode_label,
)


def test_resolve_web_search_auto_zhipu():
    assert resolve_web_search_mode("zhipu", None) == WebSearchMode.ZHIPU_NATIVE
    assert resolve_web_search_mode("zhipu", {"web_search": "auto"}) == WebSearchMode.ZHIPU_NATIVE


def test_resolve_web_search_auto_other_providers():
    assert resolve_web_search_mode("deepseek", None) == WebSearchMode.BING
    assert resolve_web_search_mode("openai", {"web_search": True}) == WebSearchMode.BING


def test_resolve_web_search_off():
    assert resolve_web_search_mode("zhipu", {"web_search": False}) == WebSearchMode.OFF
    assert resolve_web_search_mode("deepseek", {"web_search": "off"}) == WebSearchMode.OFF


def test_build_system_prompt_zhipu_mentions_online():
    text = build_system_prompt(
        provider="zhipu",
        model="glm-4",
        mode=WebSearchMode.ZHIPU_NATIVE,
    )
    assert "联网搜索" in text
    assert "离线模型" in text


def test_build_system_prompt_bing_injects_context():
    text = build_system_prompt(
        provider="deepseek",
        model="deepseek-chat",
        mode=WebSearchMode.BING,
        bing_context="1. 杭州天气\n   摘要：晴",
    )
    assert "网页搜索" in text
    assert "杭州天气" in text


def test_build_system_prompt_off_no_online_claim():
    text = build_system_prompt(
        provider="deepseek",
        model="deepseek-chat",
        mode=WebSearchMode.OFF,
    )
    assert "未开启联网" in text


def test_web_search_mode_label():
    assert web_search_mode_label(WebSearchMode.ZHIPU_NATIVE) == "智谱联网搜索"
    assert web_search_mode_label(WebSearchMode.BING) == "网页搜索"
    assert web_search_mode_label(WebSearchMode.OFF) == "离线模式"
