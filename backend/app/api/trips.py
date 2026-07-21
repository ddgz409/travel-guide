"""攻略路由：生成 / 列表 / 详情 / 编辑 / 重新生成 / 分享 / 导出。"""
import io
import secrets
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from math import asin, cos, radians, sin, sqrt

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models import Day, Item, Trip, User
from app.schemas import (
    ItemUpdate,
    QuickRecommendRequest,
    QuickRecommendResponse,
    ReorderRequest,
    TripGenerateRequest,
    TripListItem,
    TripOut,
    TripUpdate,
)
from app.services.generator import GeneratorError, get_generator
from app.services.amap_client import POI_TYPES, get_amap_client
from app.services.pdf_export import export_trip_pdf
from app.services.quick_recommend import build_quick_recommend
from app.services.trip_cache import (
    build_cache_key,
    save_trip_to_cache,
    try_clone_from_cache,
)

router = APIRouter(prefix="/trips", tags=["攻略"])


def _trip_or_404(trip_id: str, db: Session, user_id: str | None = None) -> Trip:
    """获取攻略，不存在或无权访问则 404。user_id 为 None 表示允许匿名（分享）。"""
    trip = db.get(Trip, trip_id)
    if trip is None or (user_id is not None and trip.user_id != user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="攻略不存在")
    return trip


