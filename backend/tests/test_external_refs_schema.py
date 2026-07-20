from app.schemas.trip import EMPTY_EXTERNAL_REFS, ExternalRefs, ExternalTip, TripOut


def test_empty_external_refs_keys():
    assert set(EMPTY_EXTERNAL_REFS.keys()) == {"xiaohongshu", "ctrip"}
    assert EMPTY_EXTERNAL_REFS["xiaohongshu"] == []
    assert EMPTY_EXTERNAL_REFS["ctrip"] == []


def test_external_tip_roundtrip():
    tip = ExternalTip(
        source="xiaohongshu",
        title="成都三日游",
        snippet="宽窄巷子必去",
        url="https://www.xiaohongshu.com/explore/abc",
        meta={"likes": "1.2万"},
    )
    data = tip.model_dump()
    assert data["source"] == "xiaohongshu"
    assert data["meta"]["likes"] == "1.2万"


def test_trip_out_includes_external_refs():
    fields = TripOut.model_fields
    assert "external_refs" in fields
