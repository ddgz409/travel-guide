"""生成离线中国地级市矢量地图与城市→地级市映射。"""
from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREFECTURES = ROOT / "_prefectures.json"
OUT_PATHS = ROOT.parent / "src" / "assets" / "chinaPrefecturePaths.ts"
OUT_CITY = ROOT.parent / "src" / "assets" / "cityToPrefecture.ts"

VIEW_W = 800
VIEW_H = 640
MAX_POINTS = 40


def ensure_geojson(url: str, path: Path) -> None:
    if path.exists():
        return
    print(f"downloading {url} ...")
    urllib.request.urlretrieve(url, path)


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def rings(geometry: dict) -> list[list[list[float]]]:
    gtype = geometry["type"]
    coords = geometry["coordinates"]
    if gtype == "Polygon":
        return [coords]
    if gtype == "MultiPolygon":
        return coords
    return []


def simplify_ring(ring: list[list[float]]) -> list[list[float]]:
    if len(ring) <= MAX_POINTS:
        return ring[:-1] if ring and ring[0] == ring[-1] else ring
    step = max(1, len(ring) // MAX_POINTS)
    out = ring[::step]
    if ring[0] != out[0]:
        out = [ring[0]] + out
    return out


def collect_bounds(features: list[dict]) -> tuple[float, float, float, float]:
    min_lng = min_lat = 1e9
    max_lng = max_lat = -1e9
    for feat in features:
        for poly in rings(feat["geometry"]):
            for ring in poly:
                for lng, lat in ring:
                    min_lng = min(min_lng, lng)
                    max_lng = max(max_lng, lng)
                    min_lat = min(min_lat, lat)
                    max_lat = max(max_lat, lat)
    return min_lng, max_lng, min_lat, max_lat


def project(lng: float, lat: float, bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    min_lng, max_lng, min_lat, max_lat = bounds
    pad = 16
    w = VIEW_W - pad * 2
    h = VIEW_H - pad * 2
    x = pad + (lng - min_lng) / (max_lng - min_lng) * w
    y = pad + (max_lat - lat) / (max_lat - min_lat) * h
    return round(x, 2), round(y, 2)


def ring_to_path(ring: list[list[float]], bounds) -> str:
    pts = simplify_ring(ring)
    if not pts:
        return ""
    parts: list[str] = []
    for i, (lng, lat) in enumerate(pts):
        x, y = project(lng, lat, bounds)
        parts.append(f"{'M' if i == 0 else 'L'}{x},{y}")
    parts.append("Z")
    return " ".join(parts)


def feature_paths(feat: dict, bounds) -> str:
    subpaths: list[str] = []
    for poly in rings(feat["geometry"]):
        for ring in poly:
            p = ring_to_path(ring, bounds)
            if p:
                subpaths.append(p)
    return " ".join(subpaths)


def feature_centroid(feat: dict, bounds) -> tuple[float, float] | None:
    best: list[list[float]] | None = None
    best_len = 0
    for poly in rings(feat["geometry"]):
        for ring in poly:
            pts = simplify_ring(ring)
            if len(pts) > best_len:
                best = pts
                best_len = len(pts)
    if not best:
        return None
    xs: list[float] = []
    ys: list[float] = []
    for lng, lat in best:
        x, y = project(lng, lat, bounds)
        xs.append(x)
        ys.append(y)
    return round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)


def feature_bbox(feat: dict, bounds) -> tuple[float, float] | None:
    min_x = min_y = 1e9
    max_x = max_y = -1e9
    found = False
    for poly in rings(feat["geometry"]):
        for ring in poly:
            for lng, lat in simplify_ring(ring):
                x, y = project(lng, lat, bounds)
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                found = True
    if not found:
        return None
    return round(max_x - min_x, 2), round(max_y - min_y, 2)


def short_label(raw: str) -> str:
    key = clean_city_key(raw)
    return key if key else raw.strip()


def clean_city_key(raw: str) -> str:
    name = raw.strip()
    for suffix in (
        "特别行政区",
        "维吾尔自治州",
        "蒙古自治州",
        "哈萨克自治州",
        "柯尔克孜自治州",
        "土家族苗族自治州",
        "藏族羌族自治州",
        "彝族自治州",
        "布依族苗族自治州",
        "苗族侗族自治州",
        "哈尼族彝族自治州",
        "壮族苗族自治州",
        "傣族自治州",
        "白族自治州",
        "傣族景颇族自治州",
        "傈僳族自治州",
        "朝鲜族自治州",
        "蒙古族藏族自治州",
        "藏族自治州",
        "回族自治州",
        "维吾尔自治区",
        "壮族自治区",
        "回族自治区",
        "自治州",
        "自治县",
        "地区",
        "盟",
        "市",
        "区",
    ):
        if name.endswith(suffix) and len(name) > len(suffix):
            name = name[: -len(suffix)]
    return name


def prefecture_label(raw: str) -> str:
    return raw.strip()


def main() -> None:
    ensure_geojson("https://unpkg.com/cn-atlas/prefectures.json", PREFECTURES)
    pref_data = load_json(PREFECTURES)
    features = pref_data["features"]
    bounds = collect_bounds(features)

    prefectures: list[dict] = []
    city_map: dict[str, str] = {}

    for feat in features:
        props = feat["properties"]
        pid = str(props.get("id") or props.get("区划码") or "").strip()
        if len(pid) < 4:
            continue
        label = prefecture_label(str(props.get("地名") or props.get("name") or pid))
        path = feature_paths(feat, bounds)
        if not path:
            continue
        centroid = feature_centroid(feat, bounds)
        if not centroid:
            continue
        cx, cy = centroid
        bbox = feature_bbox(feat, bounds)
        if not bbox:
            continue
        bw, bh = bbox
        prefectures.append({
            "id": pid,
            "name": label,
            "label": short_label(label),
            "path": path,
            "cx": cx,
            "cy": cy,
            "w": bw,
            "h": bh,
        })

        key = clean_city_key(label)
        if key:
            city_map[key] = pid
        city_map[label] = pid

    aliases = {
        "北京": next((p["id"] for p in prefectures if p["name"].startswith("北京")), "110000"),
        "上海": next((p["id"] for p in prefectures if p["name"].startswith("上海")), "310000"),
        "天津": next((p["id"] for p in prefectures if p["name"].startswith("天津")), "120000"),
        "重庆": next((p["id"] for p in prefectures if p["name"].startswith("重庆")), "500000"),
    }
    for k, v in aliases.items():
        if v:
            city_map[k] = v

    paths_ts = [
        "/** 离线中国地级市矢量边界（由 scripts/build_china_map.py 生成） */",
        "export type ChinaPrefecturePath = { id: string; name: string; label: string; path: string; cx: number; cy: number; w: number; h: number };",
        "",
        "export const CHINA_PREFECTURE_PATHS: ChinaPrefecturePath[] = ",
        json.dumps(prefectures, ensure_ascii=False, indent=2),
        ";",
        "",
    ]
    OUT_PATHS.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATHS.write_text("\n".join(paths_ts), encoding="utf-8")

    city_ts = [
        "/** 城市名 → 地级市区划码（由 scripts/build_china_map.py 生成） */",
        "export const CITY_TO_PREFECTURE: Record<string, string> = ",
        json.dumps(city_map, ensure_ascii=False, indent=2),
        ";",
        "",
        "const STRIP_SUFFIX = /(特别行政区|自治州|地区|盟|市|区|县)$/u;",
        "",
        "export function resolvePrefectureId(city: string): string | null {",
        "  const raw = city.trim();",
        "  if (!raw) return null;",
        "  if (CITY_TO_PREFECTURE[raw]) return CITY_TO_PREFECTURE[raw];",
        "  const key = raw.replace(STRIP_SUFFIX, '');",
        "  if (CITY_TO_PREFECTURE[key]) return CITY_TO_PREFECTURE[key];",
        "  for (const [name, id] of Object.entries(CITY_TO_PREFECTURE)) {",
        "    const n = name.replace(STRIP_SUFFIX, '');",
        "    if (key === n || key.startsWith(n) || n.startsWith(key)) return id;",
        "  }",
        "  return null;",
        "}",
        "",
    ]
    OUT_CITY.write_text("\n".join(city_ts), encoding="utf-8")

    print(f"wrote {OUT_PATHS} ({OUT_PATHS.stat().st_size} bytes, {len(prefectures)} prefectures)")
    print(f"wrote {OUT_CITY} ({OUT_CITY.stat().st_size} bytes, {len(city_map)} keys)")


if __name__ == "__main__":
    main()
