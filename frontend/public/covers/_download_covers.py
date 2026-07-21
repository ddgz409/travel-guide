# -*- coding: utf-8 -*-
"""Download verified landmark cover images for trip covers."""
from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(r"c:\Users\wyf20\Desktop\app\frontend\public\covers")
OUT.mkdir(parents=True, exist_ok=True)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 "
    "TravelGuideCovers/1.0 (educational; cover images)"
)
CTX = ssl.create_default_context()
_last_req = 0.0


def throttle(min_gap: float = 1.2) -> None:
    global _last_req
    now = time.time()
    wait = min_gap - (now - _last_req)
    if wait > 0:
        time.sleep(wait)
    _last_req = time.time()


def fetch_bytes(url: str, timeout: int = 60) -> bytes:
    throttle(0.8)
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Accept": "image/*,*/*", "Referer": "https://commons.wikimedia.org/"}
    )
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as resp:
        data = resp.read()
        ctype = (resp.headers.get("Content-Type") or "").lower()
        if "html" in ctype and len(data) < 8000:
            raise ValueError(f"Got HTML instead of image from {url}")
        if len(data) < 1500:
            raise ValueError(f"Too small ({len(data)} bytes): {url}")
        return data


def commons_search(query: str, limit: int = 6) -> list[str]:
    throttle(2.0)
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|size|mime",
            "iiurlwidth": 640,
        }
    )
    req = urllib.request.Request(api, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=45) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  commons API {e.code} for {query!r}")
        time.sleep(5)
        return []
    urls: list[str] = []
    for page in (data.get("query") or {}).get("pages", {}).values():
        ii = (page.get("imageinfo") or [{}])[0]
        mime = (ii.get("mime") or "").lower()
        if mime and not mime.startswith("image/"):
            continue
        u = ii.get("thumburl") or ii.get("url")
        if u:
            urls.append(u)
            print(f"  found: {page.get('title','')[:70]}")
    return urls


def download_first(filename: str, urls: list[str], subject: str, city: str) -> dict | None:
    path = OUT / filename
    seen: set[str] = set()
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        try:
            data = fetch_bytes(url)
            path.write_bytes(data)
            size = len(data)
            print(f"OK {filename} {size} bytes")
            print(f"   {url}")
            return {"file": filename, "subject": subject, "city": city, "source_url": url, "bytes": size}
        except Exception as e:
            print(f"FAIL {filename}: {type(e).__name__}: {e}")
            continue
    print(f"FAILED ALL for {filename}")
    return None


