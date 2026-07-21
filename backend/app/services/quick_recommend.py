"""快速参考：不调用 LLM / 不抓酒店，仅组装小红书与携程入口链接。"""

from __future__ import annotations

from typing import Any

from app.services.ctrip_client import search_ctrip
from app.services.xiaohongshu_client import search_xiaohongshu


def build_quick_recommend(destination: str) -> dict[str, Any]:
    dest = (destination or "").strip() or "旅游"
    xhs = search_xiaohongshu(dest, max_results=6)
    ctrip = search_ctrip(dest, max_results=6)

    def _pick(items: list[dict], *titles_substr: str) -> list[dict]:
        out: list[dict] = []
        for tip in items:
            title = tip.get("title") or ""
            if any(s in title for s in titles_substr):
                out.append(tip)
        return out

    classic_xhs = _pick(xhs, "攻略", "景点", "一日游") or xhs[:3]
    classic_ctrip = _pick(ctrip, "攻略", "景点", "酒店") or ctrip[:3]
    life_xhs = _pick(xhs, "美食", "住宿", "交通") or xhs[2:5]
    life_ctrip = _pick(ctrip, "美食", "玩乐", "酒店", "搜索") or ctrip[2:5]

    return {
        "destination": dest,
        "cards": [
            {
                "id": "classic",
                "title": f"{dest} · 经典打卡",
                "tagline": "攻略、必去景点与门票酒店入口",
                "external_refs": {
                    "xiaohongshu": classic_xhs[:3],
                    "ctrip": classic_ctrip[:3],
                },
            },
            {
                "id": "life",
                "title": f"{dest} · 吃住出行",
                "tagline": "美食、住宿与交通参考链接",
                "external_refs": {
                    "xiaohongshu": life_xhs[:3],
                    "ctrip": life_ctrip[:3],
                },
            },
        ],
    }
