from app.services.quick_recommend import build_quick_recommend


def test_quick_recommend_two_cards():
    data = build_quick_recommend("杭州")
    assert data["destination"] == "杭州"
    assert len(data["cards"]) == 2
    ids = {c["id"] for c in data["cards"]}
    assert ids == {"classic", "life"}
    for card in data["cards"]:
        refs = card["external_refs"]
        assert refs["xiaohongshu"]
        assert refs["ctrip"]
        for tip in refs["xiaohongshu"]:
            assert "xiaohongshu.com" in tip["url"]
        for tip in refs["ctrip"]:
            assert "ctrip.com" in tip["url"]
