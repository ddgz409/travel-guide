"""AA 分账：同行人管理、记账、结算方案。

补齐 cyy「增加了AA分账功能」提交缺失的后端实现。
路由前缀与共享客户端 packages/shared/src/api.ts 的 trips.split.* 一一对应。
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_optional_user
from app.models import (
    Trip,
    TripSplitExpense,
    TripSplitExpenseShare,
    TripSplitMember,
    User,
)
from app.models import TripCollaborator

logger = logging.getLogger(__name__)

GUEST_USER_ID = "00000000-0000-0000-0000-000000000000"

router = APIRouter(tags=["AA分账"])

# 成员头像圆点色板
PALETTE = [
    "#4CAF50", "#FF9800", "#2196F3", "#E91E63", "#9C27B0",
    "#00BCD4", "#FFC107", "#795548", "#607D8B", "#8BC34A",
]


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class MemberRename(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class ShareIn(BaseModel):
    member_id: str
    amount: float | None = None


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=128)
    amount: float = Field(gt=0)
    paid_by_member_id: str
    paid_at: str | None = None
    splits: list[ShareIn] = Field(min_length=1)


def _is_collaborator(trip_id: str, user_id: str, db: Session) -> bool:
    return (
        db.scalar(
            select(TripCollaborator.id).where(
                TripCollaborator.trip_id == trip_id,
                TripCollaborator.user_id == user_id,
            )
        )
        is not None
    )


def _trip_for_viewer(trip_id: str, db: Session, user: User | None) -> Trip:
    """主人/协作者/匿名（游客）可看；其他人 404。"""
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="攻略不存在")
    if user is None:
        return trip
    if trip.user_id == user.id or _is_collaborator(trip.id, user.id, db):
        return trip
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="攻略不存在")


def _can_edit_trip(trip: Trip, user: User | None, db: Session) -> bool:
    if user is None:
        return trip.user_id == GUEST_USER_ID
    if trip.user_id == user.id:
        return True
    return _is_collaborator(trip.id, user.id, db)


def _require_edit(trip_id: str, db: Session, user: User | None) -> Trip:
    trip = _trip_for_viewer(trip_id, db, user)
    if not _can_edit_trip(trip, user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有编辑权限")
    return trip


def _list_members(db: Session, trip_id: str) -> list[TripSplitMember]:
    return list(
        db.scalars(
            select(TripSplitMember)
            .where(TripSplitMember.trip_id == trip_id)
            .order_by(TripSplitMember.created_at, TripSplitMember.id)
        )
    )


def _ensure_owner_member(db: Session, trip: Trip) -> None:
    """首次使用时自动把行程创建者登记为第一位同行人。"""
    if _list_members(db, trip.id):
        return
    owner_user = db.get(User, trip.user_id)
    name = "我"
    if owner_user and owner_user.username and owner_user.username != "guest":
        name = owner_user.username[:64]
    db.add(
        TripSplitMember(
            trip_id=trip.id,
            user_id=trip.user_id,
            name=name,
            color=PALETTE[0],
            is_owner=True,
        )
    )
    db.commit()


def _member_payload(m: TripSplitMember) -> dict[str, Any]:
    return {
        "id": m.id,
        "user_id": m.user_id,
        "name": m.name,
        "color": m.color,
        "is_owner": m.is_owner,
    }


def _expense_payload(db: Session, e: TripSplitExpense) -> dict[str, Any]:
    payer = e.paid_by_member

    def _member(mid: str) -> TripSplitMember | None:
        m = db.get(TripSplitMember, mid)
        return m if (m is not None and m.trip_id == e.trip_id) else None

    payer_name = payer.name if payer else ""
    payer_color = payer.color if payer else "#9E9E9E"
    return {
        "id": e.id,
        "title": e.title,
        "amount": round(float(e.amount), 2),
        "paid_by_member_id": e.paid_by_member_id,
        "paid_at": e.paid_at.isoformat() if e.paid_at else None,
        "paid_by_name": payer_name,
        "paid_by_color": payer_color,
        "splits": [
            {
                "member_id": s.member_id,
                "amount": round(float(s.amount), 2) if s.amount is not None else None,
                "member_name": (_member(s.member_id).name if _member(s.member_id) else "已移除成员"),
                "color": (_member(s.member_id).color if _member(s.member_id) else "#9E9E9E"),
            }
            for s in e.shares
        ],
    }


def _parse_paid_at(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.get("/trips/{trip_id}/split/members")
def list_members(
    trip_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """同行人列表（首次访问自动登记行程创建者）。"""
    trip = _trip_for_viewer(trip_id, db, user)
    _ensure_owner_member(db, trip)
    return [_member_payload(m) for m in _list_members(db, trip.id)]


@router.post("/trips/{trip_id}/split/members")
def add_member(
    trip_id: str,
    payload: MemberCreate,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, user)
    members = _list_members(db, trip.id)
    member = TripSplitMember(
        trip_id=trip.id,
        user_id=None,
        name=payload.name.strip(),
        color=PALETTE[len(members) % len(PALETTE)],
        is_owner=False,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _member_payload(member)


@router.patch("/trips/{trip_id}/split/members/{member_id}")
def rename_member(
    trip_id: str,
    member_id: str,
    payload: MemberRename,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, user)
    member = db.get(TripSplitMember, member_id)
    if member is None or member.trip_id != trip.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")
    member.name = payload.name.strip()
    db.commit()
    return _member_payload(member)


@router.delete("/trips/{trip_id}/split/members/{member_id}")
def remove_member(
    trip_id: str,
    member_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, user)
    member = db.get(TripSplitMember, member_id)
    if member is None or member.trip_id != trip.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="成员不存在")
    # 有垫付记录的成员不能删，避免账目悬空
    paid = db.scalar(
        select(TripSplitExpense.id).where(TripSplitExpense.paid_by_member_id == member_id)
    )
    if paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该成员有垫付的账目，请先删除或改掉相关记录",
        )
    # 清掉其分摊明细后删除
    for share in db.scalars(
        select(TripSplitExpenseShare).where(TripSplitExpenseShare.member_id == member_id)
    ):
        db.delete(share)
    db.delete(member)
    db.commit()
    return {"ok": True}


def _load_expenses(db: Session, trip_id: str) -> list[TripSplitExpense]:
    return list(
        db.scalars(
            select(TripSplitExpense)
            .where(TripSplitExpense.trip_id == trip_id)
            .order_by(TripSplitExpense.created_at, TripSplitExpense.id)
        )
    )


def _apply_expense_input(
    db: Session,
    expense: TripSplitExpense,
    payload: ExpenseIn,
    member_ids: set[str],
) -> None:
    if payload.paid_by_member_id not in member_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="付款人不在同行人列表")
    split_ids = {s.member_id for s in payload.splits}
    unknown = split_ids - member_ids
    if unknown:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分摊人不在同行人列表")
    expense.title = payload.title.strip()
    expense.amount = round(payload.amount, 2)
    expense.paid_by_member_id = payload.paid_by_member_id
    expense.paid_at = _parse_paid_at(payload.paid_at)
    expense.shares.clear()
    for s in payload.splits:
        amount = round(s.amount, 2) if s.amount is not None else None
        if amount is not None and amount < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分摊金额不能为负")
        expense.shares.append(
            TripSplitExpenseShare(member_id=s.member_id, amount=amount)
        )


@router.get("/trips/{trip_id}/split/expenses")
def list_expenses(
    trip_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _trip_for_viewer(trip_id, db, user)
    _ensure_owner_member(db, trip)
    return [_expense_payload(db, e) for e in _load_expenses(db, trip.id)]


@router.post("/trips/{trip_id}/split/expenses")
def add_expense(
    trip_id: str,
    payload: ExpenseIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, user)
    member_ids = {m.id for m in _list_members(db, trip.id)}
    expense = TripSplitExpense(trip_id=trip.id, title="", amount=0, paid_by_member_id="")
    _apply_expense_input(db, expense, payload, member_ids)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return _expense_payload(db, expense)


@router.put("/trips/{trip_id}/split/expenses/{expense_id}")
def update_expense(
    trip_id: str,
    expense_id: str,
    payload: ExpenseIn,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, user)
    expense = db.get(TripSplitExpense, expense_id)
    if expense is None or expense.trip_id != trip.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账目不存在")
    member_ids = {m.id for m in _list_members(db, trip.id)}
    _apply_expense_input(db, expense, payload, member_ids)
    db.commit()
    db.refresh(expense)
    return _expense_payload(db, expense)


@router.delete("/trips/{trip_id}/split/expenses/{expense_id}")
def remove_expense(
    trip_id: str,
    expense_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, user)
    expense = db.get(TripSplitExpense, expense_id)
    if expense is None or expense.trip_id != trip.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="账目不存在")
    db.delete(expense)
    db.commit()
    return {"ok": True}


@router.get("/trips/{trip_id}/split/settlement")
def settlement(
    trip_id: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """结算：各成员结余 + 最少转账流（贪心法）。"""
    trip = _trip_for_viewer(trip_id, db, user)
    _ensure_owner_member(db, trip)

    members = _list_members(db, trip.id)
    info = {m.id: m for m in members}

    # 以「分」为单位计算，避免浮点误差
    balance: dict[str, int] = {m.id: 0 for m in members}
    expenses = _load_expenses(db, trip.id)
    for e in expenses:
        amount_cents = int(round(float(e.amount) * 100))
        shares = list(e.shares)
        if not shares:
            continue
        fixed_total = sum(
            int(round(float(s.amount) * 100)) for s in shares if s.amount is not None
        )
        null_members = [s.member_id for s in shares if s.amount is None]
        base = 0
        remainder = 0
        if null_members:
            remaining = amount_cents - fixed_total
            n = len(null_members)
            base = remaining // n
            remainder = remaining - base * n
        elif fixed_total != amount_cents:
            logger.warning(
                "Split shares mismatch expense=%s fixed=%s total=%s",
                e.id,
                fixed_total,
                amount_cents,
            )

        balance[e.paid_by_member_id] = balance.get(e.paid_by_member_id, 0) + amount_cents
        idx = 0
        for s in shares:
            if s.amount is not None:
                cents = int(round(float(s.amount) * 100))
            else:
                cents = base + (1 if idx < remainder else 0)
                idx += 1
            balance[s.member_id] = balance.get(s.member_id, 0) - cents

    def _info(mid: str) -> dict[str, Any]:
        m = info.get(mid)
        return {
            "member_id": mid,
            "name": m.name if m else "已移除成员",
            "color": m.color if m else "#9E9E9E",
        }

    balances_out = sorted(
        ({**_info(mid), "balance": cents / 100.0} for mid, cents in balance.items()),
        key=lambda b: b["balance"],
        reverse=True,
    )

    # 贪心最少转账：最大债权配最大债务
    creditors: list[list[Any]] = sorted(
        ([cents, mid] for mid, cents in balance.items() if cents > 0),
        reverse=True,
    )
    debtors: list[list[Any]] = sorted(
        ([cents, mid] for mid, cents in balance.items() if cents < 0),
    )
    flows_out: list[dict[str, Any]] = []
    ci = di = 0
    while ci < len(debtors) and di < len(creditors):
        debt_mid, debt_cents = debtors[ci][1], -debtors[ci][0]
        credit_mid, credit_cents = creditors[di][1], creditors[di][0]
        pay = min(debt_cents, credit_cents)
        frm, to = _info(debt_mid), _info(credit_mid)
        flows_out.append(
            {
                "from_member_id": debt_mid,
                "from_name": frm["name"],
                "from_color": frm["color"],
                "to_member_id": credit_mid,
                "to_name": to["name"],
                "to_color": to["color"],
                "amount": pay / 100.0,
            }
        )
        debtors[ci][0] += pay
        creditors[di][0] -= pay
        if debtors[ci][0] == 0:
            ci += 1
        if creditors[di][0] == 0:
            di += 1

    return {"balances": balances_out, "flows": flows_out}
