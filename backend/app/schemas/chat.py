"""AI 聊天助手请求体。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field(description="user 或 assistant")
    content: str = Field(description="消息内容")


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(description="对话历史（最近 N 条）")
    trip_id: str | None = Field(default=None, description="关联行程 ID，注入上下文")
    llm: dict | None = Field(
        default=None,
        description="LLM 配置 {provider, model, api_key, base_url, web_search}；web_search: true|false|'auto'",
    )


class OptimizePlanQueryRequest(BaseModel):
    keywords: str = Field(description="用户原始关键词")
    destination: str = Field(description="已解析目的地")
    days: int = Field(ge=1, le=14, description="行程天数")
    start_date: str = Field(description="出发日期 YYYY-MM-DD")
    end_date: str = Field(description="结束日期 YYYY-MM-DD")
    llm: dict | None = Field(default=None, description="LLM 配置，同 ChatRequest")


class OptimizePlanQueryResponse(BaseModel):
    query: str = Field(description="优化后的规划描述")
