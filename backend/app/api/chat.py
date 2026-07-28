"""AI 旅行助手聊天路由（SSE 流式）。"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_optional_user
from app.core.database import get_db
from app.models import User
from app.schemas.chat import ChatRequest
from app.services.chat_service import chat_stream, resolve_llm_config

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

    messages_data = [{"role": m.role, "content": m.content} for m in payload.messages]

    def generate():
        try:
            for chunk in chat_stream(
                messages=messages_data,
                provider=config["provider"],
                api_key=config["api_key"],
                model=config["model"],
                base_url=config["base_url"],
            ):
                yield f"data: {json.dumps({'content': chunk}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            logger.exception("Chat stream error")
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Nginx 不缓冲
        },
    )
