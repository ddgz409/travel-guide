"""LLM 客户端提供商解析与用户覆盖测试。"""
from types import SimpleNamespace

from app.services.llm_client import (
    DEFAULT_MODEL,
    LLMClient,
    LLMError,
    PROVIDER_PRESETS,
    effective_llm_settings,
    mask_api_key,
)


def test_zhipu_default_model_is_glm4():
    assert PROVIDER_PRESETS["zhipu"]["model"] == "glm-4"
    assert DEFAULT_MODEL == "glm-4"


def test_zhipu_suggested_includes_new_models():
    from app.services.llm_client import SUGGESTED_MODELS

    zhipu = SUGGESTED_MODELS["zhipu"]
    for m in ("glm-5.2", "glm-4.7", "glm-4.7-flash", "glm-4"):
        assert m in zhipu


def test_doubao_and_mimo_presets():
    from app.services.llm_client import PROVIDER_PRESETS, SUGGESTED_MODELS

    assert "doubao" in PROVIDER_PRESETS
    assert "mimo" in PROVIDER_PRESETS
    assert "volces.com" in PROVIDER_PRESETS["doubao"]["base_url"]
    assert "xiaomimimo.com" in PROVIDER_PRESETS["mimo"]["base_url"]
    assert "doubao-seed-1-6" in SUGGESTED_MODELS["doubao"]
    assert "mimo-v2.5-pro" in SUGGESTED_MODELS["mimo"]

    db = LLMClient(provider="doubao", api_key="sk-db", model="doubao-seed-1-6")
    assert db.available and "volces.com" in db.base_url
    mm = LLMClient(provider="mimo", api_key="sk-mm", model="mimo-v2.5-pro")
    assert mm.available and "xiaomimimo.com" in mm.base_url


def test_deepseek_preset():
    client = LLMClient(provider="deepseek", api_key="sk-test")
    assert client.provider == "deepseek"
    assert client.model == PROVIDER_PRESETS["deepseek"]["model"]
    assert "deepseek.com" in client.base_url
    assert client.available


def test_zhipu_preset():
    client = LLMClient(provider="zhipu", api_key="zk-test", model="glm-4")
    assert client.model == "glm-4"
    assert "bigmodel.cn" in client.base_url


def test_placeholder_key_not_available():
    client = LLMClient(provider="deepseek", api_key="your-deepseek-api-key-here")
    assert not client.available


def test_unknown_provider():
    try:
        LLMClient(provider="nope", api_key="x")
        assert False, "should raise"
    except LLMError as e:
        assert "未知" in str(e)


def test_for_user_overrides_key_and_model():
    user = SimpleNamespace(
        llm_provider="zhipu",
        llm_api_key="user-secret-key-123456",
        llm_model="glm-4-flash",
    )
    client = LLMClient.for_user(user)
    assert client.api_key == "user-secret-key-123456"
    assert client.model == "glm-4-flash"


def test_for_user_none_uses_server():
    client = LLMClient.for_user(None)
    assert client.provider in PROVIDER_PRESETS


def test_mask_and_effective_settings():
    assert mask_api_key("abcdefghijklmnop") == "abcd****mnop"
    user = SimpleNamespace(
        llm_provider="zhipu",
        llm_api_key="abcdefghijklmnop",
        llm_model="glm-4",
    )
    data = effective_llm_settings(user)
    assert data["has_api_key"] is True
    assert data["using_server_default"] is False
    assert data["api_key_hint"] == "abcd****mnop"
    assert data["model"] == "glm-4"
