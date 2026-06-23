"""智谱 GLM 客户端封装。

封装 GLM 调用，支持 JSON 模式输出，便于生成引擎解析。
文档: https://open.bigmodel.cn/dev/api
"""
import json
import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LLMError(Exception):
    """LLM 调用异常。"""


class ZhipuClient:
    """智谱 GLM 客户端。

    优先使用官方 zhipuai SDK；SDK 不可用时回退到 httpx 直接调用 OpenAI 兼容接口。
    """

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key or settings.ZHIPU_API_KEY
        self.model = model or settings.ZHIPU_MODEL
        self._client = None
        if self.api_key and self.api_key != "your-zhipu-api-key-here":
            try:
                from zhipuai import ZhipuAI

                self._client = ZhipuAI(api_key=self.api_key)
            except ImportError:
                logger.warning("zhipuai SDK 未安装，将使用 httpx 回退方式调用")

    @property
    def available(self) -> bool:
        """是否有可用的 API key。"""
        return bool(self.api_key and self.api_key != "your-zhipu-api-key-here")

    def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """调用 GLM 并要求返回 JSON 对象。

        返回解析后的 dict。失败抛出 LLMError。
        """
        if not self.available:
            raise LLMError("未配置智谱 API key，请在 .env 中设置 ZHIPU_API_KEY")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        try:
            if self._client is not None:
                content = self._call_via_sdk(messages, temperature, max_tokens)
            else:
                content = self._call_via_httpx(messages, temperature, max_tokens)
        except LLMError:
            raise
        except Exception as e:
            raise LLMError(f"GLM 调用失败: {e}") from e

        return self._parse_json(content)

    def _call_via_sdk(
        self, messages: list[dict], temperature: float, max_tokens: int
    ) -> str:
        """通过官方 SDK 调用。"""
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""

    def _call_via_httpx(
        self, messages: list[dict], temperature: float, max_tokens: int
    ) -> str:
        """httpx 回退：调用智谱 OpenAI 兼容接口。"""
        import httpx

        # 智谱提供 OpenAI 兼容端点
        url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {"type": "json_object"},
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
        return data["choices"][0]["message"]["content"] or ""

    @staticmethod
    def _parse_json(content: str) -> dict[str, Any]:
        """解析 LLM 输出为 JSON，容错处理。"""
        text = content.strip()
        # 去除可能的 markdown 代码块包裹
        if text.startswith("```"):
            text = text.strip("`")
            # 去掉开头的 json 标识
            if text.lower().startswith("json"):
                text = text[4:].strip()
        try:
            result = json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError(f"LLM 输出无法解析为 JSON: {e}\n原始内容: {content[:500]}") from e
        if not isinstance(result, dict):
            raise LLMError(f"LLM 输出非 JSON 对象: {type(result)}")
        return result


# 模块级单例
_client: ZhipuClient | None = None


def get_zhipu_client() -> ZhipuClient:
    global _client
    if _client is None:
        _client = ZhipuClient()
    return _client
