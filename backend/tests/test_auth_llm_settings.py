"""LLM 设置 API 集成测试。"""
import uuid

from fastapi.testclient import TestClient

from app.core.database import Base, engine, ensure_sqlite_columns
from app.main import app

Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()


def test_llm_settings_get_put_clear():
    client = TestClient(app)
    username = f"llm_{uuid.uuid4().hex[:10]}"
    password = "testpass123"

    r = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password},
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/api/v1/auth/me/llm", headers=headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["provider"] == "zhipu"
    assert data["model"] == "glm-4"
    assert data["using_server_default"] is True
    assert data["has_api_key"] is False
    assert "zhipu" in [p["id"] for p in data["available_providers"]]

    r = client.put(
        "/api/v1/auth/me/llm",
        headers=headers,
        json={
            "provider": "zhipu",
            "model": "glm-4-flash",
            "api_key": "user-test-key-abcdefgh",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["has_api_key"] is True
    assert data["model"] == "glm-4-flash"
    assert data["using_server_default"] is False
    assert data["api_key_hint"]

    r = client.put(
        "/api/v1/auth/me/llm",
        headers=headers,
        json={"api_key": ""},
    )
    assert r.status_code == 200, r.text
    assert r.json()["has_api_key"] is False
    assert r.json()["using_server_default"] is True


def test_llm_settings_requires_auth():
    client = TestClient(app)
    assert client.get("/api/v1/auth/me/llm").status_code == 401


def test_llm_settings_custom_provider():
    client = TestClient(app)
    username = f"llm_c_{uuid.uuid4().hex[:10]}"
    password = "testpass123"

    r = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": password},
    )
    assert r.status_code == 201, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = client.put(
        "/api/v1/auth/me/llm",
        headers=headers,
        json={
            "provider": "moonshot",
            "model": "moonshot-v1-8k",
            "base_url": "https://api.moonshot.cn/v1",
            "api_key": "sk-custom-test-key",
        },
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["provider"] == "moonshot"
    assert data["model"] == "moonshot-v1-8k"
    assert data["base_url"] == "https://api.moonshot.cn/v1"
    assert data["has_api_key"] is True

    r = client.put(
        "/api/v1/auth/me/llm",
        headers=headers,
        json={"provider": "moonshot", "model": "moonshot-v1-8k", "base_url": ""},
    )
    assert r.status_code == 400

    r = client.put(
        "/api/v1/auth/me/llm",
        headers=headers,
        json={
            "provider": "zhipu",
            "model": "glm-4",
            "base_url": "",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["provider"] == "zhipu"
    assert not r.json().get("base_url")
