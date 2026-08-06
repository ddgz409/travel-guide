"""AI 旅行助手聊天路由（SSE 流式）。"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_optional_user
from app.core.database import get_db
from app.models import User
from app.schemas.chat import ChatRequest, OptimizePlanQueryRequest, OptimizePlanQueryResponse
from app.services.chat_service import (
    chat_stream,
    load_trip_context,
    resolve_llm_config,
    resolve_server_llm_config,
)
from app.services.llm_client import LLMError
from app.services.smart_plan_service import optimize_plan_query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["AI助手"])


@router.post("/stream")
def chat_stream_endpoint(
    payload: ChatRequest,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),  # noqa: ARG001  保持与项目其他路由一致的签名
):
    """SSE 流式聊天。游客用服务器默认 Key，登录用户用自己的 Key。"""

    config = resolve_llm_config(payload.llm, user)
    trip_context = load_trip_context(payload.trip_id, db, user.id if user else None)

    messages_data = [{"role": m.role, "content": m.content} for m in payload.messages]

    def generate():
        try:
            for chunk in chat_stream(
                messages=messages_data,
                provider=config["provider"],
                api_key=config["api_key"],
                model=config["model"],
                base_url=config["base_url"],
                llm_override=payload.llm,
                trip_context=trip_context,
            ):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Chat stream error")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Nginx 不缓冲
        },
    )


@router.post("/optimize-plan-query", response_model=OptimizePlanQueryResponse)
def optimize_plan_query_endpoint(
    payload: OptimizePlanQueryRequest,
    user: User | None = Depends(get_optional_user),
):
    """用 LLM 将口语化出行关键词优化为完整规划描述。"""
    primary = resolve_llm_config(payload.llm, user)
    server = resolve_server_llm_config(payload.llm)

    def run_with(config: dict[str, str]) -> str:
        return optimize_plan_query(
            keywords=payload.keywords,
            destination=payload.destination,
            days=payload.days,
            start_date=payload.start_date,
            end_date=payload.end_date,
            provider=config["provider"],
            api_key=config["api_key"],
            model=config["model"],
            base_url=config["base_url"],
        )

    try:
        query = run_with(primary)
    except LLMError as first_err:
        same_as_server = (
            primary.get("api_key") == server.get("api_key")
            and primary.get("provider") == server.get("provider")
            and primary.get("model") == server.get("model")
        )
        if same_as_server:
            raise HTTPException(status_code=502, detail=str(first_err)) from first_err
        logger.warning("optimize with user llm failed, fallback server: %s", first_err)
        try:
            query = run_with(server)
        except LLMError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
    return OptimizePlanQueryResponse(query=query)
