from datetime import date
from types import SimpleNamespace

from app.services.generator import GuideGenerator


def test_build_user_prompt_includes_external_refs():
    gen = GuideGenerator.__new__(GuideGenerator)
    trip = SimpleNamespace(
        destination="成都",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 3),
        travelers=2,
        preferences={"interests": ["美食"], "budget_level": "中等", "transport": "公共交通"},
    )
    pool = {"attraction": [], "meal": [], "hotel": []}
    refs = {
        "xiaohongshu": [{
            "source": "xiaohongshu",
            "title": "宽窄巷子打卡",
            "snippet": "早上去人少",
            "url": "https://www.xiaohongshu.com/explore/1",
            "meta": None,
        }],
        "ctrip": [{
            "source": "ctrip",
            "title": "大熊猫基地",
            "snippet": "建议预留半天",
            "url": "https://you.ctrip.com/sight/1.html",
            "meta": None,
        }],
    }
    prompt = gen._build_user_prompt(pool, trip, 3, web_results=None, external_refs=refs)
    assert "小红书" in prompt
    assert "宽窄巷子打卡" in prompt
    assert "携程" in prompt
    assert "大熊猫基地" in prompt
    assert "候选" in prompt or "可选景点" in prompt
