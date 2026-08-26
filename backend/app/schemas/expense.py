"""AA 分账相关 schemas：同行人 / 费用 / 分摊 / 结算结果。"""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class TripMemberOut(BaseModel):
    id: str
    name: str
    user_id: str | None = None
    is_owner: bool = False
    color: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TripMemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class TripMemberUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class ExpenseSplitOut(BaseModel):
    member_id: str
    member_name: str
    color: str | None = None
    # None=均摊，否则为自定义分摊金额
    amount: float | None = None


class ExpenseOut(BaseModel):
    id: str
    trip_id: str
    title: str
    amount: float
    paid_by_member_id: str
    paid_by_name: str
    paid_by_color: str | None = None
    paid_at: date | None = None
    splits: list[ExpenseSplitOut] = []


class ExpenseSplitInput(BaseModel):
    member_id: str
    # None=均摊，否则为自定义分摊金额
    amount: float | None = None


class ExpenseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    amount: float = Field(gt=0)
    paid_by_member_id: str
    paid_at: date | None = None
    splits: list[ExpenseSplitInput] = Field(min_length=1)


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=128)
    amount: float | None = Field(default=None, gt=0)
    paid_by_member_id: str | None = None
    paid_at: date | None = None
    splits: list[ExpenseSplitInput] | None = None


class SettlementBalance(BaseModel):
    member_id: str
    name: str
    color: str | None = None
    # 正=被欠（别人欠你），负=欠别人
    balance: float


class SettlementFlow(BaseModel):
    from_member_id: str
    from_name: str
    from_color: str | None = None
    to_member_id: str
    to_name: str
    to_color: str | None = None
    amount: float


class SettlementData(BaseModel):
    """结算结果：net balances + 最少转账方案（flows）。"""

    currency: Literal["CNY"] = "CNY"
    balances: list[SettlementBalance]
    flows: list[SettlementFlow]
