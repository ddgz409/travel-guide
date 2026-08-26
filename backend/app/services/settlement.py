"""AA 分账结算算法。

核心思想（与 TREK 一致）：
- 每笔费用：付款人 balance += 全额；每个分摊人 balance -= 其分摊额。
- 得到每个人的净余额：正 = 被欠（别人欠你），负 = 欠别人。
- 贪心匹配债务人与债权人，生成"最少转账"方案（flows）。
"""
from __future__ import annotations

from collections.abc import Iterable

from app.models import Expense, ExpenseSplit, TripMember

_EPS = 0.005  # 1 分钱以内视为已结清（浮点容差）


def _split_amounts(total: float, splits: Iterable[ExpenseSplit]) -> dict[str, float]:
    """把一笔消费拆成 {member_id: 金额}。

    - amount 为空的项表示"均摊"：与其它均摊项平分剩余金额。
    - 均摊保留 2 位小数，最后一位补差额，保证总和精确等于 total。
    """
    splits = list(splits)
    if not splits:
        return {}
    custom: dict[str, float] = {
        s.member_id: round(s.amount, 2) for s in splits if s.amount is not None
    }
    equal_ids = [s.member_id for s in splits if s.amount is None]
    if not equal_ids:
        return custom

    remaining = total - sum(custom.values())
    if remaining <= 0:
        # 自定义已超总额：按自定义金额结算，均摊项记 0
        return custom

    n = len(equal_ids)
    per = round(remaining / n, 2)
    result = dict(custom)
    for i, mid in enumerate(equal_ids):
        if i == n - 1:
            result[mid] = round(remaining - per * (n - 1), 2)
        else:
            result[mid] = per
    return result


def calculate_settlement(
    members: Iterable[TripMember],
    expenses: Iterable[Expense],
) -> tuple[list[dict], list[dict]]:
    """返回 (balances, flows)。

    balance: {member_id, name, color, balance}  正=被欠，负=欠别人
    flow:    {from_member_id, from_name, to_member_id, to_name, amount}
    """
    members = list(members)
    member_info = {m.id: m for m in members}

    balances: dict[str, float] = {m.id: 0.0 for m in members}
    for exp in expenses:
        payer_id = exp.paid_by_member_id
        if payer_id not in balances:
            continue
        amounts = _split_amounts(exp.amount, exp.splits or [])
        if not amounts:
            continue
        balances[payer_id] += exp.amount
        for mid, amt in amounts.items():
            if mid in balances:
                balances[mid] -= amt

    # 净余额（按金额降序），正=债权人，负=债务人
    people = [mid for mid, b in balances.items() if abs(b) > _EPS]
    people.sort(key=lambda mid: -balances[mid])

    debtors = [(mid, -balances[mid]) for mid in people if balances[mid] < -_EPS]
    creditors = [(mid, balances[mid]) for mid in people if balances[mid] > _EPS]

    flows: list[dict] = []
    di = ci = 0
    while di < len(debtors) and ci < len(creditors):
        amount = min(debtors[di][1], creditors[ci][1])
        if amount > _EPS:
            fm = member_info.get(debtors[di][0])
            tm = member_info.get(creditors[ci][0])
            if fm is not None and tm is not None:
                flows.append(
                    {
                        "from_member_id": fm.id,
                        "from_name": fm.name,
                        "from_color": fm.color,
                        "to_member_id": tm.id,
                        "to_name": tm.name,
                        "to_color": tm.color,
                        "amount": round(amount, 2),
                    }
                )
        debtors[di] = (debtors[di][0], debtors[di][1] - amount)
        creditors[ci] = (creditors[ci][0], creditors[ci][1] - amount)
        if debtors[di][1] < _EPS:
            di += 1
        if creditors[ci][1] < _EPS:
            ci += 1

    balances_out = [
        {
            "member_id": m.id,
            "name": m.name,
            "color": m.color,
            "balance": round(balances[m.id], 2),
        }
        for m in members
    ]
    return balances_out, flows
