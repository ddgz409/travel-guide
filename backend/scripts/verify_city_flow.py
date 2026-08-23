"""验证新增的三个端点（添加城市 / 删除城市 / AI 重排路线）的核心逻辑。

使用内存 SQLite + 模拟高德（无网络），直接调用 trips.py 中的路由函数。
运行：cd backend && python scripts/verify_city_flow.py
"""
import os
import sys
from datetime import date, timedelta
from types import SimpleNamespace

# 让脚本可独立运行（backend 目录为工作目录）
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models import Day, Item, Trip, User
from app.schemas.trip import CityAddRequest
from app.services.generator import GuideGenerator
import app.api.trips as trips


def make_engine():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    return engine


def seed_trip(db):
    user = User(id="user-1", username="tester", password_hash="x")
    db.add(user)
    cities = ["西宁", "茶卡", "大柴旦", "敦煌"]
    trip = Trip(
        id="trip-1",
        user_id="user-1",
        title="西宁·茶卡·大柴旦·敦煌 4日游",
        destination="青甘环线",
        route=cities,
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 4),
        travelers=2,
        status="ready",
        preferences={},
    )
    db.add(trip)
    db.flush()
    # 每个城市一天，含两个带坐标的景点
    for i, city in enumerate(cities):
        day = Day(
            trip_id=trip.id,
            day_index=i + 1,
            date=date(2026, 9, 1) + timedelta(days=i),
            city=city,
            summary=f"在 {city} 的活动",
        )
        db.add(day)
        db.flush()
        for j, name in enumerate([f"{city}景点A", f"{city}景点B"]):
            db.add(
                Item(
                    day_id=day.id,
                    seq=j,
                    time_slot="morning" if j == 0 else "afternoon",
                    type="attraction",
                    name=name,
                    location={"lng": 100.0 + i + j * 0.1, "lat": 36.0 + i + j * 0.1, "name": name},
                    duration_min=90,
                    cost=0,
                    rating=None,
                    selected=True,
                    alternatives=[],
                )
            )
    db.commit()
    return trip


def fake_geo(name: str):
    """按名称确定性生成坐标，避免同城景点全部重合。"""
    h = abs(hash(name)) % 1000
    return SimpleNamespace(
        lng=100.0 + (h % 50) / 10.0,
        lat=36.0 + (h % 40) / 10.0,
        city=None,
        adcode=None,
        formatted=name,
        level=None,
    )


def setup_mocks(monkeypatch):
    monkeypatch.setattr(
        trips, "check_route_city",
        lambda raw: SimpleNamespace(valid=True, message="", resolved_name=raw.strip()),
    )
    monkeypatch.setattr(
        trips, "resolve_landmarks",
        lambda city, amap, limit=8: ["莫高窟", "鸣沙山", "月牙泉", "雅丹"][:limit],
    )
    fake_client = SimpleNamespace(geocode=fake_geo, plan_route=lambda *a, **k: None)
    monkeypatch.setattr(trips, "get_amap_client", lambda: fake_client)

    def fake_replan(day, db, trip):
        # 无网络：仅清空交通缓存并提交
        for it in (day.items or []):
            it.transport_to_next = None
        db.commit()

    monkeypatch.setattr(trips, "_replan_day_transport", fake_replan)
    # 重排使用真实的最近邻算法（纯函数，无网络）
    gen = GuideGenerator.__new__(GuideGenerator)
    monkeypatch.setattr(trips, "get_generator", lambda: gen)


class Patch:
    def __init__(self):
        self._saved = {}

    def setattr(self, obj, name, value):
        self._saved[(id(obj), name)] = getattr(obj, name, None)
        setattr(obj, name, value)

    def restore(self):
        for (oid, name), old in self._saved.items():
            # 简易恢复：按模块对象查找
            pass


