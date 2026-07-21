"""从国内 CDN（百度百科 bcebos）拉取封面并写入 public/covers。"""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "covers"
OUT.mkdir(parents=True, exist_ok=True)

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://baike.baidu.com/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# 文件名 -> 百度百科词条（用于抓取图片）
JOBS: list[tuple[str, str]] = [
    ("xian.jpg", "兵马俑"),
    ("gugong.jpg", "故宫"),
    ("greatwall.jpg", "长城"),
    ("beijing_hero.jpg", "八达岭长城"),
    ("tiananmen.jpg", "天安门广场"),
    ("summerpalace.jpg", "颐和园"),
    ("tiantan.jpg", "天坛"),
    ("beihai.jpg", "北海公园"),
    ("jingshan.jpg", "景山公园"),
    ("hutong.jpg", "南锣鼓巷"),
    ("shanghai_bund.jpg", "外滩"),
    ("westlake.jpg", "西湖"),
    ("hangzhou_hero.jpg", "西湖"),
    ("chengdu.jpg", "大熊猫"),
    ("dali.jpg", "大理古城"),
    ("xiamen.jpg", "鼓浪屿"),
    ("sanya.jpg", "亚龙湾"),
    ("luoyang.jpg", "龙门石窟"),
    ("quanzhou.jpg", "泉州开元寺"),
    ("cta_travel.jpg", "中国旅游"),
    ("nature.jpg", "黄山"),
    ("onsen.jpg", "腾冲热海"),
    ("note_jinzhong.jpg", "平遥古城"),
    ("generic_temple.jpg", "少林寺"),
    ("generic_garden.jpg", "拙政园"),
    ("generic_street.jpg", "宽窄巷子"),
    ("generic_lake.jpg", "洱海"),
    ("generic_city.jpg", "上海东方明珠"),
    ("meal1.jpg", "中餐"),
    ("meal2.jpg", "火锅"),
    ("meal3.jpg", "北京烤鸭"),
    ("hotel1.jpg", "酒店大堂"),
    ("hotel2.jpg", "宾馆客房"),
]


def fetch_bytes(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        if len(data) < 4000:
            return None
        return data
    except Exception as e:
        print(f"  download fail: {e}")
        return None


def baike_image_urls(title: str, limit: int = 6) -> list[str]:
    url = "https://baike.baidu.com/item/" + urllib.parse.quote(title)
    req = urllib.request.Request(url, headers=UA)
    try:
        html = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    except Exception as e:
        print(f"  baike page fail {title}: {e}")
        return []

    found: list[str] = []
    for m in re.finditer(r"https?://bkimg\.cdn\.bcebos\.com/[^\s\"'<>]+", html):
        found.append(m.group(0).split("?")[0])
    for m in re.finditer(r"//bkimg\.cdn\.bcebos\.com/[^\s\"'<>]+", html):
        found.append("https:" + m.group(0).split("?")[0])

    # 百科有时把图放在 JSON 里
    for m in re.finditer(r"\"(https?:\\\\/\\\\/bkimg\.cdn\.bcebos\.com\\\\/[^\"]+)\"", html):
        u = m.group(1).encode().decode("unicode_escape").replace("\\/", "/")
        found.append(u.split("?")[0])

    out: list[str] = []
    seen: set[str] = set()
    for u in found:
        if u in seen:
            continue
        # 过滤图标/小图
        if any(x in u.lower() for x in ("logo", "icon", "avatar", "svg")):
            continue
        seen.add(u)
        out.append(u)
        if len(out) >= limit:
            break
    return out


def main() -> None:
    report: dict[str, str] = {}
    for filename, title in JOBS:
        print(f"== {filename} <- {title}")
        urls = baike_image_urls(title)
        print(f"  candidates: {len(urls)}")
        ok = False
        for u in urls:
            data = fetch_bytes(u)
            if not data:
                continue
            dest = OUT / filename
            dest.write_bytes(data)
            report[filename] = u
            print(f"  OK {len(data)} from {u[:80]}")
            ok = True
            break
        if not ok:
            print("  MISS")
            report[filename] = "MISS"
    (OUT / "_cn_sources.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    miss = [k for k, v in report.items() if v == "MISS"]
    print(f"done miss={len(miss)} {miss}")


if __name__ == "__main__":
    main()
