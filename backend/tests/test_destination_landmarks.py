from app.services.destination_landmarks import (
    is_micro_poi,
    landmark_boost,
    landmarks_for,
)


def test_beijing_landmarks():
    names = landmarks_for("北京三日游")
    assert "故宫博物院" in names
    assert "八达岭长城" in names


def test_filter_micro_poi():
    assert is_micro_poi("天安门广场-晚霞(打卡点)")
    assert is_micro_poi("故宫博物院-售票处")
    assert not is_micro_poi("故宫博物院")
    assert not is_micro_poi("颐和园")


def test_landmark_boost_order():
    lms = landmarks_for("北京")
    assert landmark_boost("故宫博物院", lms) > landmark_boost("香山公园", lms)
    assert landmark_boost("随便一个湖", lms) == 0
