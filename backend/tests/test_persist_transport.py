"""transport_to_next 应写在上一站，指向下一站。"""
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models import Day, Item
from app.services.generator import GuideGenerator


def test_persist_day_assigns_transport_to_previous_item():
    gen = GuideGenerator.__new__(GuideGenerator)
    trip = SimpleNamespace(
        id="trip-1",
        destination="杭州",
        start_date=date(2026, 7, 1),
    )
    plan = {
        "day_index": 1,
        "summary": "测试",
        "items": [
            {
                "time_slot": "morning",
                "type": "attraction",
                "name": "西湖",
                "duration_min": 120,
                "location": {"lng": 120.15, "lat": 30.25, "address": ""},
            },
            {
                "time_slot": "afternoon",
                "type": "attraction",
                "name": "灵隐寺",
                "duration_min": 90,
                "location": {"lng": 120.10, "lat": 30.24, "address": ""},
            },
            {
                "time_slot": "evening",
                "type": "meal",
                "name": "河坊街",
                "duration_min": 60,
                "location": {"lng": 120.17, "lat": 30.24, "address": ""},
            },
        ],
    }

    added: list = []

    def add(obj):
        added.append(obj)

    db = MagicMock()
    db.add.side_effect = add
    db.flush.side_effect = lambda: None

    gen._persist_day(trip, plan, db, "杭州")

    items = [o for o in added if isinstance(o, Item)]
    assert len(items) == 3
    assert items[0].name == "西湖"
    assert items[0].transport_to_next is not None
    assert items[0].transport_to_next["distance_m"] > 0
    assert items[0].transport_to_next["to_location"]["name"] == "灵隐寺"

    assert items[1].name == "灵隐寺"
    assert items[1].transport_to_next is not None
    assert items[1].transport_to_next["to_location"]["name"] == "河坊街"

    # 当天最后一站不应有前往下一站
    assert items[2].name == "河坊街"
    assert items[2].transport_to_next is None

    days = [o for o in added if isinstance(o, Day)]
    assert len(days) == 1


def test_persist_day_skips_leg_when_coords_missing():
    gen = GuideGenerator.__new__(GuideGenerator)
    trip = SimpleNamespace(
        id="trip-2",
        destination="杭州",
        start_date=date(2026, 7, 1),
    )
    plan = {
        "day_index": 1,
        "summary": "测试",
        "items": [
            {
                "time_slot": "morning",
                "type": "attraction",
                "name": "A",
                "duration_min": 60,
                "location": {"lng": 120.15, "lat": 30.25},
            },
            {
                "time_slot": "afternoon",
                "type": "attraction",
                "name": "B无坐标",
                "duration_min": 60,
                "location": None,
            },
            {
                "time_slot": "evening",
                "type": "attraction",
                "name": "C",
                "duration_min": 60,
                "location": {"lng": 120.17, "lat": 30.24},
            },
        ],
    }
    added: list = []
    db = MagicMock()
    db.add.side_effect = added.append
    db.flush.side_effect = lambda: None

    gen._persist_day(trip, plan, db, "杭州")
    items = [o for o in added if isinstance(o, Item)]
    assert items[0].transport_to_next is None  # 下一站无坐标
    assert items[1].transport_to_next is None  # 自身无坐标，无法作为起点
    assert items[2].transport_to_next is None
