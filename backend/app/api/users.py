"""用户主页与关注关系：查看作者资料、TA 的发帖、关注/取关、粉丝与关注名单。"""
from __future__ import annotations

import io
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models import SharedCollection, User, UserFollow
from app.schemas.user_profile import (
    AvatarOut,
    FollowListResponse,
    UserBrief,
    UserProfileOut,
)

router = APIRouter(prefix="/users", tags=["用户主页"])

_STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static"

_ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _get_user(db: Session, user_id: str) -> User:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return u


def _profile(user: User, db: Session, current: User | None) -> UserProfileOut:
    follower_count = (
        db.scalar(
            select(func.count())
            .select_from(UserFollow)
            .where(UserFollow.followee_id == user.id)
        )
        or 0
    )
    following_count = (
        db.scalar(
            select(func.count())
            .select_from(UserFollow)
            .where(UserFollow.follower_id == user.id)
        )
        or 0
    )
    post_count = (
        db.scalar(
            select(func.count())
            .select_from(SharedCollection)
            .where(
                SharedCollection.user_id == user.id,
                SharedCollection.is_public.is_(True),
            )
        )
        or 0
    )
    is_following = bool(
        current
        and current.id != user.id
        and db.scalar(
            select(UserFollow.id).where(
                UserFollow.follower_id == current.id,
                UserFollow.followee_id == user.id,
            )
        )
    )
    return UserProfileOut(
        id=user.id,
        username=user.username,
        avatar=user.avatar,
        follower_count=follower_count,
        following_count=following_count,
        post_count=post_count,
        is_following=is_following,
        is_self=bool(current and current.id == user.id),
    )


@router.get("/{user_id}/profile", response_model=UserProfileOut)
def get_user_profile(
    user_id: str,
    db: Session = Depends(get_db),
    current: User | None = Depends(get_optional_user),
):
    """作者公开主页资料（未登录也能看）。"""
    return _profile(_get_user(db, user_id), db, current)


@router.post("/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def follow_user(
    user_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """关注作者。"""
    if current.id == user_id:
        raise HTTPException(status_code=400, detail="不能关注自己")
    _get_user(db, user_id)
    exists = db.scalar(
        select(UserFollow.id).where(
            UserFollow.follower_id == current.id,
            UserFollow.followee_id == user_id,
        )
    )
    if not exists:
        db.add(UserFollow(follower_id=current.id, followee_id=user_id))
        db.commit()


@router.delete("/{user_id}/follow", status_code=status.HTTP_204_NO_CONTENT)
def unfollow_user(
    user_id: str,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """取消关注。"""
    row = db.scalar(
        select(UserFollow).where(
            UserFollow.follower_id == current.id,
            UserFollow.followee_id == user_id,
        )
    )
    if row:
        db.delete(row)
        db.commit()


def _follow_list(db: Session, user_id: str, direction: str) -> list[User]:
    """direction: 'followers'（关注我的人）或 'following'（我关注的人）。"""
    if direction == "followers":
        rows = db.scalars(
            select(User)
            .join(UserFollow, UserFollow.follower_id == User.id)
            .where(UserFollow.followee_id == user_id)
            .order_by(UserFollow.created_at.desc())
        ).all()
    else:
        rows = db.scalars(
            select(User)
            .join(UserFollow, UserFollow.followee_id == User.id)
            .where(UserFollow.follower_id == user_id)
            .order_by(UserFollow.created_at.desc())
        ).all()
    return list(rows)


@router.get("/{user_id}/followers", response_model=FollowListResponse)
def list_followers(
    user_id: str,
    db: Session = Depends(get_db),
    current: User | None = Depends(get_optional_user),
):
    """该作者的粉丝（公开）。"""
    _get_user(db, user_id)
    users = _follow_list(db, user_id, "followers")
    return FollowListResponse(
        items=[UserBrief(id=u.id, username=u.username, avatar=u.avatar) for u in users],
        total=len(users),
    )


@router.get("/{user_id}/following", response_model=FollowListResponse)
def list_following(
    user_id: str,
    db: Session = Depends(get_db),
    current: User | None = Depends(get_optional_user),
):
    """该作者关注的人（公开）。"""
    _get_user(db, user_id)
    users = _follow_list(db, user_id, "following")
    return FollowListResponse(
        items=[UserBrief(id=u.id, username=u.username, avatar=u.avatar) for u in users],
        total=len(users),
    )


@router.put("/me/avatar", response_model=AvatarOut)
async def upload_my_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """上传头像（jpg/png/webp，自动缩放为方形）。"""
    if (file.content_type or "") not in _ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP 图片")
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片不能超过 5MB")
    if not content:
        raise HTTPException(status_code=400, detail="图片内容为空")
    try:
        with Image.open(io.BytesIO(content)) as src:
            img = src.convert("RGB")
            img.thumbnail((512, 512))
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析该图片文件")
    avatar_dir = _STATIC_DIR / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)
    path = avatar_dir / f"{current.id}.jpg"
    img.save(path, "JPEG", quality=88)
    rel = f"/static/avatars/{current.id}.jpg"
    current.avatar = rel
    db.commit()
    return AvatarOut(avatar=rel)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
def remove_my_avatar(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """删除头像，恢复昵称首字默认头像。"""
    if current.avatar:
        rel = current.avatar
        if rel.startswith("/static/avatars/"):
            p = _STATIC_DIR / rel.removeprefix("/static/")
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass
        current.avatar = None
        db.commit()
