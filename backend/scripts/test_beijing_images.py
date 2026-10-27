"""串行测试北京 POI 图片（避免 QPS 超限）。"""
from __future__ import annotations

import time

from app.services.destination_service import get_city_info, get_place_images

BEIJING_SPOTS = [
    "故宫博物院",
    "天安门广场",
    "八达岭长城",
    "颐和园",
]


def main() -> None:
    print("=== 北京单条 place-images ===")
    for name in BEIJING_SPOTS:
        t0 = time.time()
        r = get_place_images("北京", name, "spots", 1)
        dt = time.time() - t0
        ok = bool(r.get("image"))
        print(f"  {name}: ok={ok} source={r.get('source')} {dt:.2f}s")
        if r.get("image"):
            print(f"    {r['image'][:80]}")
        time.sleep(0.4)

    print("\n=== 北京 city-info（含封面补全）===")
    t0 = time.time()
    info = get_city_info("北京")
    print(f"  elapsed {time.time()-t0:.2f}s")
    for s in info.get("spots") or []:
        print(f"  spot {s['name']}: image={bool(s.get('image'))}")
    for f in info.get("foods") or []:
        print(f"  food {f['name'][:16]}: image={bool(f.get('image'))}")


if __name__ == "__main__":
    main()
