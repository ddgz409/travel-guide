"""Download cover images into frontend/public/covers for offline/reliable display."""
from __future__ import annotations

import json
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "covers"
OUT.mkdir(parents=True, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Verified Unsplash photo IDs (subject checked) — local files so UI never blank
SOURCES: dict[str, tuple[str, str]] = {
    # file -> (label, url)
    "gugong.jpg": ("故宫", "https://images.unsplash.com/photo-1656171600501-456e5fd9614f?w=800&q=80"),
    "tiananmen.jpg": ("天安门", "https://images.unsplash.com/photo-1591123120675-6f7f1aae0e5b?w=800&q=80"),
    "greatwall.jpg": ("长城", "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&q=80"),
    "summerpalace.jpg": ("颐和园", "https://images.unsplash.com/photo-1555921015-5532091f6026?w=800&q=80"),
    "tiantan.jpg": ("天坛", "https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&q=80"),
    "beihai.jpg": ("北海", "https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800&q=80"),
    "jingshan.jpg": ("景山", "https://images.unsplash.com/photo-1529963183134-61a90db29777?w=800&q=80"),
    "hutong.jpg": ("胡同", "https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?w=800&q=80"),
    "shanghai_bund.jpg": ("外滩", "https://images.unsplash.com/photo-1538428494232-9c0d8a3ab403?w=800&q=80"),
    "westlake.jpg": ("西湖", "https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=800&q=80"),
    "chengdu.jpg": ("成都", "https://images.unsplash.com/photo-1575550959105-8f25db754c0c?w=800&q=80"),
    "xian.jpg": ("西安", "https://images.unsplash.com/photo-1569949381669-ecf31ae8e613?w=800&q=80"),
    "generic_temple.jpg": ("古建", "https://images.unsplash.com/photo-1528127269322-539801943592?w=800&q=80"),
    "generic_garden.jpg": ("园林", "https://images.unsplash.com/photo-1474181487882-5abf3f0ba6c2?w=800&q=80"),
    "generic_street.jpg": ("街巷", "https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=800&q=80"),
    "generic_lake.jpg": ("湖景", "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80"),
    "generic_city.jpg": ("城市", "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80"),
    "meal1.jpg": ("餐饮1", "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80"),
    "meal2.jpg": ("餐饮2", "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80"),
    "meal3.jpg": ("餐饮3", "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80"),
    "hotel1.jpg": ("酒店1", "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80"),
    "hotel2.jpg": ("酒店2", "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80"),
    "beijing_hero.jpg": ("北京Hero", "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=1600&q=85"),
}


def fetch(url: str, dest: Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        if len(data) < 3000:
            print(f"  too small {len(data)}")
            return False
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"  FAIL {e}")
        return False


def main() -> None:
    ok = 0
    for name, (label, url) in SOURCES.items():
        dest = OUT / name
        if dest.exists() and dest.stat().st_size > 3000:
            print(f"skip {name} ({label})")
            ok += 1
            continue
        print(f"get {name} ({label})")
        if fetch(url, dest):
            print(f"  OK {dest.stat().st_size}")
            ok += 1
    print(f"done {ok}/{len(SOURCES)}")
    (OUT / "_ok.json").write_text(
        json.dumps({"ok": ok, "total": len(SOURCES)}, ensure_ascii=False),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
