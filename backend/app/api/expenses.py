"""AA 分账路由：同行人管理 / 费用记账 / 结算结果。

访问控制与 trips 模块一致：
- 读（members / expenses / settlement）：可访问该攻略（主人/协作者/游客本人）
- 写：可编辑该攻略（主人/协作者），游客需登录后协作编辑
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.trips import (
    GUEST_USER_ID,
    _can_edit_trip,
    _is_collaborator,
    _require_edit,
)
from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models import Expense, ExpenseSplit, Trip, TripMember, User
from app.schemas import (
    ExpenseCreate,
    ExpenseOut,
    ExpenseSplitInput,
    ExpenseSplitOut,
    ExpenseUpdate,
    SettlementData,
    TripMemberCreate,
    TripMemberOut,
    TripMemberUpdate,
)
from app.services.settlement import _split_amounts, calculate_settlement

router = APIRouter(prefix="/trips", tags=["AA 分账"])

# 同行人头像底色（按加入顺序循环分配）
MEMBER_COLORS = [
    "#FF8A65", "#64B5F6", "#81C784", "#FFD54F",
    "#BA68C8", "#4DB6AC", "#F06292", "#A1887F",
]


def _ensure_owner_member(trip: Trip, db: Session) -> TripMember:
    """确保该攻略存在 is_owner 的同行人（懒创建，兼容所有建行程路径）。"""
    owner = db.scalar(
        select(TripMember).where(
            TripMember.trip_id == trip.id,
            TripMember.is_owner.is_(True),
        )
    )
    if owner is not None:
        return owner
    owner_user = db.get(User, trip.user_id)
    owner_name = (owner_user.username if owner_user else None) or "我"
    owner = TripMember(
        trip_id=trip.id,
        name=owner_name,
        user_id=trip.user_id,
        is_owner=True,
        color=MEMBER_COLORS[0],
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


def _viewable_trip(trip_id: str, db: Session, user: User | None) -> Trip:
    """分账数据读取：主人/协作者可读；匿名仅限游客本人的行程。

    比 trips 的 _trip_for_viewer 更严格——分账含"谁欠谁多少钱"的隐私数据，
    不允许任意匿名访问。
    """
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=404, detail="攻略不存在")
    if user is None:
        if trip.user_id == GUEST_USER_ID:
            return trip
        raise HTTPException(status_code=404, detail="攻略不存在")
    if trip.user_id == user.id or _is_collaborator(trip.id, user.id, db):
        return trip
    raise HTTPException(status_code=404, detail="攻略不存在")


def _member_or_404(member_id: str, trip: Trip, db: Session) -> TripMember:
    member = db.get(TripMember, member_id)
    if member is None or member.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="同行人不存在")
    return member


def _expense_or_404(expense_id: str, trip: Trip, db: Session) -> Expense:
    exp = db.get(Expense, expense_id)
    if exp is None or exp.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="费用记录不存在")
    return exp


def _expense_out(exp: Expense, db: Session) -> ExpenseOut:
    payer = db.get(TripMember, exp.paid_by_member_id)
    splits: list[ExpenseSplitOut] = []
    for s in exp.splits or []:
        m = db.get(TripMember, s.member_id)
        splits.append(
            ExpenseSplitOut(
                member_id=s.member_id,
                member_name=m.name if m else "已删除",
                color=m.color if m else None,
                amount=round(s.amount, 2) if s.amount is not None else None,
            )
        )
    return ExpenseOut(
        id=exp.id,
        trip_id=exp.trip_id,
        title=exp.title,
        amount=round(exp.amount, 2),
        paid_by_member_id=exp.paid_by_member_id,
        paid_by_name=payer.name if payer else "",
        paid_by_color=payer.color if payer else None,
        paid_at=exp.paid_at,
        splits=splits,
    )


def _member_out(m: TripMember) -> TripMemberOut:
    return TripMemberOut.model_validate(m)


def _replace_splits(exp: Expense, splits: list[ExpenseSplitInput], db: Session) -> None:
    """整组替换分摊记录；amount=None 表示均摊。"""
    member_ids = {s.member_id for s in splits}
    # 校验成员都属于本攻略，且不包含付款人自身以外的非法项
    for mid in member_ids:
        m = db.get(TripMember, mid)
        if m is None or m.trip_id != exp.trip_id:
            raise HTTPException(status_code=400, detail="分摊成员不属于本攻略")
    exp.splits.clear()
    for s in splits:
        exp.splits.append(
            ExpenseSplit(
                expense_id=exp.id,
                member_id=s.member_id,
                amount=round(s.amount, 2) if s.amount is not None else None,
            )
        )
    db.flush()


# ── 同行人 ────────────────────────────────────────────────────────────────

@router.get("/{trip_id}/members", response_model=list[TripMemberOut])
def list_members(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _viewable_trip(trip_id, db, current)
    _ensure_owner_member(trip, db)
    rows = db.scalars(
        select(TripMember)
        .where(TripMember.trip_id == trip.id)
        .order_by(TripMember.is_owner.desc(), TripMember.created_at)
    ).all()
    return [_member_out(m) for m in rows]


@router.post(
    "/{trip_id}/members",
    response_model=TripMemberOut,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    trip_id: str,
    payload: TripMemberCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, current)
    _ensure_owner_member(trip, db)
    # 颜色按现有成员数轮转
    n = len(db.scalars(
        select(TripMember.id).where(TripMember.trip_id == trip.id)
    ).all())
    member = TripMember(
        trip_id=trip.id,
        name=payload.name.strip(),
        color=MEMBER_COLORS[n % len(MEMBER_COLORS)],
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.put("/{trip_id}/members/{member_id}", response_model=TripMemberOut)
def rename_member(
    trip_id: str,
    member_id: str,
    payload: TripMemberUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, current)
    member = _member_or_404(member_id, trip, db)
    member.name = payload.name.strip()
    db.commit()
    db.refresh(member)
    return _member_out(member)


@router.delete("/{trip_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    trip_id: str,
    member_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, current)
    member = _member_or_404(member_id, trip, db)
    if member.is_owner:
        raise HTTPException(status_code=400, detail="不能删除创建者本人")
    as_payer = db.scalar(
        select(Expense.id).where(Expense.paid_by_member_id == member.id)
    )
    if as_payer is not None:
        raise HTTPException(
            status_code=400,
            detail=f"「{member.name}」有付款记录，请先改掉对应费用的付款人",
        )
    db.delete(member)
    db.commit()


# ── 费用 ──────────────────────────────────────────────────────────────────

@router.get("/{trip_id}/expenses", response_model=list[ExpenseOut])
def list_expenses(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _viewable_trip(trip_id, db, current)
    _ensure_owner_member(trip, db)
    rows = db.scalars(
        select(Expense)
        .where(Expense.trip_id == trip.id)
        .order_by(Expense.paid_at.desc(), Expense.created_at.desc())
    ).all()
    return [_expense_out(exp, db) for exp in rows]


@router.post(
    "/{trip_id}/expenses",
    response_model=ExpenseOut,
    status_code=status.HTTP_201_CREATED,
)
def add_expense(
    trip_id: str,
    payload: ExpenseCreate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, current)
    _ensure_owner_member(trip, db)
    payer = _member_or_404(payload.paid_by_member_id, trip, db)
    if payer.id not in {s.member_id for s in payload.splits}:
        raise HTTPException(status_code=400, detail="付款人也应加入分摊名单")
    exp = Expense(
        trip_id=trip.id,
        title=payload.title.strip(),
        amount=round(payload.amount, 2),
        paid_by_member_id=payer.id,
        paid_at=payload.paid_at,
        created_by=current.id,
    )
    db.add(exp)
    db.flush()
    _replace_splits(exp, payload.splits, db)
    db.commit()
    db.refresh(exp)
    return _expense_out(exp, db)


@router.put("/{trip_id}/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    trip_id: str,
    expense_id: str,
    payload: ExpenseUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, current)
    exp = _expense_or_404(expense_id, trip, db)
    if payload.title is not None:
        exp.title = payload.title.strip()
    if payload.amount is not None:
        exp.amount = round(payload.amount, 2)
    if payload.paid_by_member_id is not None:
        payer = _member_or_404(payload.paid_by_member_id, trip, db)
        exp.paid_by_member_id = payer.id
    if payload.paid_at is not None:
        exp.paid_at = payload.paid_at
    if payload.splits is not None:
        _replace_splits(exp, payload.splits, db)
    db.commit()
    db.refresh(exp)
    return _expense_out(exp, db)


@router.delete(
    "/{trip_id}/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_expense(
    trip_id: str,
    expense_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trip = _require_edit(trip_id, db, current)
    exp = _expense_or_404(expense_id, trip, db)
    db.delete(exp)
    db.commit()


# ── 结算 ──────────────────────────────────────────────────────────────────

@router.get("/{trip_id}/settlement", response_model=SettlementData)
def get_settlement(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    trip = _viewable_trip(trip_id, db, current)
    _ensure_owner_member(trip, db)
    members = db.scalars(
        select(TripMember).where(TripMember.trip_id == trip.id)
    ).all()
    expenses = db.scalars(
        select(Expense).where(Expense.trip_id == trip.id)
    ).all()
    # 显式加载 splits，避免懒加载在 session 关闭后失效
    if expenses:
        db.scalars(
            select(ExpenseSplit).where(
                ExpenseSplit.expense_id.in_([e.id for e in expenses])
            )
        ).all()
    balances, flows = calculate_settlement(members, expenses)
    return SettlementData(balances=balances, flows=flows)
