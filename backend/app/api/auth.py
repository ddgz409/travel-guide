"""认证路由：注册 / 登录 / 当前用户 / LLM 设置。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas import (
    LlmSettingsOut,
    LlmSettingsUpdate,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
)
from app.services.llm_client import PROVIDER_PRESETS, effective_llm_settings

router = APIRouter(prefix="/auth", tags=["认证"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    """注册新用户并返回令牌。"""
    exists = db.scalar(select(User).where(User.username == payload.username))
    if exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="该用户名已被注册"
        )

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """登录并返回令牌。"""
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误"
        )

    token = create_access_token(user.id)
    return Token(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    """获取当前登录用户。"""
    return current


@router.get("/me/llm", response_model=LlmSettingsOut)
def get_llm_settings(current: User = Depends(get_current_user)):
    """获取当前用户的 LLM 配置（API Key 脱敏）。"""
    return LlmSettingsOut(**effective_llm_settings(current))


@router.put("/me/llm", response_model=LlmSettingsOut)
def update_llm_settings(
    payload: LlmSettingsUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新 LLM 提供商 / 模型 / API Key。留空 Key 则清除，改用服务器默认。"""
    if payload.provider is not None:
        p = payload.provider.strip().lower()
        if p and p not in PROVIDER_PRESETS:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的提供商，可选: {', '.join(PROVIDER_PRESETS)}",
            )
        current.llm_provider = p or None

    if payload.model is not None:
        m = payload.model.strip()
        current.llm_model = m or None

    # api_key: None=不改；""=清除；非空=写入
    if payload.api_key is not None:
        key = payload.api_key.strip()
        current.llm_api_key = key or None

    db.add(current)
    db.commit()
    db.refresh(current)
    return LlmSettingsOut(**effective_llm_settings(current))
