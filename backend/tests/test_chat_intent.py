from app.services.chat_intent import detect_plan_intent


def test_detect_beijing_tomorrow_plan():
    text = "帮我规划明天去北京的旅游行程，并建议穿衣搭配"
    action = detect_plan_intent(text)
    assert action is not None
    assert action["action"] == "navigate_generate"
    assert action["destination"] == "北京"
    assert action["auto_submit"] is True
    assert "穿衣" in action["chat_hint"]


def test_detect_no_plan_for_weather_only():
    assert detect_plan_intent("明天杭州要带伞吗") is None


def test_detect_multi_day():
    text = "帮我规划去成都3天行程"
    action = detect_plan_intent(text)
    assert action is not None
    assert action["destination"] == "成都"
    assert action["start_date"] != action["end_date"]