@router.post("/generate", response_model=TripOut, status_code=status.HTTP_201_CREATED)
def generate(
    payload: TripGenerateRequest,
    background_tasks: BackgroundTasks,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """提交生成需求。立即创建攻略记录（status=generating），后台异步生成。

    前端用 GET /trips/{id} 轮询 status，ready 后获取完整数据。
    """
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="结束日期不能早于开始日期")

    title = f"{payload.destination}之旅"
    if payload.start_date != payload.end_date:
        title = f"{payload.destination}{(payload.end_date - payload.start_date).days + 1}日游"

    # 合并 must_include 到 preferences
    preferences = dict(payload.preferences)
    if payload.must_include:
        preferences["must_include"] = payload.must_include
    if payload.llm and (payload.llm.get("api_key") or "").strip():
        # 仅供后台任务读取一次，生成后会清除，避免长期落库明文 Key
        preferences["_llm_override"] = {
            "provider": (payload.llm.get("provider") or "").strip() or None,
            "model": (payload.llm.get("model") or "").strip() or None,
            "api_key": payload.llm.get("api_key").strip(),
        }

    days_count = (payload.end_date - payload.start_date).days + 1
    cache_key = build_cache_key(
        destination=payload.destination,
        days_count=days_count,
        preferences=preferences,
        must_include=payload.must_include,
    )
    if cache_key:
        cached = try_clone_from_cache(
            db,
            cache_key=cache_key,
            user_id=current.id,
            destination=payload.destination,
            start_date=payload.start_date,
            end_date=payload.end_date,
            travelers=payload.travelers,
            preferences=preferences,
            title=title,
        )
        if cached is not None:
            return cached

    trip = Trip(
        user_id=current.id,
        title=title,
        destination=payload.destination,
        start_date=payload.start_date,
        end_date=payload.end_date,
        travelers=payload.travelers,
        preferences=preferences,
        status="generating",
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    # 后台异步生成（注意：BackgroundTasks 在响应返回后执行）
    generator = get_generator()
    background_tasks.add_task(_run_generate, trip.id, generator)
    return trip


def _llm_for_trip(db: Session, trip: Trip):
    """按攻略所属用户加载 LLM；若 preferences 含一次性覆盖则优先。"""
    from app.services.llm_client import LLMClient

    prefs = dict(trip.preferences or {})
    override = prefs.pop("_llm_override", None)
    if override:
        trip.preferences = prefs
        db.add(trip)
        db.commit()
        return LLMClient(
            provider=override.get("provider"),
            api_key=override.get("api_key"),
            model=override.get("model"),
        )

    user = db.get(User, trip.user_id)
    return LLMClient.for_user(user)


def _run_generate(trip_id: str, generator) -> None:
    """后台任务：生成攻略。使用独立数据库会话。"""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        trip = db.get(Trip, trip_id)
        if trip is None:
            return
        generator.generate(trip, db, llm=_llm_for_trip(db, trip))
        db.refresh(trip)
        if trip.status == "ready":
            prefs = dict(trip.preferences or {})
            days_count = (trip.end_date - trip.start_date).days + 1
            key = build_cache_key(
                destination=trip.destination,
                days_count=days_count,
                preferences=prefs,
                must_include=prefs.get("must_include") or [],
            )
            save_trip_to_cache(db, trip, key)
    finally:
        db.close()


# 游客用户 ID 固定值，所有游客攻略挂在这个虚拟用户下
GUEST_USER_ID = "00000000-0000-0000-0000-000000000000"


def _ensure_guest_user(db: Session) -> User:
    """确保游客虚拟用户存在。"""
    guest = db.get(User, GUEST_USER_ID)
    if guest is None:
        import secrets as _sec
        guest = User(
            id=GUEST_USER_ID,
            username=f"游客_{_sec.token_hex(4)}",
            password_hash="!",
        )
        db.add(guest)
        db.commit()
    return guest


@router.post("/guest-generate", response_model=TripOut, status_code=status.HTTP_201_CREATED)
def guest_generate(
    payload: TripGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """游客模式生成攻略（无需登录）。"""
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="结束日期不能早于开始日期")

    guest = _ensure_guest_user(db)

    title = f"{payload.destination}之旅"
    if payload.start_date != payload.end_date:
        title = f"{payload.destination}{(payload.end_date - payload.start_date).days + 1}日游"

    preferences = dict(payload.preferences)
    if payload.must_include:
        preferences["must_include"] = payload.must_include
    if payload.llm and (payload.llm.get("api_key") or "").strip():
        preferences["_llm_override"] = {
            "provider": (payload.llm.get("provider") or "").strip() or None,
            "model": (payload.llm.get("model") or "").strip() or None,
            "api_key": payload.llm.get("api_key").strip(),
        }

    days_count = (payload.end_date - payload.start_date).days + 1
    cache_key = build_cache_key(
        destination=payload.destination,
        days_count=days_count,
        preferences=preferences,
        must_include=payload.must_include,
    )
    if cache_key:
        cached = try_clone_from_cache(
            db,
            cache_key=cache_key,
            user_id=guest.id,
            destination=payload.destination,
            start_date=payload.start_date,
            end_date=payload.end_date,
            travelers=payload.travelers,
            preferences=preferences,
            title=title,
        )
        if cached is not None:
            return cached

    trip = Trip(
        user_id=guest.id,
        title=title,
        destination=payload.destination,
        start_date=payload.start_date,
        end_date=payload.end_date,
        travelers=payload.travelers,
        preferences=preferences,
        status="generating",
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)

    generator = get_generator()
    background_tasks.add_task(_run_generate, trip.id, generator)
    return trip


@router.post("/quick-recommend", response_model=QuickRecommendResponse)
def quick_recommend(payload: QuickRecommendRequest):
    """快速参考：不调模型、不建行程，返回两套小红书/携程入口卡片。"""
    return build_quick_recommend(payload.destination)


@router.get("/pois/search")
def search_pois(
    q: str,
    city: str = "",
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """搜索景点（供前端搜索框使用）。强制按城市限定，避免串到故宫/长城。"""
    if not q.strip():
        return []
    amap = get_amap_client()
    city_s = city.strip()
    keyword = q.strip()
    try:
        # 多取一些再按名称相关度重排：高德常把热门公园（天坛等）排在「故宫」前面
        fetch_n = min(max(limit * 3, 15), 25)
        results = amap.search_poi_by_keyword(
            keyword=keyword,
            city=city_s or None,
            limit=fetch_n,
            city_limit=bool(city_s),
            poi_type=POI_TYPES["attraction"],
        )
        # 无结果时放宽类型再搜一次（仍限城市）
        if not results and city_s:
            results = amap.search_poi_by_keyword(
                keyword=keyword,
                city=city_s,
                limit=fetch_n,
                city_limit=True,
            )

        def _name_score(name: str) -> int:
            n = (name or "").strip()
            if not n:
                return -1
            if n == keyword:
                return 1000
            if n.startswith(keyword) or keyword.startswith(n):
                return 900
            if keyword in n:
                return 800
            if n in keyword:
                return 700
            # 核心词（去常见后缀）命中
            core = (
                keyword.replace("博物院", "")
                .replace("博物馆", "")
                .replace("风景名胜区", "")
                .replace("风景区", "")
                .replace("公园", "")
                .replace("广场", "")
                .strip()
            )
            if core and len(core) >= 2 and core in n:
                return 650
            return 0

        ranked = sorted(results, key=lambda p: (-_name_score(p.name), -(p.rating or 0)))
        # 有名称命中时丢掉完全不相关的热门串项
        relevant = [p for p in ranked if _name_score(p.name) > 0]
        final = (relevant or ranked)[: min(limit, 20)]

        return [
            {
                "poi_id": p.id,
                "name": p.name,
                "location": {
                    "lng": p.lng,
                    "lat": p.lat,
                    "address": p.address,
                },
                "rating": p.rating,
                "type": p.type,
                "address": p.address,
            }
            for p in final
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"搜索失败: {e}")


@router.get("/pois/suggest")
def suggest_pois(city: str = ""):
    """返回目的地热门必去景点名称（本地库，供搜索框推荐芯片）。"""
    from app.services.destination_landmarks import landmarks_for

    names = landmarks_for(city.strip())
    return {"city": city.strip(), "landmarks": names[:12]}


@router.get("", response_model=list[TripListItem])
def list_trips(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """列出我的攻略。"""
    stmt = (
        select(Trip)
        .where(Trip.user_id == current.id)
        .order_by(Trip.created_at.desc())
    )
    return list(db.scalars(stmt))


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """获取攻略详情（含 days/items）。"""
    return _trip_or_404(trip_id, db, current.id if current else None)


@router.put("/{trip_id}", response_model=TripOut)
def update_trip(
    trip_id: str,
    payload: TripUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """编辑攻略元信息。"""
    trip = _trip_or_404(trip_id, db, current.id)
    if payload.title is not None:
        trip.title = payload.title
    if payload.preferences is not None:
        trip.preferences = payload.preferences
    db.commit()
    db.refresh(trip)
    return trip


@router.put("/{trip_id}/items/{item_id}", response_model=TripOut)
def update_item(
    trip_id: str,
    item_id: str,
    payload: ItemUpdate,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """编辑单个行程条目。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")

    for field in ("name", "description", "duration_min", "cost", "time_slot", "poi_id", "rating"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(item, field, val)
    if payload.location is not None:
        item.location = payload.location
    # 自选编辑：取消/恢复勾选
    if payload.selected is not None:
        item.selected = payload.selected
    db.commit()
    db.refresh(trip)
    return trip


def _plan_and_save_transport(
    item: Item,
    next_item: Item,
    trip: Trip,
    mode: str,
    db: Session,
    scheme_index: int = 0,
) -> dict:
    """按指定模式规划并写回 transport_to_next。"""
    if not item.location or not next_item.location:
        raise HTTPException(status_code=400, detail="缺少坐标，无法规划路线")
    origin = f"{item.location['lng']},{item.location['lat']}"
    dest = f"{next_item.location['lng']},{next_item.location['lat']}"
    amap = get_amap_client()
    if mode == "transit":
        seg = amap.plan_route(origin, dest, mode="transit", city=trip.destination)
    else:
        seg = amap.plan_route(origin, dest, mode=mode)
    if not seg:
        raise HTTPException(status_code=502, detail="路线规划失败，请稍后重试")

    detail = seg.detail
    distance_m = seg.distance_m
    duration_s = seg.duration_s
    polyline = getattr(seg, "polyline", None) or None
    schemes = getattr(seg, "schemes", None) or None
    if mode == "transit" and schemes:
        idx = max(0, min(scheme_index, len(schemes) - 1))
        chosen = schemes[idx]
        detail = chosen.get("detail") or detail
        distance_m = int(chosen.get("distance_m") or distance_m)
        duration_s = int(chosen.get("duration_s") or duration_s)
        polyline = chosen.get("polyline") or polyline

    from_loc = {
        "lng": float(item.location["lng"]),
        "lat": float(item.location["lat"]),
        "name": item.name,
    }
    to_loc = {
        "lng": float(next_item.location["lng"]),
        "lat": float(next_item.location["lat"]),
        "name": next_item.name,
    }

    transport = dict(item.transport_to_next or {})
    transport.update(
        {
            "mode": mode,
            "distance_m": distance_m,
            "duration_s": duration_s,
            "detail": detail,
            "schemes": schemes,
            "scheme_index": scheme_index if mode == "transit" else 0,
            "polyline": polyline,
            "from_location": from_loc,
            "to_location": to_loc,
        }
    )
    item.transport_to_next = transport
    db.commit()
    db.refresh(item)
    return transport


@router.get("/{trip_id}/items/{item_id}/route")
def get_item_route(
    trip_id: str,
    item_id: str,
    mode: str | None = None,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """获取条目到下一站的详细路线（换乘方案+时间）。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")

    transport = item.transport_to_next or {}
    next_item = db.scalar(
        select(Item).where(Item.day_id == item.day_id, Item.seq == item.seq + 1)
    )
    if not next_item:
        return {**transport, "detail": transport.get("detail"), "to_name": None}

    want_mode = mode or transport.get("mode") or "transit"
    # 已有同模式详情+折线则直接返回；缺折线时重规划以便地图可视化
    if (
        transport.get("detail")
        and transport.get("mode") == want_mode
        and transport.get("polyline")
        and (want_mode != "transit" or transport.get("schemes"))
    ):
        return {
            **transport,
            "to_name": next_item.name,
            "from_name": item.name,
            "from_location": transport.get("from_location")
            or {
                "lng": item.location["lng"],
                "lat": item.location["lat"],
                "name": item.name,
            },
            "to_location": transport.get("to_location")
            or {
                "lng": next_item.location["lng"],
                "lat": next_item.location["lat"],
                "name": next_item.name,
            },
        }

    try:
        transport = _plan_and_save_transport(item, next_item, trip, want_mode, db)
    except HTTPException:
        if transport:
            return {**transport, "to_name": next_item.name, "from_name": item.name}
        raise
    return {**transport, "to_name": next_item.name, "from_name": item.name}


@router.post("/{trip_id}/items/{item_id}/route")
def update_item_route(
    trip_id: str,
    item_id: str,
    payload: dict,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """修改交通方式或选用某套公交方案。payload: {mode, scheme_index?}"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")
    next_item = db.scalar(
        select(Item).where(Item.day_id == item.day_id, Item.seq == item.seq + 1)
    )
    if not next_item:
        raise HTTPException(status_code=400, detail="已是当天最后一站")

    mode = (payload or {}).get("mode") or "transit"
    if mode not in ("walking", "transit", "driving"):
        raise HTTPException(status_code=400, detail="不支持的交通方式")
    scheme_index = int((payload or {}).get("scheme_index") or 0)
    transport = _plan_and_save_transport(
        item, next_item, trip, mode, db, scheme_index=scheme_index
    )
    return {**transport, "to_name": next_item.name, "from_name": item.name}


def _haversine_m_loc(a: dict, b: dict) -> float:
    lng1, lat1 = float(a["lng"]), float(a["lat"])
    lng2, lat2 = float(b["lng"]), float(b["lat"])
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    x = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    )
    return 2 * 6371000 * asin(sqrt(x))


@router.get("/{trip_id}/map-routes/{day_id}")
def get_day_routes(
    trip_id: str,
    day_id: str,
    mode: str = "transit",
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """规划当天全部景点间路线（逐段串联成完整一日线）。

    优先复用条目上已缓存的 transport_to_next；其余段并行请求高德，降低卡顿。
    """
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    day = db.get(Day, day_id)
    if day is None or day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="日程不存在")
    if mode not in ("walking", "transit", "driving"):
        raise HTTPException(status_code=400, detail="不支持的交通方式")

    items = list(
        db.scalars(select(Item).where(Item.day_id == day.id).order_by(Item.seq)).all()
    )
    located: list[Item] = []
    for it in items:
        if it.selected is False or it.selected == 0:
            continue
        loc = it.location or {}
        if loc.get("lng") is None or loc.get("lat") is None:
            continue
        located.append(it)

    amap = get_amap_client()
    city = trip.destination
    expected = max(0, len(located) - 1)
    pairs = [(located[i], located[i + 1]) for i in range(len(located) - 1)]

    def _cached_segment(a: Item, b: Item) -> dict | None:
        t = a.transport_to_next or {}
        poly = t.get("polyline") or []
        if len(poly) < 2:
            return None
        used = t.get("mode") or mode
        # 同模式，或地图仅需折线时接受已有方案（标 fallback）
        if used != mode and not (mode == "transit" and used in ("walking", "transit")):
            return None
        return {
            "from_item_id": a.id,
            "to_item_id": b.id,
            "from_name": a.name,
            "to_name": b.name,
            "mode": used,
            "distance_m": int(t.get("distance_m") or 0),
            "duration_s": int(t.get("duration_s") or 0),
            "polyline": poly,
            "fallback": used != mode,
            "cached": True,
        }

    def _plan_pair(a: Item, b: Item, prefer: str) -> dict:
        cached = _cached_segment(a, b)
        if cached:
            return cached

        origin = f"{a.location['lng']},{a.location['lat']}"
        dest = f"{b.location['lng']},{b.location['lat']}"
        dist = _haversine_m_loc(a.location, b.location)
        # 少试几种模式，避免每段串行打满高德
        if prefer == "transit" and dist < 900:
            order = ["walking"]
        elif prefer == "transit":
            order = ["transit", "walking"]
        elif prefer == "driving":
            order = ["driving", "walking"]
        else:
            order = ["walking"]

        for m in order:
            try:
                if m == "transit":
                    seg = amap.plan_route(
                        origin, dest, mode="transit", city=city
                    )
                else:
                    seg = amap.plan_route(origin, dest, mode=m)
            except Exception:
                seg = None
            if not seg:
                continue
            poly = getattr(seg, "polyline", None) or []
            if m == "transit" and getattr(seg, "schemes", None):
                poly = seg.schemes[0].get("polyline") or poly
            if len(poly) < 2:
                continue
            return {
                "from_item_id": a.id,
                "to_item_id": b.id,
                "from_name": a.name,
                "to_name": b.name,
                "mode": m,
                "distance_m": seg.distance_m,
                "duration_s": seg.duration_s,
                "polyline": poly,
                "fallback": m != prefer,
            }

        return {
            "from_item_id": a.id,
            "to_item_id": b.id,
            "from_name": a.name,
            "to_name": b.name,
            "mode": "direct",
            "distance_m": int(dist),
            "duration_s": 0,
            "polyline": [
                [float(a.location["lng"]), float(a.location["lat"])],
                [float(b.location["lng"]), float(b.location["lat"])],
            ],
            "fallback": True,
        }

    # 并行规划各段（高德调用占主要耗时）
    results: dict[int, dict] = {}
    workers = min(6, max(1, len(pairs)))
    if pairs:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(_plan_pair, a, b, mode): i for i, (a, b) in enumerate(pairs)
            }
            for fut in as_completed(futures):
                i = futures[fut]
                try:
                    results[i] = fut.result()
                except Exception:
                    a, b = pairs[i]
                    results[i] = {
                        "from_item_id": a.id,
                        "to_item_id": b.id,
                        "from_name": a.name,
                        "to_name": b.name,
                        "mode": "direct",
                        "distance_m": int(
                            _haversine_m_loc(a.location, b.location)
                        ),
                        "duration_s": 0,
                        "polyline": [
                            [float(a.location["lng"]), float(a.location["lat"])],
                            [float(b.location["lng"]), float(b.location["lat"])],
                        ],
                        "fallback": True,
                    }

    segments = [results[i] for i in range(len(pairs))]

    full_polyline: list[list[float]] = []
    for s in segments:
        pts = s.get("polyline") or []
        if not pts:
            continue
        if not full_polyline:
            full_polyline.extend(pts)
        else:
            full_polyline.extend(pts[1:] if pts[0] == full_polyline[-1] else pts)

    total_s = sum(int(s.get("duration_s") or 0) for s in segments)
    total_m = sum(int(s.get("distance_m") or 0) for s in segments)
    return {
        "mode": mode,
        "day_id": day_id,
        "segments": segments,
        "polyline": full_polyline,
        "stop_count": len(located),
        "segment_count": len(segments),
        "expected_segments": expected,
        "total_duration_s": total_s,
        "total_distance_m": total_m,
    }


@router.post("/{trip_id}/items/{item_id}/swap", response_model=TripOut)
def swap_item_alternative(
    trip_id: str,
    item_id: str,
    alt_index: int = 0,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """将条目替换为第 alt_index 个备选 POI（"换一个"功能）。

    原 POI 放回备选列表末尾，被选中的备选提升为当前条目。
    """
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")

    alts = item.alternatives or []
    if not alts:
        raise HTTPException(status_code=400, detail="该条目没有备选")
    if alt_index < 0 or alt_index >= len(alts):
        raise HTTPException(status_code=400, detail="备选序号超出范围")

    # 保存当前条目信息，放回备选
    current_info = {
        "poi_id": item.poi_id,
        "name": item.name,
        "location": item.location,
        "rating": item.rating,
        "address": (item.location or {}).get("address") if item.location else None,
    }
    chosen = alts.pop(alt_index)
    alts.append(current_info)

    # 应用备选
    item.poi_id = chosen.get("poi_id")
    item.name = chosen.get("name", item.name)
    item.location = chosen.get("location")
    item.rating = chosen.get("rating")
    item.alternatives = alts
    db.commit()
    db.refresh(trip)
    return trip


@router.put("/{trip_id}/days/{day_id}/reorder", response_model=TripOut)
def reorder_items(
    trip_id: str,
    day_id: str,
    payload: ReorderRequest,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """批量重排序某天的条目（拖拽排序）。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    day = db.get(Day, day_id)
    if day is None or day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="行程天数不存在")

    for entry in payload.items:
        item = db.get(Item, entry.item_id)
        if item is None or item.day_id != day.id:
            raise HTTPException(status_code=400, detail=f"条目 {entry.item_id} 不属于该天")
        item.seq = entry.new_seq
    db.commit()
    db.refresh(trip)
    return trip


@router.post("/{trip_id}/select-route/{route_id}", response_model=TripOut)
def select_route(
    trip_id: str,
    route_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """切换到已生成的某条路线方案（经典/人文/美食等）。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    if trip.status != "ready":
        raise HTTPException(status_code=400, detail="攻略尚未生成完成")
    generator = get_generator()
    try:
        generator.apply_route(trip, route_id, db)
    except GeneratorError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(trip)
    return trip


@router.post("/{trip_id}/regenerate-day/{day_index}", response_model=TripOut)
def regenerate_day(
    trip_id: str,
    day_index: int,
    background_tasks: BackgroundTasks,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """重新生成指定某一天。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    total_days = (trip.end_date - trip.start_date).days + 1
    if day_index < 1 or day_index > total_days:
        raise HTTPException(status_code=400, detail="天数超出范围")

    generator = get_generator()
    background_tasks.add_task(_run_regen_day, trip.id, day_index, generator)
    db.refresh(trip)
    return trip


def _run_regen_day(trip_id: str, day_index: int, generator) -> None:
    """后台任务：重新生成某天。"""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        trip = db.get(Trip, trip_id)
        if trip is None:
            return
        try:
            generator.regenerate_day(
                trip, day_index, db, llm=_llm_for_trip(db, trip)
            )
        except GeneratorError as e:
            # 标记失败但不影响其他天
            from app.core.database import SessionLocal as _SL
            db.rollback()
            db2 = _SL()
            t2 = db2.get(Trip, trip_id)
            if t2:
                t2.status = "failed"
                t2.error_msg = f"第{day_index}天重生成失败: {e}"
                db2.commit()
            db2.close()
    finally:
        db.close()


@router.post("/{trip_id}/share", response_model=TripOut)
def create_share_link(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """生成分享 token（开启匿名只读访问）。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    if not trip.share_token:
        trip.share_token = secrets.token_urlsafe(16)
    db.commit()
    db.refresh(trip)
    return trip


@router.get("/share/{token}", response_model=TripOut)
def get_shared_trip(token: str, db: Session = Depends(get_db)):
    """匿名访问分享的攻略（只读）。"""
    trip = db.scalar(select(Trip).where(Trip.share_token == token))
    if trip is None:
        raise HTTPException(status_code=404, detail="分享链接无效")
    return trip


@router.get("/{trip_id}/export")
def export_trip(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """导出攻略为 PDF。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    if trip.status != "ready":
        raise HTTPException(status_code=400, detail="攻略尚未生成完成，无法导出")
    pdf_bytes = export_trip_pdf(trip)
    filename = f"{trip.title}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip(
    trip_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除攻略。"""
    trip = _trip_or_404(trip_id, db, current.id)
    db.delete(trip)
    db.commit()