def main():
    engine = make_engine()
    Session = sessionmaker(bind=engine)
    db = Session()

    # 打补丁（保存原值用于恢复）
    saved = {
        "check_route_city": trips.check_route_city,
        "resolve_landmarks": trips.resolve_landmarks,
        "get_amap_client": trips.get_amap_client,
        "_replan_day_transport": trips._replan_day_transport,
        "get_generator": trips.get_generator,
    }
    setup_mocks(Patch())

    trip = seed_trip(db)
    current = SimpleNamespace(id="user-1")
    ok = True

    def check(cond, msg):
        nonlocal ok
        if cond:
            print(f"  ✓ {msg}")
        else:
            ok = False
            print(f"  ✗ FAIL: {msg}")

    print("== 添加城市：中间插入 张掖 到第 3 天 ==")
    trips.add_city(trip.id, CityAddRequest(city="张掖", position=3), current=current, db=db)
    db.refresh(trip)
    days = sorted(db.scalars(select(Day).where(Day.trip_id == trip.id)).all(), key=lambda d: d.day_index)
    check(len(days) == 5, "天数 4 → 5")
    check(trip.end_date == date(2026, 9, 5), f"end_date 延长 1 天 → {trip.end_date}")
    check([d.day_index for d in days] == [1, 2, 3, 4, 5], "day_index 连续 1..5")
    check(trip.route == ["西宁", "茶卡", "张掖", "大柴旦", "敦煌"], f"route={trip.route}")
    new_day = days[2]
    check(new_day.city == "张掖", f"第 3 天城市 = {new_day.city}")
    check(new_day.date == date(2026, 9, 3), f"第 3 天日期 = {new_day.date}")
    items = sorted(new_day.items, key=lambda it: it.seq)
    spots = [it for it in items if it.type != "transport"]
    check(len(spots) >= 3, f"新天有景点 {len(spots)} 个")
    check(all(it.location and it.location.get("lng") for it in spots), "景点带坐标")
    check(items[0].type == "transport" and items[0].location is None, "新天头部有跨城交通条目")
    check(items[0].name == "前往 张掖" and "茶卡" in (items[0].description or ""), "跨城条目指向上一城")
    # 末尾追加：张掖 到末尾
    trips.add_city(trip.id, CityAddRequest(city="兰州", position=99), current=current, db=db)
    db.refresh(trip)
    days = sorted(db.scalars(select(Day).where(Day.trip_id == trip.id)).all(), key=lambda d: d.day_index)
    check(len(days) == 6, "末尾追加后天数 → 6")
    check(days[-1].city == "兰州", f"末尾天城市 = {days[-1].city}")
    check(trip.route[-1] == "兰州", f"route 末尾 = {trip.route[-1]}")

    print("== 删除城市：删除 张掖 ==")
    trips.delete_city(trip.id, "张掖", current=current, db=db)
    db.refresh(trip)
    days = sorted(db.scalars(select(Day).where(Day.trip_id == trip.id)).all(), key=lambda d: d.day_index)
    check(len(days) == 5, "删除张掖后天数 → 5")
    check([d.day_index for d in days] == [1, 2, 3, 4, 5], "day_index 重新连续")
    check(all(d.city != "张掖" for d in days), "无张掖天")
    check(trip.route == ["西宁", "茶卡", "大柴旦", "敦煌", "兰州"], f"route 移除张掖 = {trip.route}")
    check(trip.end_date == date(2026, 9, 5), f"删除 1 天后 end_date = {trip.end_date}")

    print("== 删除城市：重复城市（西宁 出现两次，一并删除）==")
    trips.delete_city(trip.id, "兰州", current=current, db=db)
    # 先造一个重复：西宁 route 里加一次，再造一个西宁天
    trip.route = ["西宁", "西宁", "茶卡", "大柴旦", "敦煌"]
    extra = Day(
        trip_id=trip.id, day_index=1, date=trip.start_date,
        city="西宁", summary="西宁（重复）",
    )
    db.add(extra)
    db.flush()
    db.add(Item(day_id=extra.id, seq=0, time_slot="morning", type="attraction",
                name="西宁重景", location={"lng": 101.0, "lat": 36.6}, duration_min=90,
                cost=0, rating=None, selected=True, alternatives=[]))
    db.commit()
    trip.end_date = date(2026, 9, 6)
    db.commit()
    trips.delete_city(trip.id, "西宁", current=current, db=db)
    db.refresh(trip)
    days = sorted(db.scalars(select(Day).where(Day.trip_id == trip.id)).all(), key=lambda d: d.day_index)
    check(all(d.city != "西宁" for d in days), "重复西宁的两天都被删除")
    check("西宁" not in (trip.route or []), f"route 中移除所有西宁 = {trip.route}")
    check([d.day_index for d in days] == list(range(1, len(days) + 1)), "删除重复后天序号连续")

    print("== AI 重排：按坐标最近邻重排某天 ==")
    # 造一天：输入顺序故意不优（近点后紧接远点）。算法以首个输入为起点做贪心最近邻。
    rp_day = Day(trip_id=trip.id, day_index=1, date=trip.start_date, city="西宁", summary="重排测试")
    db.add(rp_day)
    db.flush()
    pts = [
        ("近点A", {"lng": 101.0, "lat": 36.5}),
        ("远点", {"lng": 104.0, "lat": 39.0}),
        ("近点B", {"lng": 101.1, "lat": 36.6}),
        ("中点点", {"lng": 102.0, "lat": 37.0}),
    ]
    for seq, (name, loc) in enumerate(pts):
        db.add(Item(day_id=rp_day.id, seq=seq, time_slot="morning", type="attraction",
                    name=name, location={**loc, "name": name}, duration_min=90, cost=0,
                    rating=None, selected=True, alternatives=[]))
    db.commit()
    before = [it.name for it in sorted(rp_day.items, key=lambda it: it.seq)]
    trips.replan_day(trip.id, rp_day.id, current=current, db=db)
    db.refresh(rp_day)
    after = [it.name for it in sorted(rp_day.items, key=lambda it: it.seq)]
    check(sorted(after) == sorted(before), f"重排后景点集合不变 {after}")
    check(after != before, f"顺序发生变化 {before} → {after}")
    # 起点近点A 不变，之后按最近邻：近点B → 中点点 → 远点
    check(after == ["近点A", "近点B", "中点点", "远点"], f"贪心最近邻顺序正确：{after}")

    # 恢复补丁（保证脚本可重复运行/不污染其他测试）
    for name, old in saved.items():
        setattr(trips, name, old)

    db.close()
    print()
    print("全部通过！" if ok else "存在失败项")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
