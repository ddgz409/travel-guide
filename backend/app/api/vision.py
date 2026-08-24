"""拍照识景：把照片/截图发给视觉模型（GLM-4.6V-Flash）识别。"""
from __future__ import annotations

import base64
import io
import json
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.deps import get_optional_user
from app.models import User
from app.schemas.vision import VisionRecognizeResponse
from app.services.llm_client import LLMClient, LLMError

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/vision", tags=["视觉识别"])

_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
_MAX_SIZE = 8 * 1024 * 1024  # 8MB
_MAX_DIM = 1280  # 超此尺寸压缩，控制 base64 体积

# 主模型（.env ZHIPU_VISION_MODEL，默认 glm-4.6v-flash）限流/失败时按顺序回退
# (模型名, max_tokens) — 老版 glm-4v-flash 的 max_tokens 上限为 1024
_FALLBACK_VISION_MODELS: tuple[tuple[str, int], ...] = (("glm-4v-flash", 900),)

_SYSTEM_PROMPT = """你是旅行助手的「视觉大脑」。用户会发来一张图片，可能是：
1. 景点 / 地标 / 风景的实拍照片
2. 酒店、车票、地图、美食等的截图或实拍

请识别图片内容，并严格输出 JSON（不要输出任何多余文字）：
{
  "kind": "scenery|hotel|ticket|map|food|other",
  "title": "识别到的主要名称/标题，例如景点名、酒店名、车次名",
  "description": "用 2-5 句话自然描述这张图 / 这个地方",
  "highlights": ["亮点或关键信息1", "亮点或关键信息2"],
  "tips": ["实用建议或提取到的关键信息1", "实用建议或提取到的关键信息2"]
}
其中：
- 景点照：highlights 写值得一看的特色，tips 写游玩建议
- 酒店 / 车票 / 地图截图：highlights 和 tips 提取图中关键信息（名称、价格、日期、车次、路线等）"""

_USER_PROMPT = "请识别这张图片。"


@router.post("/recognize", response_model=VisionRecognizeResponse)
async def recognize(
    file: UploadFile = File(...),
    user: User | None = Depends(get_optional_user),
):
    """识别照片/截图内容（游客可用服务器默认 Key）。"""
    if (file.content_type or "") not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP 图片")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="图片内容为空")
    return _recognize_bytes(content, user)


class RecognizeB64In(BaseModel):
    """base64 图片入参：兼容纯 base64 与 data URL 前缀。"""

    image: str


@router.post("/recognize-base64", response_model=VisionRecognizeResponse)
async def recognize_base64(
    payload: RecognizeB64In,
    user: User | None = Depends(get_optional_user),
):
    """JSON 通道识别：客户端把图片读成 base64 直接 POST，绕开 RN 原生
    multipart FormData 在部分机型上的上传失败问题。"""
    b64 = (payload.image or "").strip()
    if not b64:
        raise HTTPException(status_code=400, detail="图片内容为空")
    if "," in b64[:80] and b64[:5].lower() == "data:":
        b64 = b64.split(",", 1)[1]
    import base64 as _b64mod

    try:
        content = _b64mod.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=400, detail="base64 解码失败")
    if not content:
        raise HTTPException(status_code=400, detail="图片内容为空")
    return _recognize_bytes(content, user)


def _recognize_bytes(content: bytes, user: User | None) -> VisionRecognizeResponse:
    if len(content) > _MAX_SIZE:
        raise HTTPException(status_code=400, detail="图片不能超过 8MB")
    try:
        with Image.open(io.BytesIO(content)) as src:
            img = src.convert("RGB")
            img.thumbnail((_MAX_DIM, _MAX_DIM))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            content = buf.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析该图片文件")

    image_b64 = base64.b64encode(content).decode("ascii")
    models: list[tuple[str, int]] = [(settings.ZHIPU_VISION_MODEL, 2048)]
    models += [
        (m, t) for m, t in _FALLBACK_VISION_MODELS if m != settings.ZHIPU_VISION_MODEL
    ]
    seen = set()
    last_error: str | None = None
    raw = ""
    for model, max_tokens in models:
        if model in seen:
            continue
        seen.add(model)
        client = LLMClient(provider="zhipu", model=model)
        try:
            raw = client.chat_vision(
                image_b64,
                mime="image/jpeg",
                system_prompt=_SYSTEM_PROMPT,
                user_prompt=_USER_PROMPT,
                temperature=0.3,
                max_tokens=max_tokens,
            )
            if raw and raw.strip():
                logger.info("视觉识别 model=%s 成功", model)
                break
        except LLMError as e:
            last_error = str(e)
            logger.warning("视觉识别 model=%s 失败: %s", model, last_error)
    else:
        raise HTTPException(status_code=502, detail=f"视觉识别失败: {last_error or '无可用模型'}")

    return _parse_result(raw)


def _parse_result(raw: str) -> VisionRecognizeResponse:
    """解析模型 JSON 输出；解析失败则把原始文本兜底为 description。"""
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return VisionRecognizeResponse(
                kind=str(data.get("kind") or "other"),
                title=str(data.get("title") or ""),
                description=str(data.get("description") or ""),
                highlights=[str(x) for x in (data.get("highlights") or [])],
                tips=[str(x) for x in (data.get("tips") or [])],
                raw=raw,
            )
    except Exception:
        pass
    return VisionRecognizeResponse(
        kind="other",
        description=raw or "未能识别图片内容",
        raw=raw,
    )
