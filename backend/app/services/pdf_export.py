"""PDF 导出服务：用 reportlab 生成攻略 PDF。

纯 Python 实现，无系统级依赖（weasyprint 需 GTK，Windows 部署困难）。
"""
import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models import Trip

# 中文字体：优先用系统自带的微软雅黑 / 宋体
_FONT_REGISTERED = False


def _register_cjk_font() -> str:
    """注册一个中文字体，返回字体名。失败则回退到内置 Helvetica（中文会乱码但能跑）。"""
    global _FONT_REGISTERED
    if _FONT_REGISTERED:
        return "CJK"

    candidates = [
        ("C:/Windows/Fonts/msyh.ttc", "CJK"),  # 微软雅黑
        ("C:/Windows/Fonts/simsun.ttc", "CJK"),  # 宋体
        ("C:/Windows/Fonts/msyhbd.ttc", "CJK"),  # 雅黑粗体
    ]
    for path, name in candidates:
        try:
            pdfmetrics.registerFont(TTFont(name, path))
            _FONT_REGISTERED = True
            return name
        except Exception:
            continue
    # 找不到中文字体，回退
    return "Helvetica"


SLOT_LABEL = {"morning": "上午", "afternoon": "下午", "evening": "晚上"}
SLOT_ICON = {"morning": "☀️", "afternoon": "🌤️", "evening": "🌙"}
TYPE_LABEL = {
    "attraction": "景点", "meal": "餐饮", "hotel": "住宿", "transport": "交通",
}


def _styles(font: str) -> dict:
    """构造各级样式。"""
    base = ParagraphStyle(name="base", fontName=font, fontSize=10.5, leading=16)
    return {
        "title": ParagraphStyle("title", parent=base, fontSize=20, leading=26, spaceAfter=6),
        "subtitle": ParagraphStyle("subtitle", parent=base, fontSize=10, textColor=colors.grey, spaceAfter=16),
        "h2": ParagraphStyle("h2", parent=base, fontSize=14, leading=20, spaceBefore=14, spaceAfter=6, textColor=colors.HexColor("#0369a1")),
        "h3": ParagraphStyle("h3", parent=base, fontSize=11.5, leading=16, spaceBefore=6, spaceAfter=2),
        "body": base,
        "small": ParagraphStyle("small", parent=base, fontSize=9, textColor=colors.grey),
        "summary": ParagraphStyle("summary", parent=base, fontSize=9.5, textColor=colors.HexColor("#92400e"), backColor=colors.HexColor("#fffbeb"), borderPadding=6, spaceAfter=8),
    }


def _format_duration(min_val) -> str:
    if not min_val:
        return ""
    if min_val < 60:
        return f"{min_val}分钟"
    h, m = divmod(min_val, 60)
    return f"{h}小时{m}分" if m else f"{h}小时"


def _format_transport(t) -> str:
    if not t:
        return ""
    mode = {"walking": "步行", "driving": "驾车", "transit": "公交"}.get(t.get("mode"), t.get("mode", ""))
    km = round(t.get("distance_m", 0) / 1000, 1)
    mins = round(t.get("duration_s", 0) / 60)
    return f"→ {mode} {km}km · {mins}分钟"


def export_trip_pdf(trip: Trip) -> bytes:
    """生成攻略 PDF，返回字节内容。"""
    font = _register_cjk_font()
    s = _styles(font)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
    story = []

    # 标题
    story.append(Paragraph(trip.title, s["title"]))
    days_count = (trip.end_date - trip.start_date).days + 1
    story.append(Paragraph(
        f"{trip.destination} · {trip.start_date} 至 {trip.end_date}（{days_count}天）· {trip.travelers}人",
        s["subtitle"],
    ))

    # 按天
    for day in sorted(trip.days, key=lambda d: d.day_index):
        story.append(Paragraph(f"Day {day.day_index} · {day.date}", s["h2"]))
        if day.summary:
            story.append(Paragraph(f"📝 {day.summary}", s["summary"]))

        for it in day.items:
            slot = SLOT_LABEL.get(it.time_slot, it.time_slot)
            tlabel = TYPE_LABEL.get(it.type, it.type)
            cost = f" · ¥{it.cost}" if it.cost else ""
            dur = f" · {_format_duration(it.duration_min)}" if it.duration_min else ""
            story.append(Paragraph(
                f"{SLOT_ICON.get(it.time_slot, '')} {slot} · {tlabel}{dur}{cost}　<b>{it.name}</b>",
                s["h3"],
            ))
            if it.description:
                story.append(Paragraph(it.description, s["body"]))
            if it.transport_to_next:
                story.append(Paragraph(_format_transport(it.transport_to_next), s["small"]))
        story.append(Spacer(1, 4))

    # 预算汇总
    budget_by_type: dict[str, float] = {}
    total = 0.0
    for d in trip.days:
        for it in d.items:
            c = it.cost or 0
            total += c
            budget_by_type[it.type] = budget_by_type.get(it.type, 0) + c

    story.append(Spacer(1, 10))
    story.append(Paragraph("💰 预算估算", s["h2"]))

    rows = [["类别", "费用"]]
    for t, c in budget_by_type.items():
        rows.append([TYPE_LABEL.get(t, t), f"¥{c:,.0f}"])
    total_budget = trip.budget_total if trip.budget_total is not None else total * trip.travelers
    rows.append(["总计", f"¥{total_budget:,.0f}"])

    tbl = Table(rows, colWidths=[60 * mm, 40 * mm])
    tbl.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0369a1")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#f1f5f9")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fef3c7")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("PADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(tbl)

    doc.build(story)
    return buf.getvalue()
