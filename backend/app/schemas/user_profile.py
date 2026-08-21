"""用户主页 / 关注 API 模型。"""
from __future__ import annotations

from pydantic import BaseModel


class UserBrief(BaseModel):
    """列表中的用户简档（粉丝 / 关注名单）。"""

    id: str
    username: str


class UserProfileOut(BaseModel):
    """作者公开主页。"""

    id: str
    username: str
    follower_count: int = 0
    following_count: int = 0
    post_count: int = 0
    is_following: bool = False
    is_self: bool = False


class FollowListResponse(BaseModel):
    items: list[UserBrief]
    total: int
