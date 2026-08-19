"""分享页 HTML：让分享链接直接在浏览器打开，不依赖 3000 端口的前端服务。

路由挂在顶层 /share/{token}（不带 /api/v1 前缀），与 App 内 Share 页面
共用同一个 share_token。
"""
from html import escape

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Trip

router = APIRouter()

_TYPE_LABEL = {"attraction": "景点", "meal": "餐饮", "hotel": "住宿", "transport": "交通"}
_TYPE_EMOJI = {"attraction": "🏛", "meal": "🍜", "hotel": "🛏", "transport": "🚌"}
_SLOT_LABEL = {"morning": "上午", "afternoon": "下午", "evening": "晚上"}

_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · 知径旅行</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #F3F9FD; color: #1a1a1a; min-height: 100vh;
  }}
  .hero {{
    background: linear-gradient(135deg, #4FC3F7 0%, #29B6F6 100%);
    color: #fff; padding: 56px 20px 32px; text-align: center;
  }}
  .badge {{
    display: inline-block; background: rgba(255,255,255,.22);
    border-radius: 999px; padding: 4px 14px; font-size: 13px; margin-bottom: 14px;
  }}
  .hero h1 {{ font-size: 26px; font-weight: 800; }}
  .meta {{ margin-top: 10px; font-size: 14px; opacity: .92; }}
  .open-app {{
    display: inline-block; margin-top: 20px; background: #fff; color: #29B6F6;
    font-weight: 700; font-size: 15px; text-decoration: none;
    padding: 12px 28px; border-radius: 999px;
    box-shadow: 0 6px 18px rgba(2, 119, 189, .25);
  }}
  .wrap {{ max-width: 640px; margin: 0 auto; padding: 20px 16px 60px; }}
  .day {{
    background: #fff; border-radius: 20px; padding: 18px;
    margin-bottom: 16px; box-shadow: 0 2px 10px rgba(2, 119, 189, .06);
  }}
  .day-head {{ display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }}
  .day-num {{ color: #29B6F6; font-weight: 800; font-size: 17px; }}
  .day-date {{ color: #9E9E9E; font-size: 13px; }}
  .day-summary {{ color: #666; font-size: 14px; line-height: 1.6; margin: 6px 0 12px; }}
  .item {{
    display: flex; gap: 10px; padding: 10px 0;
    border-top: 1px solid #F0F7FC;
  }}
  .item-icon {{ font-size: 18px; line-height: 1.4; }}
  .item-body {{ flex: 1; }}
  .item-tag {{ font-size: 12px; color: #29B6F6; font-weight: 600; }}
  .item-name {{ font-size: 15px; font-weight: 700; margin-top: 2px; }}
  .item-desc {{ font-size: 13px; color: #777; line-height: 1.5; margin-top: 4px; }}
  .footer {{
    text-align: center; color: #9E9E9E; font-size: 12px; margin-top: 28px;
  }}
</style>
</head>
<body>
  <div class="hero">
    <div class="badge">{badge}</div>
    <h1>{title}</h1>
    <div class="meta">{destination} · {start_date} → {end_date} · {travelers} 人</div>
    <a class="open-app" href="zhijing://share/{token}">在「知径」App 中打开</a>
  </div>
  <div class="wrap">
    {days_html}
    <div class="footer">由「知径」AI 旅行助手生成 · 打开 App 可与好友共同编辑</div>
  </div>
</body>
</html>
"""

_NOT_FOUND = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>链接无效 · 知径旅行</title>
<style>body{{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
background:#F3F9FD;display:flex;align-items:center;justify-content:center;
min-height:100vh;color:#1a1a1a;text-align:center;padding:20px;}}
.card{{background:#fff;border-radius:20px;padding:40px 32px;
box-shadow:0 2px 10px rgba(2,119,189,.06);max-width:420px;}}
h1{{font-size:20px;margin-bottom:10px;}}p{{color:#777;font-size:14px;line-height:1.6;}}
</style></head>
<body><div class="card"><h1>😢 分享链接无效</h1>
<p>链接可能已失效或被取消分享，请向好友重新获取。</p></div></body></html>
"""


def _render_item(it) -> str:
    emoji = _TYPE_EMOJI.get(it.type, "📍")
    tag = f"{_TYPE_LABEL.get(it.type, it.type)} · {_SLOT_LABEL.get(it.time_slot, it.time_slot)}"
    name = escape(it.name)
    desc = escape((it.description or "")[:120])
    desc_html = f'<div class="item-desc">{desc}</div>' if desc else ""
    return (
        f'<div class="item"><div class="item-icon">{emoji}</div>'
        f'<div class="item-body"><div class="item-tag">{tag}</div>'
        f'<div class="item-name">{name}</div>{desc_html}</div></div>'
    )


def _render_day(day) -> str:
    items = [i for i in (day.items or []) if i.selected]
    items_html = "".join(_render_item(i) for i in items) or '<div class="item-desc">当日暂无安排</div>'
    summary = escape(day.summary or "")
    summary_html = f'<div class="day-summary">{summary}</div>' if summary else ""
    return (
        f'<div class="day"><div class="day-head">'
        f'<span class="day-num">Day {day.day_index}</span>'
        f'<span class="day-date">{day.date}</span></div>'
        f"{summary_html}{items_html}</div>"
    )


@router.get("/share/{token}", response_class=HTMLResponse, include_in_schema=False)
def shared_trip_page(token: str, db: Session = Depends(get_db)):
    trip = db.scalar(select(Trip).where(Trip.share_token == token))
    if trip is None:
        return HTMLResponse(_NOT_FOUND, status_code=404)

    collab = trip.share_mode == "collab"
    days_html = "".join(_render_day(d) for d in (trip.days or []))
    return _PAGE.format(
        title=escape(trip.title),
        badge="共同编辑邀请" if collab else "分享攻略",
        destination=escape(trip.destination),
        start_date=trip.start_date,
        end_date=trip.end_date,
        travelers=trip.travelers,
        token=escape(token),
        days_html=days_html,
    )
