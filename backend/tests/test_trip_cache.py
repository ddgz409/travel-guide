from app.services.trip_cache import build_cache_key


def test_build_cache_key_stable_for_same_playbook():
    prefs = {
        "interests": ["美食", "文化"],
        "budget_level": "中等",
        "transport": "公共交通",
    }
    a = build_cache_key(
        destination="杭州",
        days_count=3,
        preferences=prefs,
        must_include=[{"name": "西湖"}, {"name": "灵隐寺"}],
    )
    b = build_cache_key(
        destination="杭州",
        days_count=3,
        preferences={
            "interests": ["文化", "美食"],
            "budget_level": "中等",
            "transport": "公共交通",
        },
        must_include=[{"name": "灵隐寺"}, {"name": "西湖"}],
    )
    assert a and a == b


def test_build_cache_key_skips_custom_llm():
    key = build_cache_key(
        destination="杭州",
        days_count=2,
        preferences={"_llm_override": {"api_key": "x"}},
        must_include=[],
    )
    assert key is None


def test_build_cache_key_differs_by_days():
    prefs = {"budget_level": "中等", "transport": "公共交通", "interests": []}
    a = build_cache_key(
        destination="北京", days_count=2, preferences=prefs, must_include=[]
    )
    b = build_cache_key(
        destination="北京", days_count=3, preferences=prefs, must_include=[]
    )
    assert a != b
