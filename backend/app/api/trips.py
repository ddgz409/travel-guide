"""攻略路由：生成 / 列表 / 详情 / 编辑 / 重新生成 / 分享 / 导出。"""
import io
import secrets
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Day, Item, Trip, User
from app.schemas import (
    ItemUpdate,
    ReorderRequest,
    TripGenerateRequest,
    TripListItem,
    TripOut,
    TripUpdate,
)
from app.services.generator import GeneratorError, get_generator
from app.services.amap_client import get_amap_client
from app.services.pdf_export import export_trip_pdf

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


def _run_generate(trip_id: str, generator) -> None:
    """后台任务：生成攻略。使用独立数据库会话。"""
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        trip = db.get(Trip, trip_id)
        if trip is None:
            return
        generator.generate(trip, db)
    finally:
        db.close()


@router.get("/pois/search")
def search_pois(
    q: str,
    city: str = "",
    limit: int = 10,
    current: User = Depends(get_current_user),
):
    """搜索景点（供前端搜索框使用）。

    通过高德关键词搜索 POI，返回景点列表含评分。
    """
    if not q.strip():
        return []
    amap = get_amap_client()
    try:
        results = amap.search_poi_by_keyword(
            keyword=q.strip(),
            city=city.strip() or None,
            limit=min(limit, 20),
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
            }
            for p in results
        ]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"搜索失败: {e}")


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
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取攻略详情（含 days/items）。"""
    return _trip_or_404(trip_id, db, current.id)


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
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """编辑单个行程条目。"""
    trip = _trip_or_404(trip_id, db, current.id)
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


@router.post("/{trip_id}/items/{item_id}/swap", response_model=TripOut)
def swap_item_alternative(
    trip_id: str,
    item_id: str,
    alt_index: int = 0,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """将条目替换为第 alt_index 个备选 POI（"换一个"功能）。

    原 POI 放回备选列表末尾，被选中的备选提升为当前条目。
    """
    trip = _trip_or_404(trip_id, db, current.id)
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
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """批量重排序某天的条目（拖拽排序）。"""
    trip = _trip_or_404(trip_id, db, current.id)
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


@router.post("/{trip_id}/regenerate-day/{day_index}", response_model=TripOut)
def regenerate_day(
    trip_id: str,
    day_index: int,
    background_tasks: BackgroundTasks,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """重新生成指定某一天。"""
    trip = _trip_or_404(trip_id, db, current.id)
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
            generator.regenerate_day(trip, day_index, db)
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
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成分享 token（开启匿名只读访问）。"""
    trip = _trip_or_404(trip_id, db, current.id)
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
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """导出攻略为 PDF。"""
    trip = _trip_or_404(trip_id, db, current.id)
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
