"""SQLAlchemy 数据模型。

四张核心表：users / trips / days / items
"""
import uuid
from datetime import date, datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON, Date

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    """用户表。"""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # 用户自填 LLM：为空则回退服务器 .env 默认（智谱 glm-4）
    llm_provider: Mapped[str | None] = mapped_column(String(64), nullable=True)
    llm_api_key: Mapped[str | None] = mapped_column(String(256), nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 自定义 / OpenAI 兼容端点；预设提供商可为空
    llm_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    trips: Mapped[list["Trip"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    collaborations: Mapped[list["TripCollaborator"]] = relationship(
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
    # 小红书/携程参考 {xiaohongshu: [...], ctrip: [...]}
    external_refs: Mapped[dict] = mapped_column(
        JSON, default=lambda: {"xiaohongshu": [], "ctrip": []}, nullable=False
    )
    # 携程酒店现爬状态：ok / amap_only
    hotel_fetch_status: Mapped[str] = mapped_column(
        String(16), default="amap_only", nullable=False
    )
    # 携程酒店候选精简列表 [{name, url, score, tags, ...}]
    hotel_candidates: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    # generating / ready / failed
    status: Mapped[str] = mapped_column(String(16), default="generating", nullable=False)
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 分享 token：只读或协作
    share_token: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    # read = 匿名只读；collab = 登录后可共同编辑
    share_mode: Mapped[str] = mapped_column(String(16), default="read", nullable=False)
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
    collaborator_links: Mapped[list["TripCollaborator"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    members: Mapped[list["TripMember"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    expenses: Mapped[list["Expense"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class TripCollaborator(Base):
    """攻略协作者（登录用户加入协作链接后写入）。"""

    __tablename__ = "trip_collaborators"
    __table_args__ = (
        UniqueConstraint("trip_id", "user_id", name="uq_trip_collaborator"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    trip: Mapped["Trip"] = relationship(back_populates="collaborator_links")
    user: Mapped["User"] = relationship(back_populates="collaborations")


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


class TripMember(Base):
    """同行人（AA 分账参与者）。

    is_owner=True 的行自动随行程创建（懒创建），对应行程创建者；其余为
    手动添加的同行人，可关联登录账号（user_id）或仅填姓名。
    """

    __tablename__ = "trip_members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    # 关联登录账号（owner / 加入协作的登录用户）；纯姓名同行人为 None
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_owner: Mapped[bool] = mapped_column(default=False, nullable=False)
    # 头像底色（前端分配，如 "#FF8A65"）
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )

    trip: Mapped["Trip"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()


class Expense(Base):
    """一笔共同消费（AA 分账明细）。

    paid_by_member_id 为付款人；amount 为总金额；分摊由 ExpenseSplit 记录
    （amount 为空表示与其它均摊项平分剩余）。
    """

    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_by_member_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trip_members.id"), nullable=False, index=True
    )
    paid_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )

    trip: Mapped["Trip"] = relationship(back_populates="expenses")
    payer: Mapped["TripMember"] = relationship()
    splits: Mapped[list["ExpenseSplit"]] = relationship(
        back_populates="expense", cascade="all, delete-orphan"
    )


class ExpenseSplit(Base):
    """一笔消费的分摊：member_id 分摊 amount（None=均摊）。"""

    __tablename__ = "expense_splits"
    __table_args__ = (
        UniqueConstraint("expense_id", "member_id", name="uq_expense_split"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    expense_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trip_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # None = 与其它均摊项平分剩余金额
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)

    expense: Mapped["Expense"] = relationship(back_populates="splits")
    member: Mapped["TripMember"] = relationship()


class TripGenerationCache(Base):
    """同词条生成结果缓存（按玩法指纹，不绑定具体用户/日期）。"""

    __tablename__ = "trip_generation_cache"

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    destination: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    days_count: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
        nullable=False,
    )
