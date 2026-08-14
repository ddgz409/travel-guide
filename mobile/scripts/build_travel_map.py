"""生成旅行地图用的省级矢量（Albers 中国标准投影，保持真实比例）。"""
from __future__ import annotations

import json
import math
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROVINCES = ROOT / "_provinces.json"
OUT_PATHS = ROOT.parent / "src" / "assets" / "chinaProvincePaths.ts"

# 标准中国 Albers 等积圆锥
PHI1 = math.radians(25)
PHI2 = math.radians(47)
PHI0 = math.radians(0)
LAM0 = math.radians(105)

# 略简化，保留贴纸感但不锯齿
MAX_POINTS = 96
# 排除南海诸岛，避免把整张图拉得又高又空
MIN_LAT = 17.8
PAD = 36
TARGET_W = 1000

LABELS = {
    "11": "北京",
    "12": "天津",
    "13": "河北",
    "14": "山西",
    "15": "内蒙古",
    "21": "辽宁",
    "22": "吉林",
    "23": "黑龙江",
    "31": "上海",
    "32": "江苏",
    "33": "浙江",
    "34": "安徽",
    "35": "福建",
    "36": "江西",
    "37": "山东",
    "41": "河南",
    "42": "湖北",
    "43": "湖南",
    "44": "广东",
    "45": "广西",
    "46": "海南",
    "50": "重庆",
    "51": "四川",
    "52": "贵州",
    "53": "云南",
    "54": "西藏",
    "61": "陕西",
    "62": "甘肃",
    "63": "青海",
    "64": "宁夏",
    "65": "新疆",
    "71": "台湾",
    "81": "香港",
    "82": "澳门",
}


def n_albers() -> float:
    return (math.sin(PHI1) + math.sin(PHI2)) / 2


N = n_albers()
C = math.cos(PHI1) ** 2 + 2 * N * math.sin(PHI1)
RHO0 = math.sqrt(C - 2 * N * math.sin(PHI0)) / N


def albers(lng: float, lat: float) -> tuple[float, float]:
    lam = math.radians(lng)
    phi = math.radians(lat)
    rho = math.sqrt(max(0.0, C - 2 * N * math.sin(phi))) / N
    theta = N * (lam - LAM0)
    x = rho * math.sin(theta)
    y = RHO0 - rho * math.cos(theta)
    return x, y