def uniq(urls: list[str]) -> list[str]:
    out, seen = [], set()
    for u in urls:
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def main() -> None:
    # Hangzhou West Lake Unsplash — NOT for Summer Palace
    westlake_unsplash = "https://images.unsplash.com/photo-1599571234909-29ed5d1321d6?w=640&q=80"

    jobs: list[tuple[str, list[str], str, str]] = [
        (
            "gugong.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c6/Forbidden_City_Beijing_Shenwumen_Gate.jpg/640px-Forbidden_City_Beijing_Shenwumen_Gate.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Forbidden_City_Beijing_China.jpg/640px-Forbidden_City_Beijing_China.jpg",
                "https://images.unsplash.com/photo-1656171600501-456e5fd9614f?w=640&q=80",
            ],
            "Forbidden City / Palace Museum",
            "Beijing",
        ),
        (
            "tiananmen.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/China_-_Beijing_1_-_Tiananmen_Square_%28130829277%29.jpg/640px-China_-_Beijing_1_-_Tiananmen_Square_%28130829277%29.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Tiananmen_Gate.jpg/640px-Tiananmen_Gate.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gate_of_Heavenly_Peace.jpg/640px-Gate_of_Heavenly_Peace.jpg",
            ],
            "Tiananmen Square",
            "Beijing",
        ),
        (
            "greatwall.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling.jpg/640px-The_Great_Wall_of_China_at_Jinshanling.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/The_Great_Wall_of_China_at_Jinshanling_edit.jpg/640px-The_Great_Wall_of_China_at_Jinshanling_edit.jpg",
                "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=640&q=80",
            ],
            "Great Wall of China",
            "Beijing",
        ),
        (
            "summerpalace.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Summer_Palace_Beijing_Kunming_Lake.jpg/640px-Summer_Palace_Beijing_Kunming_Lake.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Summer_Palace_Beijing_17.jpg/640px-Summer_Palace_Beijing_17.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Summer_Palace%2C_Beijing%2C_China.jpg/640px-Summer_Palace%2C_Beijing%2C_China.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Beijing_Summer_Palace_Longevity_Hill.jpg/640px-Beijing_Summer_Palace_Longevity_Hill.jpg",
                # intentionally NO westlake_unsplash
            ],
            "Summer Palace / 颐和园",
            "Beijing",
        ),
        (
            "tiantan.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Temple_of_Heaven.jpg/640px-Temple_of_Heaven.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Temple_of_Heaven_Hall_of_Prayer_for_Good_Harvests.jpg/640px-Temple_of_Heaven_Hall_of_Prayer_for_Good_Harvests.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Temple_of_Heaven_Beijing_Edit.jpg/640px-Temple_of_Heaven_Beijing_Edit.jpg",
            ],
            "Temple of Heaven",
            "Beijing",
        ),
        (
            "beihai.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Beihai_Park%2C_Beijing%2C_China.jpg/640px-Beihai_Park%2C_Beijing%2C_China.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/White_Pagoda_Beihai_Park.jpg/640px-White_Pagoda_Beihai_Park.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Beihai_Park_Baita.jpg/640px-Beihai_Park_Baita.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Baita_Beihai_Park.jpg/640px-Baita_Beihai_Park.jpg",
            ],
            "Beihai Park White Dagoba / 白塔",
            "Beijing",
        ),
        (
            "jingshan.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Forbidden_City_from_Jingshan_Hill.jpg/640px-Forbidden_City_from_Jingshan_Hill.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/View_from_Jingshan_Park.jpg/640px-View_from_Jingshan_Park.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Jingshan_Park.jpg/640px-Jingshan_Park.jpg",
            ],
            "Jingshan Park overlooking Forbidden City",
            "Beijing",
        ),
        (
            "hutong.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Nanluoguxiang_Beijing.jpg/640px-Nanluoguxiang_Beijing.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Nanluoguxiang.jpg/640px-Nanluoguxiang.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Beijing_hutong.jpg/640px-Beijing_hutong.jpg",
                "https://images.unsplash.com/photo-1599577181816-d4a0e8c5b0c4?w=640&q=80",
            ],
            "Beijing hutong / Nanluogu Xiang",
            "Beijing",
        ),
        (
            "birdnest.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Beijing_National_Stadium.jpg/640px-Beijing_National_Stadium.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Bird%27s_Nest_stadium%2C_Beijing.jpg/640px-Bird%27s_Nest_stadium%2C_Beijing.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/National_Stadium_Beijing_2008.jpg/640px-National_Stadium_Beijing_2008.jpg",
            ],
            "Beijing National Stadium (Bird's Nest)",
            "Beijing",
        ),
        (
            "shanghai_bund.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/The_Bund_Shanghai.jpg/640px-The_Bund_Shanghai.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Shanghai_Bund_at_night.jpg/640px-Shanghai_Bund_at_night.jpg",
                "https://images.unsplash.com/photo-1538426473914-6a1b0e8b8b8b?w=640&q=80",
                "https://images.unsplash.com/photo-1548919973-5cef591cdbc9?w=640&q=80",
            ],
            "The Bund",
            "Shanghai",
        ),
        (
            "westlake.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/West_Lake%2C_Hangzhou.jpg/640px-West_Lake%2C_Hangzhou.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/West_Lake_Hangzhou.jpg/640px-West_Lake_Hangzhou.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/West_Lake_in_Hangzhou.jpg/640px-West_Lake_in_Hangzhou.jpg",
                westlake_unsplash,
                "https://images.unsplash.com/photo-1569949386083-c9c9a0c0e0e0?w=640&q=80",
            ],
            "West Lake Hangzhou",
            "Hangzhou",
        ),
        (
            "meal_bbq.jpg",
            [
                "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=640&q=80",
                "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=640&q=80",
            ],
            "BBQ / grilled meat meal",
            "generic",
        ),
        (
            "meal_hotpot.jpg",
            [
                "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=640&q=80",
                "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=640&q=80",
            ],
            "Hotpot meal",
            "generic",
        ),
        (
            "meal_dimsum.jpg",
            [
                "https://images.unsplash.com/photo-1496116218417-1a781b1c416f?w=640&q=80",
                "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=640&q=80",
            ],
            "Dim sum meal",
            "generic",
        ),
        (
            "hotel_lobby.jpg",
            [
                "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=640&q=80",
                "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=640&q=80",
            ],
            "Hotel lobby",
            "generic",
        ),
        (
            "hotel_room.jpg",
            [
                "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=640&q=80",
                "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=640&q=80",
            ],
            "Hotel room",
            "generic",
        ),
        (
            "beijing_hero.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling.jpg/640px-The_Great_Wall_of_China_at_Jinshanling.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/The_Great_Wall_of_China_at_Jinshanling_edit.jpg/640px-The_Great_Wall_of_China_at_Jinshanling_edit.jpg",
                "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=640&q=80",
            ],
            "Great Wall (Beijing hero)",
            "Beijing",
        ),
        (
            "generic_cn_temple.jpg",
            [
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Lama_Temple_Beijing.jpg/640px-Lama_Temple_Beijing.jpg",
                "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Yonghegong_Lama_Temple.jpg/640px-Yonghegong_Lama_Temple.jpg",
                "https://images.unsplash.com/photo-1528164344705-47542687000d?w=640&q=80",
            ],
            "Chinese temple (generic)",
            "generic",
        ),
        (
            "generic_garden.jpg",
            [
                "https://images.unsplash.com/photo-1528164344705-47542687000d?w=640&q=80",
                "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=640&q=80",
            ],
            "Chinese garden (generic)",
            "generic",
        ),
        (
            "generic_street.jpg",
            [
                "https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=640&q=80",
                "https://images.unsplash.com/photo-1474181487882-5abf3f12bbf8?w=640&q=80",
            ],
            "City street (generic)",
            "generic",
        ),
        (
            "generic_lake.jpg",
            [
                "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=640&q=80",
                "https://images.unsplash.com/photo-1439066615861-d1af74d74000?w=640&q=80",
            ],
            "Lake scenery (generic)",
            "generic",
        ),
        (
            "generic_museum.jpg",
            [
                "https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=640&q=80",
                "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=640&q=80",
            ],
            "Museum interior (generic)",
            "generic",
        ),
    ]

    # Enrich hard-to-hit Beijing landmarks via Commons (throttled, after delay for prior 429)
    print("Waiting 8s before Commons searches (rate limit)...")
    time.sleep(8)
    enrich = {
        "beihai.jpg": "Beihai Park White Dagoba Beijing",
        "jingshan.jpg": "Jingshan Park view Forbidden City",
        "hutong.jpg": "Nanluoguxiang hutong Beijing",
        "birdnest.jpg": "Beijing National Stadium Bird Nest",
        "shanghai_bund.jpg": "The Bund Shanghai",
        "westlake.jpg": "West Lake Hangzhou",
        "summerpalace.jpg": "Summer Palace Beijing Kunming Lake",
        "generic_cn_temple.jpg": "Yonghe Temple Beijing",
    }
    by_name = {j[0]: list(j) for j in jobs}
    for fname, q in enrich.items():
        print(f"Commons search: {q}")
        found = commons_search(q, 6)
        by_name[fname][1] = uniq(by_name[fname][1] + found)

    jobs = [tuple(by_name[j[0]]) for j in jobs]  # type: ignore

    manifest = []
    for name, urls, subject, city in jobs:
        # Never use Hangzhou West Lake / Shanghai Bund for Beijing landmark files
        if city == "Beijing":
            filtered = []
            for u in urls:
                low = u.lower()
                if "photo-1599571234909" in low:
                    continue
                if ("west_lake" in low or "westlake" in low or "hangzhou" in low) and "summer" not in low:
                    continue
                if "the_bund" in low or ("shanghai" in low and "forbidden" not in low and "beijing" not in low and "summer" not in low and "temple" not in low and "wall" not in low and "stadium" not in low and "jingshan" not in low and "beihai" not in low and "hutong" not in low and "nanluo" not in low and "tianan" not in low):
                    # keep beijing-related; drop pure bund
                    if "bund" in low:
                        continue
                filtered.append(u)
            urls = filtered
        print(f"\n--- {name} ---")
        entry = download_first(name, uniq(urls), subject, city)
        if entry:
            manifest.append({k: entry[k] for k in ("file", "subject", "city", "source_url")})

    (OUT / "_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"\nWrote _manifest.json ({len(manifest)} entries)")

    poi_map = {
        "天安门广场": "tiananmen.jpg",
        "故宫博物院": "gugong.jpg",
        "景山公园": "jingshan.jpg",
        "八达岭长城": "greatwall.jpg",
        "天坛公园": "tiantan.jpg",
        "颐和园": "summerpalace.jpg",
        "北海公园": "beihai.jpg",
        "南锣鼓巷": "hutong.jpg",
    }
    print("\n=== Beijing POI -> cover file mapping ===")
    for poi, f in poi_map.items():
        p = OUT / f
        if p.exists():
            print(f"{poi} -> {f} ({p.stat().st_size} bytes)")
        else:
            print(f"{poi} -> {f} MISSING")

    (OUT / "_poi_mapping_beijing.json").write_text(
        json.dumps(poi_map, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("\n=== Successful downloads ===")
    for e in manifest:
        print(f"{e['file']}: {(OUT / e['file']).stat().st_size} bytes")

    failed = [j[0] for j in jobs if j[0] not in {m['file'] for m in manifest}]
    if failed:
        print("\nFAILED:", ", ".join(failed))


if __name__ == "__main__":
    main()
