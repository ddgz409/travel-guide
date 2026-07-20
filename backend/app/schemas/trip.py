"""攻略相关 Pydantic 模型。"""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

TimeSlot = Literal["morning", "afternoon", "evening"]
ItemType = Literal["attraction", "meal", "hotel", "transport"]
TripStatus = Literal["generating", "ready", "failed"]

ExternalSource = Literal["xiaohongshu", "ctrip"]


class ExternalTip(BaseModel):
    """小红书 / 携程参考条目。"""

    source: ExternalSource
    title: str
    snippet: str = ""
    url: str
    meta: dict[str, Any] | None = None


class ExternalRefs(BaseModel):
    """按来源分组的外部参考。"""

    xiaohongshu: list[ExternalTip] = Field(default_factory=list)
    ctrip: list[ExternalTip] = Field(default_factory=list)


EMPTY_EXTERNAL_REFS: dict[str, list] = {"xiaohongshu": [], "ctrip": []}


class ItemOut(BaseModel):
    """行程条目响应。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    seq: int
    time_slot: TimeSlot
    type: ItemType
    name: str
    poi_id: str | None = None
    location: dict | None = None
    description: str | None = None
    duration_min: int | None = None
    cost: float | None = None
    rating: float | None = None
    selected: bool = True
    alternatives: list[dict] | None = None
    transport_to_next: dict | None = None


class ItemUpdate(BaseModel):
    """编辑行程条目。"""

    name: str | None = None
    description: str | None = None
    duration_min: int | None = None
    cost: float | None = None
    time_slot: TimeSlot | None = None
    selected: bool | None = None
    poi_id: str | None = None
    location: dict | None = None
    rating: float | None = None


class ReorderItem(BaseModel):
    """拖拽排序：条目在新顺序中的位置。"""

    item_id: str
    new_seq: int


class ReorderRequest(BaseModel):
    """批量重排序请求。"""

    items: list[ReorderItem]


class DayOut(BaseModel):
    """单日行程响应。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    day_index: int
    date: date
    summary: str | None = None
    items: list[ItemOut] = []


class TripGenerateRequest(BaseModel):
    """生成攻略请求。"""

    destination: str = Field(min_length=1, max_length=128)
    start_date: date
    end_date: date
    travelers: int = Field(default=1, ge=1, le=20)
    preferences: dict = Field(
        default_factory=lambda: {},
        description="偏好：兴趣、住宿等级、交通方式等",
    )
    must_include: list[dict] = Field(
        default_factory=list,
        description="用户自选的必去景点列表 [{name, poi_id, location}]",
    )

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "destination": "东京",
            "start_date": "2026-07-01",
            "end_date": "2026-07-03",
            "travelers": 2,
            "preferences": {
                "interests": ["文化", "美食", "购物"],
                "budget_level": "中等",
                "transport": "公共交通",
            },
        }
    })


class TripOut(BaseModel):
    """攻略响应（列表与详情共用，详情含 days）。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    destination: str
    start_date: date
    end_date: date
    travelers: int
    budget_total: float | None = None
    preferences: dict = {}
    external_refs: dict = Field(default_factory=lambda: {"xiaohongshu": [], "ctrip": []})
    hotel_fetch_status: str = "amap_only"
    hotel_candidates: list[dict] = Field(default_factory=list)
    status: TripStatus
    error_msg: str | None = None
    share_token: str | None = None
    created_at: datetime
    updated_at: datetime
    days: list[DayOut] = []


class TripListItem(BaseModel):
    """攻略列表项（不含 days，轻量）。"""

    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    destination: str
    start_date: date
    end_date: date
    travelers: int
    budget_total: float | None = None
    status: TripStatus
    created_at: datetime


class TripUpdate(BaseModel):
    """编辑攻略元信息。"""

    title: str | None = None
    preferences: dict | None = None