def ensure_geojson(url: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 1000:
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


def keep_ring(ring: list[list[float]]) -> bool:
    if len(ring) < 4:
        return False
    lats = [p[1] for p in ring]
    lngs = [p[0] for p in ring]
    if max(lats) < MIN_LAT:
        return False
    # 丢掉特别偏南的小岛，保留海南
    if min(lats) < 15 and max(lats) < 18:
        return False
    if min(lngs) < 70 or max(lngs) > 140:
        return False
    return True


def simplify_ring(ring: list[list[float]]) -> list[list[float]]:
    pts = ring[:-1] if ring and ring[0] == ring[-1] else list(ring)
    if len(pts) <= MAX_POINTS:
        return pts
    step = max(1, len(pts) // MAX_POINTS)
    out = pts[::step]
    if pts[0] != out[0]:
        out = [pts[0]] + out
    if pts[-1] != out[-1]:
        out.append(pts[-1])
    return out


def shoelace(pts: list[tuple[float, float]]) -> float:
    area = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return abs(area) * 0.5


def smooth_ring(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """轻微圆滑，接近参考图的贴纸描边。"""
    n = len(pts)
    if n < 4:
        return pts
    out: list[tuple[float, float]] = []
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        out.append((0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1))
        out.append((0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1))
    return out


def keep_main_rings(polys: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    if not polys:
        return []
    scored = [(shoelace(p), p) for p in polys]
    scored.sort(key=lambda t: t[0], reverse=True)
    largest = scored[0][0]
    kept: list[list[tuple[float, float]]] = []
    for area, pts in scored:
        if area >= max(largest * 0.12, 1e-8):
            kept.append(pts)
    return kept or [scored[0][1]]


def province_key(props: dict) -> str:
    pid = str(props.get("id") or props.get("adcode") or props.get("区划码") or "").strip()
    if len(pid) >= 2:
        return pid[:2]
    name = str(props.get("name") or props.get("地名") or "")
    for key, label in LABELS.items():
        if label in name:
            return key
    return pid


def main() -> None:
    urls = [
        "https://unpkg.com/cn-atlas/provinces.json",
        "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
    ]
    last_err: Exception | None = None
    for url in urls:
        try:
            if not PROVINCES.exists() or PROVINCES.stat().st_size < 1000:
                print(f"downloading {url} ...")
                urllib.request.urlretrieve(url, PROVINCES)
            data = load_json(PROVINCES)
            if data.get("features"):
                break
        except Exception as e:
            last_err = e
            if PROVINCES.exists():
                PROVINCES.unlink()
    else:
        raise SystemExit(f"failed to load provinces geojson: {last_err}")

    features = data["features"]
    print("features", len(features), "keys", list(features[0].get("properties", {}).keys())[:12])

    projected: list[dict] = []
    all_xy: list[tuple[float, float]] = []

    for feat in features:
        props = feat.get("properties") or {}
        key = province_key(props)
        if key not in LABELS:
            continue
        polys: list[list[tuple[float, float]]] = []
        for poly in rings(feat["geometry"]):
            for ring in poly[:1]:  # 只要外环，去掉省内空洞碎线
                if not keep_ring(ring):
                    continue
                pts = [albers(lng, lat) for lng, lat in simplify_ring(ring)]
                if len(pts) >= 4:
                    polys.append(smooth_ring(pts))
        polys = keep_main_rings(polys)
        if not polys:
            continue
        for pts in polys:
            all_xy.extend(pts)
        projected.append({"key": key, "polys": polys})

    if not all_xy:
        raise SystemExit("no projected points")

    min_x = min(p[0] for p in all_xy)
    max_x = max(p[0] for p in all_xy)
    min_y = min(p[1] for p in all_xy)
    max_y = max(p[1] for p in all_xy)
    span_x = max_x - min_x
    span_y = max_y - min_y
    scale = (TARGET_W - PAD * 2) / span_x
    view_w = TARGET_W
    view_h = int(round(span_y * scale + PAD * 2))

    def to_svg(x: float, y: float) -> tuple[float, float]:
        sx = PAD + (x - min_x) * scale
        sy = PAD + (max_y - y) * scale
        return round(sx, 2), round(sy, 2)

    provinces: list[dict] = []
    for item in projected:
        paths: list[str] = []
        xs: list[float] = []
        ys: list[float] = []
        for pts in item["polys"]:
            parts: list[str] = []
            for i, (x, y) in enumerate(pts):
                sx, sy = to_svg(x, y)
                xs.append(sx)
                ys.append(sy)
                parts.append(f"{'M' if i == 0 else 'L'}{sx},{sy}")
            parts.append("Z")
            paths.append(" ".join(parts))
        minx, maxx = min(xs), max(xs)
        miny, maxy = min(ys), max(ys)
        provinces.append({
            "key": item["key"],
            "label": LABELS[item["key"]],
            "path": " ".join(paths),
            "cx": round(sum(xs) / len(xs), 2),
            "cy": round(sum(ys) / len(ys), 2),
            "minX": round(minx, 2),
            "minY": round(miny, 2),
            "maxX": round(maxx, 2),
            "maxY": round(maxy, 2),
        })

    provinces.sort(key=lambda p: p["key"])

    out = [
        "/** 旅行地图省级边界（Albers 中国投影，由 scripts/build_travel_map.py 生成） */",
        "export const TRAVEL_MAP_VIEW = { w: %d, h: %d };" % (view_w, view_h),
        "",
        "export type ChinaProvincePath = {",
        "  key: string;",
        "  label: string;",
        "  path: string;",
        "  cx: number;",
        "  cy: number;",
        "  minX: number;",
        "  minY: number;",
        "  maxX: number;",
        "  maxY: number;",
        "};",
        "",
        "export const CHINA_PROVINCE_PATHS: ChinaProvincePath[] = ",
        json.dumps(provinces, ensure_ascii=False, indent=2),
        ";",
        "",
    ]
    OUT_PATHS.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {OUT_PATHS} viewBox={view_w}x{view_h} provinces={len(provinces)}")
    print("keys", [p["key"] + p["label"] for p in provinces])


if __name__ == "__main__":
    main()
