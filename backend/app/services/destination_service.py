"""城市探索服务：用 LLM 联网搜索 + JSON 结构化输出。

首次将 Zhipu web_search（联网）与 response_format: json_object（结构化）结合，
返回城市真实美食和景点信息。
"""
from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any

import httpx

from app.services.chat_service import resolve_llm_config

if TYPE_CHECKING:
    from app.models import User

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是一个旅游信息助手。用户会给你一个城市名，你需要通过联网搜索获取该城市的真实信息。

请返回严格的 JSON 对象，格式如下：
{
  "foods": [
    {"name": "美食名称", "desc": "一句话描述特色"},
    ...3到4个当地特色美食
  ],
  "spots": [
    {"name": "景点名称", "desc": "一句话描述特色"},
    ...3到4个热门景点
  ]
}

要求：
- 必须基于联网搜索的真实信息，不要编造
- 如果搜索不到有效信息，对应数组返回空 []
- 每项 desc 不超过 50 字
- 只返回 JSON，不要任何其他文字"""


def _parse_json_content(content: str) -> dict[str, Any]:
    """解析 LLM 输出为 JSON，兼容 markdown 代码块包裹。"""
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError(f"LLM 输出非 JSON 对象: {type(result)}")
    return result


def get_city_info(city: str, user: "User | None" = None) -> dict[str, Any]:
    """联网搜索城市信息，返回 {city, foods, spots}。

    无有效数据时 foods/spots 为空数组，不报错。
    """
    config = resolve_llm_config(user=user)
    provider = config["provider"]
    api_key = config["api_key"]
    model = config["model"]
    base_url = config["base_url"]

    empty: dict[str, Any] = {"city": city, "foods": [], "spots": []}

    if not api_key:
        logger.warning("get_city_info: 未配置 API Key")
        return empty

    url = f"{base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"城市：{city}\n\n请联网搜索这个城市的特色美食和热门景点。"},
        ],
        "temperature": 0.6,
        "max_tokens": 1024,
        "response_format": {"type": "json_object"},
    }

    # 智谱 GLM 联网搜索
    if provider == "zhipu":
        body["tools"] = [{
            "type": "web_search",
            "web_search": {"enable": True, "search_result": False},
        }]

    logger.info("City info search city=%s provider=%s model=%s", city, provider, model)

    try:
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, headers=headers, json=body)
            if resp.status_code >= 400:
                logger.warning("City info HTTP %s: %s", resp.status_code, resp.text[:300])
                return empty
            data = resp.json()
        content = data["choices"][0]["message"]["content"] or ""
        result = _parse_json_content(content)
        foods = result.get("foods", [])
        spots = result.get("spots", [])
        # 校验格式
        foods = [
            {"name": str(f.get("name", "")), "desc": str(f.get("desc", ""))}
            for f in foods
            if isinstance(f, dict) and f.get("name")
        ][:4]
        spots = [
            {"name": str(s.get("name", "")), "desc": str(s.get("desc", ""))}
            for s in spots
            if isinstance(s, dict) and s.get("name")
        ][:4]
        return {"city": city, "foods": foods, "spots": spots}
    except Exception:
        logger.exception("get_city_info failed for city=%s", city)
        return empty
