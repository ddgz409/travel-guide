"""共享收藏夹 / 订阅 API 模型。"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CollectionPlace(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    city: str = Field(min_length=1, max_length=64)
    address: str = ""
    lng: float | None = None
    lat: float | None = None
    poi_id: str | None = None
    note: str | None = None


class CollectionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    emoji: str = Field(default="📁", max_length=16)
    city: str | None = Field(default=None, max_length=64)
    places: list[CollectionPlace] = Field(min_length=1, max_length=50)


class CollectionUpdate(CollectionCreate):
    pass


class CollectionPlaceOut(CollectionPlace):
    pass


class CollectionSummary(BaseModel):
    id: str
    title: str
    summary: str | None = None
    emoji: str
    city: str | None = None
    author_display: str
    author_id: str | None = None
    place_count: int
    subscriber_count: int
    subscribed: bool = False
    is_owner: bool = False
    cover_places: list[CollectionPlaceOut] = Field(default_factory=list)
    created_at: datetime


class CollectionDetail(CollectionSummary):
    places: list[CollectionPlaceOut]


class CollectionListResponse(BaseModel):
    items: list[CollectionSummary]
    total: int
