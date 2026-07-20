from app.services.amap_client import Poi
from app.services.generator import GuideGenerator


def _poi(name: str, lng: float, lat: float, kind: str = "hotel") -> Poi:
    return Poi(id=name, name=name, type=kind, lng=lng, lat=lat, address="")


def test_rank_hotels_prefers_near_attractions():
    gen = GuideGenerator.__new__(GuideGenerator)
    anchors = [
        _poi("宽窄巷子", 104.05, 30.67, kind="attraction"),
        _poi("人民公园", 104.06, 30.66, kind="attraction"),
    ]
    near = _poi("近处酒店", 104.055, 30.665)
    far = _poi("远处酒店", 104.20, 30.80)
    ranked = gen._rank_hotels_by_proximity([far, near], anchors, {})
    assert ranked[0].name == "近处酒店"
    assert "近景点" in (ranked[0].note or "") or "较近" in (ranked[0].note or "")


def test_assign_nearest_hotel_rewrites_plan():
    gen = GuideGenerator.__new__(GuideGenerator)
    pool = {
        "hotel": [
            _poi("远酒店", 104.20, 30.80),
            _poi("近酒店", 104.055, 30.665),
        ],
        "attraction": [],
    }
    days = [{
        "day_index": 1,
        "items": [
            {
                "time_slot": "morning",
                "type": "attraction",
                "name": "宽窄巷子",
                "location": {"lng": 104.05, "lat": 30.67},
            },
            {
                "time_slot": "evening",
                "type": "hotel",
                "name": "远酒店",
            },
        ],
    }]
    gen._assign_nearest_hotel(days, pool)
    hotels = [it for it in days[0]["items"] if it["type"] == "hotel"]
    assert len(hotels) == 1
    assert hotels[0]["name"] == "近酒店"
