"""AI 聊天助手请求体。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(description="user 或 assistant")
    content: str = Field(description="消息内容")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(description="对话历史（最近 N 条）")
    llm: dict | None = Field(
        default=None,
        description="游客自带 LLM 配置 {provider, model, api_key, base_url}",
    )
