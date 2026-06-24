"""SQLAlchemy 数据模型。

四张核心表：users / trips / days / items
"""
import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, Date

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    """用户表。"""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    trips: Mapped[list["Trip"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Trip(Base):
    """攻略（一次旅行计划）。"""

    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    destination: Mapped[str] = mapped_column(String(128), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    travelers: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    budget_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    # 偏好：兴趣/住宿等级/交通方式等
    preferences: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # generating / ready / failed
    status: Mapped[str] = mapped_column(String(16), default="generating", nullable=False)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 匿名分享 token，非空时可通过分享链接只读访问
    share_token: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )

    user: Mapped["User"] = relationship(back_populates="trips")
    days: Mapped[list["Day"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", order_by="Day.day_index"
    )


class Day(Base):
    """行程按天拆分。"""

    __tablename__ = "days"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="days")
    items: Mapped[list["Item"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", order_by="Item.seq"
    )


class Item(Base):
    """每天的具体安排条目。"""

    __tablename__ = "items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    day_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("days.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # morning / afternoon / evening
    time_slot: Mapped[str] = mapped_column(String(16), nullable=False)
    # attraction / meal / hotel / transport
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    poi_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # {lng, lat, address}
    location: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost: Mapped[float | None] = mapped_column(Float, default=0, nullable=True)
    # 评分（来自高德 POI）
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    # 用户是否勾选（自选编辑：可取消不想去的条目）
    selected: Mapped[bool] = mapped_column(default=True, nullable=False)
    # 备选 POI 列表（用于"换一个"功能）[{name, poi_id, location, rating, ...}]
    alternatives: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 到下一站交通 {mode, distance, duration, cost}
    transport_to_next: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    day: Mapped["Day"] = relationship(back_populates="items")
