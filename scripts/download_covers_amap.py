"""用高德 POI 实景图（store.is.autonavi.com，国内）覆盖 public/covers。"""
from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public" / "covers"
OUT.mkdir(parents=True, exist_ok=True)

env = (ROOT / "backend" / ".env").read_text(encoding="utf-8", errors="ignore")
KEY = re.search(r"AMAP_API_KEY=(\S+)", env).group(1).strip()

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.amap.com/",
}

# filename -> (keyword, city)  —— 文件名即归属城市，禁止跨城复用
JOBS: list[tuple[str, str, str]] = [
    ("xian.jpg", "兵马俑", "西安"),
    ("xian_wall.jpg", "西安城墙", "西安"),
    ("gugong.jpg", "故宫博物院", "北京"),
    ("greatwall.jpg", "八达岭长城", "北京"),
    ("beijing_hero.jpg", "八达岭长城", "北京"),
    ("tiananmen.jpg", "天安门广场", "北京"),
    ("summerpalace.jpg", "颐和园", "北京"),
    ("tiantan.jpg", "天坛公园", "北京"),
    ("beihai.jpg", "北海公园", "北京"),
    ("jingshan.jpg", "景山公园", "北京"),
    ("hutong.jpg", "南锣鼓巷", "北京"),
    ("shanghai_bund.jpg", "外滩", "上海"),
    ("yuyuan.jpg", "豫园", "上海"),
    ("westlake.jpg", "西湖风景名胜区", "杭州"),
    ("hangzhou_hero.jpg", "雷峰塔", "杭州"),
    ("hangzhou_hefang.jpg", "河坊街", "杭州"),
    ("hangzhou_lingyin.jpg", "灵隐寺", "杭州"),
    ("hangzhou_food.jpg", "楼外楼", "杭州"),
    ("chengdu.jpg", "成都大熊猫繁育研究基地", "成都"),
    ("kuanzhai.jpg", "宽窄巷子", "成都"),
    ("dali.jpg", "大理古城", "大理"),
    ("generic_lake.jpg", "洱海", "大理"),
    ("xiamen.jpg", "鼓浪屿日光岩", "厦门"),
    ("sanya.jpg", "亚龙湾", "三亚"),
    ("luoyang.jpg", "龙门石窟", "洛阳"),
    ("quanzhou.jpg", "开元寺", "泉州"),
    ("suzhou.jpg", "拙政园", "苏州"),
    ("nanjing.jpg", "中山陵", "南京"),
    ("chongqing.jpg", "洪崖洞", "重庆"),
    ("guangzhou.jpg", "广州塔", "广州"),
    ("cta_travel.jpg", "黄山风景区", "黄山"),
    ("nature.jpg", "黄山风景区", "黄山"),
    ("onsen.jpg", "腾冲热海", "腾冲"),
    ("note_jinzhong.jpg", "平遥古城", "晋中"),
    ("meal1.jpg", "全聚德", "北京"),
    ("meal2.jpg", "火锅", "成都"),
    ("meal3.jpg", "南翔小笼", "上海"),
    ("hotel1.jpg", "酒店", "北京"),
    ("hotel2.jpg", "宾馆", "杭州"),
]


def amap_photos(keyword: str, city: str) -> list[str]:
    qs = urllib.parse.urlencode(
        {
            "key": KEY,
            "keywords": keyword,
            "city": city,
            "offset": 8,
            "page": 1,
            "extensions": "all",
        }
    )
    url = "https://restapi.amap.com/v3/place/text?" + qs
    req = urllib.request.Request(url, headers=UA)
    data = json.loads(urllib.request.urlopen(req, timeout=20).read().decode())
    urls: list[str] = []
    for p in data.get("pois") or []:
        photos = p.get("photos") or []
        if isinstance(photos, dict):
            photos = [photos]
        for item in photos:
            if not isinstance(item, dict):
                continue
            u = item.get("url")
            if not u:
                continue
            if "autonavi.com" in u or "amap.com" in u:
                urls.append(u.replace("http://", "https://"))
    return urls


def download(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        if len(data) < 5000:
            return None
        if data[:3] not in (b"\xff\xd8\xff", b"\x89PN", b"GIF") and data[:4] != b"RIFF":
            if len(data) < 20000:
                return None
        return data
    except Exception as e:
        print(f"  dl fail {e}")
        return None


def main() -> None:
    only = set()
    import sys

    if len(sys.argv) > 1:
        only = set(sys.argv[1:])

    report: dict[str, str] = {}
    prev = OUT / "_amap_sources.json"
    if prev.exists():
        try:
            report = json.loads(prev.read_text(encoding="utf-8"))
        except Exception:
            report = {}

    for filename, keyword, city in JOBS:
        if only and filename not in only:
            continue
        print(f"== {filename} {city}/{keyword}")
        try:
            urls = amap_photos(keyword, city)
        except Exception as e:
            print(f"  search fail {e}")
            report[filename] = f"SEARCH_FAIL:{e}"
            continue
        print(f"  photos={len(urls)}")
        ok = False
        for u in urls[:8]:
            data = download(u)
            if not data:
                continue
            dest = OUT / filename
            if data[:8].startswith(b"\x89PNG"):
                from PIL import Image
                import io

                im = Image.open(io.BytesIO(data)).convert("RGB")
                im.save(dest, format="JPEG", quality=88)
            else:
                dest.write_bytes(data)
            report[filename] = u
            print(f"  OK {dest.stat().st_size}")
            ok = True
            break
        if not ok:
            print("  MISS")
            report[filename] = "MISS"
    (OUT / "_amap_sources.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    miss = [k for k, v in report.items() if str(v).startswith("MISS") or "FAIL" in str(v)]
    print("miss", miss)


if __name__ == "__main__":
    main()
