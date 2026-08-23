"""攻略路由：生成 / 列表 / 详情 / 编辑 / 重新生成 / 分享 / 导出。"""
import io
import json
import re
import secrets
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from math import asin, cos, radians, sin, sqrt
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models import Day, Item, Trip, TripCollaborator, User
from app.schemas import (
    CityAddRequest,
    CollaboratorOut,
    ItemCreate,
    ItemUpdate,
    QuickRecommendRequest,
    QuickRecommendResponse,
    ReorderRequest,
    ShareCreateRequest,
    TripGenerateRequest,
    TripListItem,
    TripOut,
    TripUpdate,
    ValidateDestinationRequest,
    ValidateDestinationResponse,
)
from app.services.generator import GeneratorError, get_generator
from app.services.amap_client import AmapError, POI_TYPES, get_amap_client
from app.services.destination_landmarks import resolve_landmarks
from app.services.pdf_export import export_trip_pdf
from app.services.quick_recommend import build_quick_recommend
from app.services.destination_validator import check_destination, check_route_city, parse_route
from app.services.generation_progress import get_progress
from app.services.trip_cache import (
    build_cache_key,
    save_trip_to_cache,
    try_clone_from_cache,
)

router = APIRouter(prefix="/trips", tags=["攻略"])

# 游客攻略挂在这个虚拟用户下
GUEST_USER_ID = "00000000-0000-0000-0000-000000000000"


def _require_valid_destination(destination: str) -> None:
    """无效地名直接 400，避免创建 generating 行程后再失败。"""
    result = check_destination(destination)
    if not result.valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.message)


def _resolve_route(destination: str, route: list[str] | None) -> list[str] | None:
    """解析是否多城市路线。

    优先用显式 route；否则尝试从 destination 字符串解析。
    返回城市序列（多城市）或 None（单城市）。会校验每个城市。
    """
    cities = [c.strip() for c in (route or []) if c and c.strip()]
    if not cities:
        parsed, is_route = parse_route(destination)
        if is_route and len(parsed) >= 2:
            cities = parsed
    if not cities:
        return None
    # 逐个宽松校验（信任知名旅游城市 + 别名，避免「茶卡」「敦煌」被误判）
    for c in cities:
        r = check_route_city(c)
        if not r.valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"路线中的「{c}」无效：{r.message}",
            )
    return cities


def _route_title(destination: str, cities: list[str] | None, days_count: int) -> str:
    if cities and len(cities) >= 2:
        return f"{'·'.join(cities)} {days_count}日游"
    return f"{destination}{days_count}日游" if days_count > 1 else f"{destination}之旅"


def _trip_or_404(trip_id: str, db: Session, user_id: str | None = None) -> Trip:
    """获取攻略，不存在或无权访问则 404。user_id 为 None 表示允许匿名（分享）。"""
    trip = db.get(Trip, trip_id)
    if trip is None or (user_id is not None and trip.user_id != user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="攻略不存在")
    return trip


def _is_collaborator(trip_id: str, user_id: str, db: Session) -> bool:
    return (
        db.scalar(
            select(TripCollaborator.id).where(
                TripCollaborator.trip_id == trip_id,
                TripCollaborator.user_id == user_id,
            )
        )
        is not None
    )


def _can_edit_trip(trip: Trip, user: User | None, db: Session) -> bool:
    if user is None:
        return trip.user_id == GUEST_USER_ID
    if trip.user_id == user.id:
        return True
    return _is_collaborator(trip.id, user.id, db)


def _trip_for_viewer(trip_id: str, db: Session, user: User | None) -> Trip:
    """按 trip_id 访问：匿名（游客轮询）、主人或协作者可看；其他人 404。"""
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="攻略不存在")
    if user is None:
        return trip
    if trip.user_id == user.id or _is_collaborator(trip.id, user.id, db):
        return trip
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="攻略不存在")


