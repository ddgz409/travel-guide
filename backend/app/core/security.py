"""安全工具：密码哈希与 JWT 令牌。

直接使用 bcrypt 库（避免 passlib 与新版 bcrypt 的兼容问题）。
"""
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
from jose import jwt

from app.core.config import get_settings

settings = get_settings()

# bcrypt 哈希限制 72 字节，超过则先截断
_BCRYPT_MAX = 72


def hash_password(password: str) -> str:
    """密码哈希（bcrypt）。"""
    pwd_bytes = password.encode("utf-8")[:_BCRYPT_MAX]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """校验明文密码与哈希是否匹配。"""
    try:
        pwd_bytes = plain.encode("utf-8")[:_BCRYPT_MAX]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    """生成 JWT 访问令牌。subject 通常是用户 id。"""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """解码并校验 JWT。失败抛出 jose 异常。"""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
