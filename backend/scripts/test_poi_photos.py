"""Debug: why place-images returns empty for known POIs."""
from app.services.amap_client import POI_TYPES, get_amap_client
from app.services.destination_service import get_place_images, _pick_cover_url

amap = get_amap_client()
print("has_key:", bool(amap.api_key))

cases = [
    ("北京", "故宫博物院", "B000A8UIN8"),
    ("北京", "天坛公园", "B000A81CB2"),
    ("成都", "大熊猫繁育研究基地", ""),
]

for city, name, pid in cases:
    print("\n===", city, name, pid or "(no id)")
    raw = amap.get_poi_photos(
        poi_id=pid or None,
        keyword=name,
        city=city,
        poi_type=POI_TYPES["attraction"],
        limit=3,
    )
    print("  get_poi_photos:", len(raw), raw[:1])
    good = _pick_cover_url(raw)
    print("  pick_cover:", good[:80] if good else None)
    api = get_place_images(city, name, "spots", 1, pid)
    print("  place-images:", api.get("image"), "source:", api.get("source"))