def _require_edit(trip_id: str, db: Session, user: User | None) -> Trip:
    trip = _trip_for_viewer(trip_id, db, user)
    if not _can_edit_trip(trip, user, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有编辑权限")
    return trip


def _collaborators_payload(trip: Trip, db: Session) -> list[dict]:
    owner = db.get(User, trip.user_id)
    rows: list[dict] = []
    if owner:
        rows.append(
            {
                "user_id": owner.id,
                "username": owner.username,
                "role": "owner",
                "joined_at": trip.created_at,
                "avatar": owner.avatar,
            }
        )
    collabs = db.scalars(
        select(TripCollaborator)
        .where(TripCollaborator.trip_id == trip.id)
        .order_by(TripCollaborator.joined_at)
    ).all()
    for c in collabs:
        if c.user_id == trip.user_id:
            continue
        u = db.get(User, c.user_id)
        if not u:
            continue
        rows.append(
            {
                "user_id": u.id,
                "username": u.username,
                "role": "collaborator",
                "joined_at": c.joined_at,
                "avatar": u.avatar,
            }
        )
    return rows


def _trip_out(trip: Trip, db: Session, user: User | None) -> TripOut:
    data = TripOut.model_validate(trip)
    data.share_mode = trip.share_mode or "read"
    data.can_edit = _can_edit_trip(trip, user, db)
    data.collaborators = [CollaboratorOut(**row) for row in _collaborators_payload(trip, db)]
    return data


def _shared_trip_or_404(token: str, db: Session) -> Trip:
    trip = db.scalar(select(Trip).where(Trip.share_token == token))
    if trip is None:
        raise HTTPException(status_code=404, detail="分享链接无效")
    return trip


@router.get("/share/{token}", response_model=TripOut)
def get_shared_trip(
    token: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """访问分享攻略。只读链接可匿名；协作链接需登录后 join 才能编辑。"""
    trip = _shared_trip_or_404(token, db)
    return _trip_out(trip, db, current)


@router.post("/share/{token}/join", response_model=TripOut)
def join_shared_trip(
    token: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """登录用户加入协作。只读分享加入后仍不能编辑。"""
    trip = _shared_trip_or_404(token, db)
    if (
        trip.share_mode == "collab"
        and trip.user_id != current.id
        and not _is_collaborator(trip.id, current.id, db)
    ):
        db.add(TripCollaborator(trip_id=trip.id, user_id=current.id))
        db.commit()
        db.refresh(trip)
    return _trip_out(trip, db, current)


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

    cities = _resolve_route(payload.destination, payload.route)
    if not cities:
        _require_valid_destination(payload.destination)

    days_count = (payload.end_date - payload.start_date).days + 1
    title = _route_title(payload.destination, cities, days_count)

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
            "base_url": (payload.llm.get("base_url") or "").strip() or None,
        }

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
            return _trip_out(cached, db, current)

    trip = Trip(
        user_id=current.id,
        title=title,
        destination=payload.destination,
        route=cities,
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
    return _trip_out(trip, db, current)


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
            base_url=override.get("base_url"),
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

    cities = _resolve_route(payload.destination, payload.route)
    if not cities:
        _require_valid_destination(payload.destination)

    guest = _ensure_guest_user(db)

    days_count = (payload.end_date - payload.start_date).days + 1
    title = _route_title(payload.destination, cities, days_count)

    preferences = dict(payload.preferences)
    if payload.must_include:
        preferences["must_include"] = payload.must_include
    if payload.llm and (payload.llm.get("api_key") or "").strip():
        preferences["_llm_override"] = {
            "provider": (payload.llm.get("provider") or "").strip() or None,
            "model": (payload.llm.get("model") or "").strip() or None,
            "api_key": payload.llm.get("api_key").strip(),
            "base_url": (payload.llm.get("base_url") or "").strip() or None,
        }

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
            return _trip_out(cached, db, None)

    trip = Trip(
        user_id=guest.id,
        title=title,
        destination=payload.destination,
        route=cities,
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
    return _trip_out(trip, db, None)


@router.post("/quick-recommend", response_model=QuickRecommendResponse)
def quick_recommend(payload: QuickRecommendRequest):
    """快速参考：不调模型、不建行程，返回两套小红书/携程入口卡片。"""
    return build_quick_recommend(payload.destination)


@router.post("/validate-destination", response_model=ValidateDestinationResponse)
def validate_destination(payload: ValidateDestinationRequest):
    """校验目的地是否真实存在（高德地理编码）；多城市路线会逐个校验。"""
    return _validate_destination_response(payload.destination)


@router.get("/validate-destination", response_model=ValidateDestinationResponse)
def validate_destination_get(destination: str):
    """校验目的地（GET，兼容旧网关或未部署 POST 路由的环境）。"""
    return _validate_destination_response(destination)


def _validate_destination_response(destination: str) -> dict:
    """路线敏感的校验：多城市拆开逐个校验，单城市走原逻辑。"""
    cities, is_route = parse_route(destination)
    if is_route and len(cities) >= 2:
        for c in cities:
            r = check_route_city(c)
            if not r.valid:
                return {
                    "valid": False,
                    "message": f"路线中的「{c}」无效：{r.message}",
                    "resolved_name": None,
                    "suggestions": [],
                }
        return {
            "valid": True,
            "message": "",
            "resolved_name": destination,
            "suggestions": [],
        }
    return check_destination(destination).to_dict()


@router.get("/pois/search")
def search_pois(
    q: str,
    city: str = "",
    limit: int = 10,
    broad: bool = False,
    lng: float | None = None,
    lat: float | None = None,
    db: Session = Depends(get_db),
):
    """搜索景点（供前端搜索框使用）。有坐标时优先按当前城市/周边搜索。"""
    if not q.strip():
        return []
    amap = get_amap_client()
    city_s = city.strip().replace("市", "")
    keyword = q.strip()
    try:
        adcode = ""
        has_coords = lng is not None and lat is not None
        location = f"{lng},{lat}" if has_coords else ""

        # 有坐标时以坐标逆地理为准，避免前端缓存的旧城市（如北京）串城
        if has_coords:
            try:
                geo = amap.regeo(lng, lat)
                raw = (geo.get("city") or geo.get("province") or "").strip()
                if raw:
                    city_s = raw.replace("市", "")
                adcode = str(geo.get("adcode") or "")[:6]
            except Exception:
                pass

        cap = min(max(limit, 1), 100 if broad else 20)
        chip_types = {
            "美食": POI_TYPES["meal"],
            "酒店": POI_TYPES["hotel"],
            "景点": POI_TYPES["attraction"],
        }

        if broad:
            merged: list = []
            seen_ids: set[str] = set()

            def _append(batch: list) -> None:
                for p in batch:
                    if p.id in seen_ids:
                        continue
                    seen_ids.add(p.id)
                    merged.append(p)

            if has_coords:
                try:
                    _append(
                        amap.search_poi_around(
                            location=location,
                            keywords=keyword,
                            radius=50000,
                            limit=cap,
                            sortrule="distance",
                        )
                    )
                except Exception:
                    pass

                poi_type = chip_types.get(keyword)
                if poi_type and len(merged) < cap:
                    try:
                        _append(
                            amap.search_poi_around(
                                location=location,
                                poi_type=poi_type,
                                radius=30000,
                                limit=cap - len(merged),
                                sortrule="distance",
                            )
                        )
                    except Exception:
                        pass

            city_key = adcode or city_s
            if len(merged) < cap and city_key:
                per_page = 25
                for page in range(1, 3):
                    try:
                        batch = amap.search_poi_by_keyword(
                            keyword=keyword,
                            city=city_key,
                            limit=per_page,
                            page=page,
                            city_limit=True,
                            location_center=location if has_coords else None,
                        )
                    except Exception:
                        batch = []
                    before = len(merged)
                    _append(batch)
                    if len(merged) >= cap or len(batch) < per_page or len(merged) == before:
                        break

            if len(merged) < cap and not has_coords:
                per_page = 25
                max_pages = min(4, max(1, (cap + per_page - 1) // per_page))
                for page in range(1, max_pages + 1):
                    batch = amap.search_poi_by_keyword(
                        keyword=keyword,
                        city=city_s or None,
                        limit=per_page,
                        page=page,
                        city_limit=bool(city_s),
                    )
                    before = len(merged)
                    _append(batch)
                    if len(merged) >= cap or len(batch) < per_page or len(merged) == before:
                        break

            final = merged[:cap]
        else:
            fetch_n = min(max(limit * 3, 15), 25)
            results = amap.search_poi_by_keyword(
                keyword=keyword,
                city=city_s or None,
                limit=fetch_n,
                city_limit=bool(city_s),
                poi_type=POI_TYPES["attraction"],
            )
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
                "tel": p.tel or "",
                "opentime": p.opentime or "",
            }
            for p in final
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"搜索失败: {e}")


@router.get("/pois/nearby")
def nearby_pois(
    lng: float,
    lat: float,
    type: str = "attraction",
    limit: int = 10,
):
    """地图选点：返回点击坐标周边的 POI（按距离排序），供新增地点选择。

    type: attraction / meal / hotel，决定周边搜索类型。
    """
    if type not in ("attraction", "meal", "hotel"):
        raise HTTPException(status_code=400, detail="不支持的 POI 类型")
    try:
        amap = get_amap_client()
        cap = min(max(limit, 1), 30)
        pois = amap.search_poi_around(
            location=f"{lng},{lat}",
            poi_type=POI_TYPES[type],
            radius=6000,
            limit=cap,
            sortrule="distance",
        )
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
                "tel": p.tel or "",
                "opentime": p.opentime or "",
            }
            for p in pois
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"周边搜索失败: {e}")


@router.get("/pois/suggest")
def suggest_pois(city: str = ""):
    """返回目的地热门必去景点（本地精选 + 高德补全，供搜索框推荐芯片）。"""
    city_s = city.strip()
    if not city_s:
        return {"city": "", "landmarks": []}
    names = resolve_landmarks(city_s, get_amap_client(), limit=12)
    return {"city": city_s, "landmarks": names}


@router.get("", response_model=list[TripListItem])
def list_trips(current: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """列出我创建的以及我作为协作者的攻略。"""
    collab_ids = select(TripCollaborator.trip_id).where(
        TripCollaborator.user_id == current.id
    )
    stmt = (
        select(Trip)
        .where(or_(Trip.user_id == current.id, Trip.id.in_(collab_ids)))
        .order_by(Trip.created_at.desc())
    )
    return list(db.scalars(stmt))


@router.get("/{trip_id}/generate-stream")
def trip_generate_stream(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """SSE 推送行程生成进度与 LLM 流式预览。"""
    _trip_for_viewer(trip_id, db, current)

    def event_stream():
        last_sig = ""
        while True:
            trip = db.get(Trip, trip_id)
            if trip is None:
                yield f"data: {json.dumps({'status': 'failed', 'message': '攻略不存在'}, ensure_ascii=False)}\n\n"
                break
            prog = get_progress(trip_id)
            payload = {
                "status": trip.status,
                "phase": prog.get("phase", ""),
                "message": prog.get("message", ""),
                "preview": prog.get("preview", ""),
                "readable": prog.get("readable", ""),
            }
            sig = json.dumps(payload, sort_keys=True, ensure_ascii=False)
            if sig != last_sig:
                yield f"data: {sig}\n\n"
                last_sig = sig
            if trip.status in ("ready", "failed"):
                yield f"data: {json.dumps({'status': trip.status, 'done': True, 'error_msg': trip.error_msg, 'readable': prog.get('readable', '')}, ensure_ascii=False)}\n\n"
                break
            time.sleep(0.2)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{trip_id}/progress")
def trip_generate_progress(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """轮询行程生成进度（React Native SSE 降级用）。"""
    trip = _trip_for_viewer(trip_id, db, current)
    prog = get_progress(trip_id)
    return {
        "status": trip.status,
        "phase": prog.get("phase", ""),
        "message": prog.get("message", ""),
        "preview": prog.get("preview", ""),
        "readable": prog.get("readable", ""),
        "done": trip.status in ("ready", "failed"),
        "error_msg": trip.error_msg,
    }


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """获取攻略详情（含 days/items）。主人或协作者可访问。"""
    trip = _trip_for_viewer(trip_id, db, current)
    return _trip_out(trip, db, current)


@router.put("/{trip_id}", response_model=TripOut)
def update_trip(
    trip_id: str,
    payload: TripUpdate,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """编辑攻略元信息。"""
    trip = _require_edit(trip_id, db, current)
    if payload.title is not None:
        trip.title = payload.title
    if payload.preferences is not None:
        trip.preferences = payload.preferences
    db.commit()
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.put("/{trip_id}/items/{item_id}", response_model=TripOut)
def update_item(
    trip_id: str,
    item_id: str,
    payload: ItemUpdate,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """编辑单个行程条目。"""
    trip = _require_edit(trip_id, db, current)
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
    return _trip_out(trip, db, current)


def _has_coords(loc: dict | None) -> bool:
    if not loc:
        return False
    return loc.get("lng") is not None and loc.get("lat") is not None


def _next_routable_item(item: Item, db: Session) -> Item | None:
    """当天后续第一个仍勾选且有坐标的站点（跳过已取消/无坐标）。"""
    rows = db.scalars(
        select(Item)
        .where(Item.day_id == item.day_id, Item.seq > item.seq)
        .order_by(Item.seq)
    ).all()
    for n in rows:
        if n.selected is False or n.selected == 0:
            continue
        if _has_coords(n.location):
            return n
    return None


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
    trip = _trip_for_viewer(trip_id, db, current)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")

    transport = item.transport_to_next or {}
    if not _has_coords(item.location):
        raise HTTPException(status_code=400, detail="当前站点缺少坐标，无法规划路线")
    next_item = _next_routable_item(item, db)
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
    trip = _require_edit(trip_id, db, current)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")
    if not _has_coords(item.location):
        raise HTTPException(status_code=400, detail="当前站点缺少坐标，无法规划路线")
    next_item = _next_routable_item(item, db)
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
    trip = _trip_for_viewer(trip_id, db, current)
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
        # 旧数据曾把「到本站」误存在本站；校验终点坐标，避免错用缓存
        to_loc = t.get("to_location") or {}
        if to_loc.get("lng") is not None and to_loc.get("lat") is not None:
            try:
                if (
                    abs(float(to_loc["lng"]) - float(b.location["lng"])) > 1e-3
                    or abs(float(to_loc["lat"]) - float(b.location["lat"])) > 1e-3
                ):
                    return None
            except (TypeError, ValueError, KeyError):
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


def _least_crowded_slot(items: list[Item]) -> str:
    """新增条目缺省时段：选当天最空（不含交通）的时段，平手优先下午。"""
    counts = {"morning": 0, "afternoon": 0, "evening": 0}
    for it in items:
        if it.type != "transport" and it.time_slot in counts:
            counts[it.time_slot] += 1
    min_count = min(counts.values())
    candidates = [s for s, c in counts.items() if c == min_count]
    for preferred in ("afternoon", "morning", "evening"):
        if preferred in candidates:
            return preferred
    return "afternoon"


def _sync_city_transit_items(trip: Trip, db: Session) -> None:
    """按路线为每个城市段首日同步头部「前往 xx」交通条目。

    添加/删除城市后调用：段首日若存在上一城则保留/修正头部 transport 条目，
    否则删除多余的头部 transport，保证跨城段展示与路线一致。
    """
    if not trip.route:
        return
    days = sorted(
        db.scalars(select(Day).where(Day.trip_id == trip.id)).all(),
        key=lambda d: d.day_index,
    )
    prev_city: str | None = None
    last_city: str | None = None
    for day in days:
        city = (day.city or trip.destination or "").strip()
        if not city:
            last_city = None
            prev_city = None
            continue
        first_of_segment = city != last_city
        items = list(
            db.scalars(
                select(Item).where(Item.day_id == day.id).order_by(Item.seq)
            ).all()
        )
        head = None
        if items:
            it0 = items[0]
            loc = it0.location or {}
            has_coords = loc.get("lng") is not None and loc.get("lat") is not None
            if it0.type == "transport" and not has_coords:
                head = it0
        if first_of_segment:
            if prev_city:
                if head is not None:
                    head.name = f"前往 {city}"
                    head.description = (
                        f"从 {prev_city} 乘车前往 {city}，中途可稍作休整、补给。"
                    )
                else:
                    new_head = Item(
                        day_id=day.id,
                        seq=0,
                        time_slot="morning",
                        type="transport",
                        name=f"前往 {city}",
                        description=(
                            f"从 {prev_city} 乘车前往 {city}，中途可稍作休整、补给。"
                        ),
                        duration_min=240,
                        cost=150,
                        poi_id=None,
                        location=None,
                        rating=None,
                        selected=True,
                        alternatives=[],
                    )
                    db.add(new_head)
                    db.flush()
                    for it in items:
                        it.seq += 1
            else:
                if head is not None:
                    db.delete(head)
                    db.flush()
                    remaining = db.scalars(
                        select(Item).where(Item.day_id == day.id).order_by(Item.seq)
                    ).all()
                    for idx, it in enumerate(remaining):
                        it.seq = idx
        last_city = city
        if first_of_segment:
            prev_city = city
    db.commit()


def _replan_day_transport(day: Day, db: Session, trip: Trip) -> None:
    """按当前顺序重算当天已勾选且有坐标条目的交通段并写回 transport_to_next。

    复用缓存（终点一致且已有折线）的段不重算；其余并行请求高德，失败段保留旧缓存。
    """
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

    if len(located) < 2:
        # 不足两站：清空无意义的交通缓存
        for it in items:
            it.transport_to_next = None
        db.commit()
        return

    amap = get_amap_client()
    city = (day.city or trip.destination) or trip.destination
    pairs = [(located[i], located[i + 1]) for i in range(len(located) - 1)]

    def _cached_ok(a: Item, b: Item) -> bool:
        t = a.transport_to_next or {}
        if not t.get("polyline"):
            return False
        to_loc = t.get("to_location") or {}
        try:
            if to_loc.get("lng") is not None and abs(
                float(to_loc["lng"]) - float(b.location["lng"])
            ) > 1e-3:
                return False
            if to_loc.get("lat") is not None and abs(
                float(to_loc["lat"]) - float(b.location["lat"])
            ) > 1e-3:
                return False
        except (TypeError, ValueError, KeyError):
            return False
        return True

    def _plan(a: Item, b: Item) -> dict | None:
        origin = f"{a.location['lng']},{a.location['lat']}"
        dest = f"{b.location['lng']},{b.location['lat']}"
        try:
            seg = amap.plan_route(origin, dest, mode="transit", city=city)
        except Exception:
            seg = None
        if not seg:
            return None
        poly = getattr(seg, "polyline", None) or []
        schemes = getattr(seg, "schemes", None) or None
        detail = getattr(seg, "detail", None)
        distance_m = seg.distance_m
        duration_s = seg.duration_s
        if schemes:
            chosen = schemes[0]
            poly = chosen.get("polyline") or poly
            detail = chosen.get("detail") or detail
            distance_m = int(chosen.get("distance_m") or distance_m)
            duration_s = int(chosen.get("duration_s") or duration_s)
        return {
            "mode": "transit",
            "distance_m": distance_m,
            "duration_s": duration_s,
            "detail": detail,
            "schemes": schemes,
            "scheme_index": 0,
            "polyline": poly,
            "from_location": {
                "lng": float(a.location["lng"]),
                "lat": float(a.location["lat"]),
                "name": a.name,
            },
            "to_location": {
                "lng": float(b.location["lng"]),
                "lat": float(b.location["lat"]),
                "name": b.name,
            },
        }

    plan_tasks: list[tuple[int, Item, Item]] = []
    for i, (a, b) in enumerate(pairs):
        if not _cached_ok(a, b):
            plan_tasks.append((i, a, b))

    planned: dict[int, dict | None] = {}
    if plan_tasks:
        workers = min(6, max(1, len(plan_tasks)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_plan, a, b): idx for idx, a, b in plan_tasks}
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    planned[idx] = fut.result()
                except Exception:
                    planned[idx] = None

    for i, (a, b) in enumerate(pairs):
        if i not in planned:
            continue  # 缓存仍有效
        data = planned[i]
        if data is None:
            continue  # 规划失败，保留旧缓存
        a.transport_to_next = data

    # 清理不再有「下一站」的条目：未勾选/无坐标，或当天的最后一个站点
    located_ids = {it.id for it in located}
    for it in items:
        if it.id not in located_ids:
            it.transport_to_next = None
    if located:
        located[-1].transport_to_next = None
    db.commit()


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
    trip = _require_edit(trip_id, db, current)
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
    return _trip_out(trip, db, current)


@router.put("/{trip_id}/days/{day_id}/reorder", response_model=TripOut)
def reorder_items(
    trip_id: str,
    day_id: str,
    payload: ReorderRequest,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """批量重排序某天的条目（拖拽排序）。"""
    trip = _require_edit(trip_id, db, current)
    day = db.get(Day, day_id)
    if day is None or day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="行程天数不存在")

    for entry in payload.items:
        item = db.get(Item, entry.item_id)
        if item is None or item.day_id != day.id:
            raise HTTPException(status_code=400, detail=f"条目 {entry.item_id} 不属于该天")
        item.seq = entry.new_seq
    db.commit()
    # 按新顺序重算当天交通段（松手后一次性重规划）
    _replan_day_transport(day, db, trip)
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.post("/{trip_id}/days/{day_id}/items", response_model=TripOut)
def add_day_item(
    trip_id: str,
    day_id: str,
    payload: ItemCreate,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """向某天新增一个地点（地图选点 / 搜索添加），并重算当天路线。"""
    trip = _require_edit(trip_id, db, current)
    day = db.get(Day, day_id)
    if day is None or day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="行程天数不存在")

    existing = db.scalars(
        select(Item).where(Item.day_id == day.id).order_by(Item.seq)
    ).all()
    next_seq = max([it.seq for it in existing], default=-1) + 1
    time_slot = payload.time_slot or _least_crowded_slot(existing)

    item = Item(
        day_id=day.id,
        seq=next_seq,
        time_slot=time_slot,
        type=payload.type,
        name=payload.name,
        poi_id=payload.poi_id,
        location=payload.location,
        description=payload.description,
        duration_min=payload.duration_min,
        cost=payload.cost,
        rating=payload.rating,
        selected=True,
        alternatives=[],
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    _replan_day_transport(day, db, trip)
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.delete("/{trip_id}/items/{item_id}", response_model=TripOut)
def delete_day_item(
    trip_id: str,
    item_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """真正删除某天的一个地点，并重排剩余条目序号、重算当天路线。"""
    trip = _require_edit(trip_id, db, current)
    item = db.get(Item, item_id)
    if item is None or item.day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="条目不存在")
    day_id = item.day_id
    db.delete(item)
    db.commit()

    day = db.get(Day, day_id)
    if day is not None:
        remaining = db.scalars(
            select(Item).where(Item.day_id == day.id).order_by(Item.seq)
        ).all()
        for idx, it in enumerate(remaining):
            it.seq = idx
        db.commit()
        _replan_day_transport(day, db, trip)
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.post("/{trip_id}/cities", response_model=TripOut)
def add_city(
    trip_id: str,
    payload: CityAddRequest,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """向路线新增一个城市：插入为新的一天，顺移后续天数并延长行程。

    填充该城市热点景点（本地精选 + 高德补全，确定性可靠，不调 LLM）。
    """
    trip = _require_edit(trip_id, db, current)
    if trip.status != "ready":
        raise HTTPException(status_code=400, detail="攻略尚未生成完成")

    result = check_route_city(payload.city)
    if not result.valid:
        raise HTTPException(status_code=400, detail=result.message or "城市无效")
    city = (result.resolved_name or payload.city).strip()

    total_days = (trip.end_date - trip.start_date).days + 1
    position = payload.position
    if position < 1:
        raise HTTPException(status_code=400, detail="插入位置无效")
    if position > total_days:
        position = total_days + 1  # 末尾追加

    # 更新路线城市序列（单城市→多城市自动补原目的地）
    route = [c for c in (trip.route or [trip.destination]) if c]
    route.insert(position - 1, city)
    trip.route = route

    # 顺移其后所有天
    days = list(db.scalars(select(Day).where(Day.trip_id == trip.id)).all())
    for d in days:
        if d.day_index >= position:
            d.day_index += 1

    new_day = Day(
        trip_id=trip.id,
        day_index=position,
        date=trip.start_date + timedelta(days=position - 1),
        city=city,
        summary=f"在 {city} 的活动",
    )
    db.add(new_day)
    db.flush()

    # 填充该城市热点景点（本地精选 + 高德补全，确定性）
    amap = get_amap_client()
    names = resolve_landmarks(city, amap, limit=8)

    def _geo(name: str) -> dict | None:
        try:
            g = amap.geocode(name)
        except AmapError:
            return None
        if (
            g is None
            or not g.lng
            or not g.lat
            or (abs(g.lng) < 0.01 and abs(g.lat) < 0.01)
        ):
            return None
        return {"lng": float(g.lng), "lat": float(g.lat), "name": name}

    coords_map: dict[str, dict | None] = {}
    if names:
        workers = min(6, max(1, len(names)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_geo, n): n for n in names}
            for fut in as_completed(futures):
                coords_map[futures[fut]] = fut.result()

    slots = ("morning", "afternoon", "evening")
    seq = 0
    for i, name in enumerate(names):
        loc = coords_map.get(name)
        if not loc:
            continue
        db.add(
            Item(
                day_id=new_day.id,
                seq=seq,
                time_slot=slots[i % len(slots)],
                type="attraction",
                name=name,
                poi_id=None,
                location=loc,
                description=None,
                duration_min=90,
                cost=0,
                rating=None,
                selected=True,
                alternatives=[],
            )
        )
        seq += 1

    # 头部跨城交通 + 所有天日期重算 + 延长期限
    _sync_city_transit_items(trip, db)
    all_days = db.scalars(select(Day).where(Day.trip_id == trip.id)).all()
    for d in all_days:
        d.date = trip.start_date + timedelta(days=d.day_index - 1)
    trip.end_date = trip.end_date + timedelta(days=1)

    # 重算新天及紧随其后一天的交通
    _replan_day_transport(new_day, db, trip)
    following = db.scalar(
        select(Day)
        .where(Day.trip_id == trip.id, Day.day_index == position + 1)
        .order_by(Day.day_index)
    )
    if following is not None:
        _replan_day_transport(following, db, trip)

    db.commit()
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.delete("/{trip_id}/cities/{city}", response_model=TripOut)
def delete_city(
    trip_id: str,
    city: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """从路线删除一个城市：移除其所有天（含条目），顺移剩余天并缩短行程。

    按城市名删除：同一城市出现多次（如青甘环线起点）会一并移除，UI 需提示。
    """
    trip = _require_edit(trip_id, db, current)
    if trip.status != "ready":
        raise HTTPException(status_code=400, detail="攻略尚未生成完成")

    city_s = city.strip()
    if not city_s:
        raise HTTPException(status_code=400, detail="城市无效")
    targets = list(
        db.scalars(
            select(Day).where(Day.trip_id == trip.id, Day.city == city_s)
        ).all()
    )
    if not targets:
        raise HTTPException(status_code=404, detail=f"「{city_s}」不在路线中")
    if len(trip.days or []) - len(targets) < 1:
        raise HTTPException(status_code=400, detail="至少保留一天行程")

    for d in targets:
        db.delete(d)  # items 级联删除
    db.flush()

    # 剩余天重排序号与日期
    remaining = sorted(
        db.scalars(select(Day).where(Day.trip_id == trip.id)).all(),
        key=lambda d: d.day_index,
    )
    for i, d in enumerate(remaining, start=1):
        d.day_index = i
        d.date = trip.start_date + timedelta(days=i - 1)

    # 从路线移除该城市（重复出现一并移除）
    route = [c for c in (trip.route or []) if c and c != city_s]
    trip.route = route or None

    # 缩短期限
    trip.end_date = trip.end_date - timedelta(days=len(targets))

    # 修正跨城段展示（内部 commit）
    _sync_city_transit_items(trip, db)

    db.commit()
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.post("/{trip_id}/days/{day_id}/replan", response_model=TripOut)
def replan_day(
    trip_id: str,
    day_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """AI 重排当天路线：按坐标最近邻优化景点访问顺序（确定性算法，不调 LLM）。"""
    trip = _require_edit(trip_id, db, current)
    day = db.get(Day, day_id)
    if day is None or day.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="行程天数不存在")

    items = list(
        db.scalars(select(Item).where(Item.day_id == day.id).order_by(Item.seq)).all()
    )
    transports = [it for it in items if it.type == "transport"]
    rest = [it for it in items if it.type != "transport"]
    if len(rest) < 2:
        db.refresh(trip)
        return _trip_out(trip, db, current)

    # 序列化为 _optimize_day_visit_order 需要的 dict，并挂回原条目
    dicts: list[dict] = []
    for it in rest:
        d: dict = {
            "time_slot": it.time_slot or "morning",
            "type": it.type,
            "name": it.name,
            "location": it.location,
            "duration_min": it.duration_min,
            "cost": it.cost,
            "rating": it.rating,
        }
        d["_item"] = it
        dicts.append(d)

    generator = get_generator()
    ordered = generator._optimize_day_visit_order(dicts)

    # 重写 seq：transport 固定在头部保持原相对顺序，其后按优化结果
    seq = 0
    for it in transports:
        it.seq = seq
        seq += 1
    for d in ordered:
        d["_item"].seq = seq
        seq += 1
    db.commit()

    _replan_day_transport(day, db, trip)
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.post("/{trip_id}/select-route/{route_id}", response_model=TripOut)
def select_route(
    trip_id: str,
    route_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """切换到已生成的某条路线方案（经典/人文/美食等）。"""
    trip = _require_edit(trip_id, db, current)
    if trip.status != "ready":
        raise HTTPException(status_code=400, detail="攻略尚未生成完成")
    generator = get_generator()
    try:
        generator.apply_route(trip, route_id, db)
    except GeneratorError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.post("/{trip_id}/regenerate-day/{day_index}", response_model=TripOut)
def regenerate_day(
    trip_id: str,
    day_index: int,
    background_tasks: BackgroundTasks,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """重新生成指定某一天。"""
    trip = _require_edit(trip_id, db, current)
    total_days = (trip.end_date - trip.start_date).days + 1
    if day_index < 1 or day_index > total_days:
        raise HTTPException(status_code=400, detail="天数超出范围")

    generator = get_generator()
    background_tasks.add_task(_run_regen_day, trip.id, day_index, generator)
    db.refresh(trip)
    return _trip_out(trip, db, current)


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
    payload: ShareCreateRequest | None = None,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """生成分享 token。mode=collab 时好友登录后可共同编辑。"""
    trip = _trip_or_404(trip_id, db, current.id if current else None)
    mode = (payload.mode if payload else "read") or "read"
    if mode not in ("read", "collab"):
        raise HTTPException(status_code=400, detail="无效的分享模式")
    if not trip.share_token:
        trip.share_token = secrets.token_urlsafe(16)
    trip.share_mode = mode
    db.commit()
    db.refresh(trip)
    return _trip_out(trip, db, current)


@router.get("/{trip_id}/export")
def export_trip(
    trip_id: str,
    current: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """导出攻略为 PDF。"""
    trip = _trip_for_viewer(trip_id, db, current)
    if trip.status != "ready":
        raise HTTPException(status_code=400, detail="攻略尚未生成完成，无法导出")
    pdf_bytes = export_trip_pdf(trip)
    # 文件名含中文时 Content-Disposition 需用 RFC 5987（filename*=UTF-8''...）转码，
    # 否则 latin-1 编码头会抛 UnicodeEncodeError 导致 500。
    # 注意：Python 正则 \w 默认匹配中文，必须用显式 ASCII 白名单。
    ascii_name = re.sub(r"[^A-Za-z0-9_\-]+", "_", trip.title) or "trip"
    utf8_name = quote(trip.title)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}.pdf"; '
                f"filename*=UTF-8''{utf8_name}.pdf"
            )
        },
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
