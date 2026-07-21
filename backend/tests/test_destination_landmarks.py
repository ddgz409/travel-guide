from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.destination_landmarks import (
    is_micro_poi,
    landmark_boost,
    landmarks_for,
    resolve_landmarks,
)


def test_beijing_landmarks():
    names = landmarks_for("北京三日游")
    assert "故宫博物院" in names
    assert "八达岭长城" in names


def test_more_curated_cities():
    assert "黄鹤楼" in landmarks_for("武汉")
    assert "莫高窟" in landmarks_for("敦煌")
    assert "布达拉宫" in landmarks_for("拉萨市")


def test_filter_micro_poi():
    assert is_micro_poi("天安门广场-晚霞(打卡点)")
    assert is_micro_poi("故宫博物院-售票处")
    assert not is_micro_poi("故宫博物院")
    assert not is_micro_poi("颐和园")


def test_landmark_boost_order():
    lms = landmarks_for("北京")
    assert landmark_boost("故宫博物院", lms) > landmark_boost("香山公园", lms)
    assert landmark_boost("随便一个湖", lms) == 0


def test_resolve_falls_back_to_amap(tmp_path, monkeypatch):
    import app.services.destination_landmarks as mod

    monkeypatch.setattr(mod, "_CACHE_PATH", tmp_path / "landmark_cache.json")
    monkeypatch.setattr(mod, "_mem_cache", {})
    monkeypatch.setattr(mod, "_disk_loaded", True)

    amap = MagicMock()
    amap.search_poi_by_keyword.return_value = [
        SimpleNamespace(name="某某古城", rating=4.8),
        SimpleNamespace(name="某某古城-售票处", rating=4.9),
        SimpleNamespace(name="山水公园", rating=4.5),
    ]
    names = resolve_landmarks("某个小城", amap, limit=8)
    assert "某某古城" in names
    assert "山水公园" in names
    assert not any("售票处" in n for n in names)
