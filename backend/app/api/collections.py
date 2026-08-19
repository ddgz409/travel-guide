"""探索页共享收藏夹：发布、浏览、订阅。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models import CollectionSubscription, SharedCollection, User
from app.services.amap_client import AmapError, get_amap_client
from app.schemas.collection import (
    CollectionCreate,
    CollectionDetail,
    CollectionListResponse,
    CollectionPlaceOut,
    CollectionSummary,
    CollectionUpdate,
)

router = APIRouter(prefix="/collections", tags=["共享收藏夹"])

_SEED: list[dict] = [
    {
        "title": "常去的 9 个上海自习圣地",
        "summary": "安静、有插座、适合待一下午的自习好去处",
        "emoji": "📚",
        "city": "上海",
        "author_display": "沪上旅人",
        "places": [
            {"name": "上海图书馆", "city": "上海", "address": "淮海中路1555号"},
            {"name": "徐家汇书院", "city": "上海", "address": "漕溪北路158号"},
            {"name": "浦东图书馆", "city": "上海", "address": "迎春路300号"},
            {"name": "思南书局", "city": "上海", "address": "复兴中路517号"},
            {"name": "茑屋书店", "city": "上海", "address": "延安西路1262号"},
            {"name": "钟书阁", "city": "上海", "address": "泰晤士小镇"},
            {"name": "单向空间", "city": "上海", "address": "长乐路422号"},
            {"name": "猫的天空之城", "city": "上海", "address": "大学路"},
        ],
    },
    {
        "title": "北京周边 8 个轻徒步路线",
        "summary": "周末一日往返，新手友好",
        "emoji": "🌲",
        "city": "北京",
        "author_display": "山野客",
        "places": [
            {"name": "香山公园", "city": "北京", "address": "海淀区买卖街40号"},
            {"name": "八大处公园", "city": "北京", "address": "石景山区"},
            {"name": "百望山森林公园", "city": "北京", "address": "海淀区"},
            {"name": "凤凰岭", "city": "北京", "address": "海淀区"},
            {"name": "妙峰山", "city": "北京", "address": "门头沟区"},
            {"name": "戒台寺", "city": "北京", "address": "门头沟区"},
            {"name": "潭柘寺", "city": "北京", "address": "门头沟区"},
            {"name": "云蒙山", "city": "北京", "address": "密云区"},
        ],
    },
    {
        "title": "杭州 8 家宝藏咖啡馆",
        "summary": "西湖边与巷弄里的慢生活",
        "emoji": "☕",
        "city": "杭州",
        "author_display": "江南慢游",
        "places": [
            {"name": "西湖国宾馆", "city": "杭州", "address": "杨公堤18号"},
            {"name": "青芝坞", "city": "杭州", "address": "玉古路"},
            {"name": "小河直街", "city": "杭州", "address": "拱墅区"},
            {"name": "南宋御街", "city": "杭州", "address": "上城区"},
            {"name": "龙井村", "city": "杭州", "address": "西湖区"},
            {"name": "满觉陇", "city": "杭州", "address": "西湖区"},
            {"name": "灵隐寺", "city": "杭州", "address": "法云弄1号"},
            {"name": "九溪烟树", "city": "杭州", "address": "西湖区"},
        ],
    },
    {
        "title": "成都 8 家地道苍蝇馆子",
        "summary": "本地人才知道的平价美味",
        "emoji": "🍜",
        "city": "成都",
        "author_display": "吃货地图",
        "places": [
            {"name": "宽窄巷子", "city": "成都", "address": "青羊区"},
            {"name": "锦里古街", "city": "成都", "address": "武侯区"},
            {"name": "建设路", "city": "成都", "address": "成华区"},
            {"name": "玉林路", "city": "成都", "address": "武侯区"},
            {"name": "奎星楼街", "city": "成都", "address": "青羊区"},
            {"name": "抚琴夜市", "city": "成都", "address": "金牛区"},
            {"name": "文殊院", "city": "成都", "address": "青羊区"},
            {"name": "人民公园", "city": "成都", "address": "青羊区"},
        ],
    },
    {
        "title": "厦门 8 个看海发呆点",
        "summary": "海风、日落与放空",
        "emoji": "🌊",
        "city": "厦门",
        "author_display": "岛民日记",
        "places": [
            {"name": "鼓浪屿", "city": "厦门", "address": "思明区"},
            {"name": "曾厝垵", "city": "厦门", "address": "思明区"},
            {"name": "环岛路", "city": "厦门", "address": "思明区"},
            {"name": "白城沙滩", "city": "厦门", "address": "思明区"},
            {"name": "黄厝海滩", "city": "厦门", "address": "思明区"},
            {"name": "五缘湾", "city": "厦门", "address": "湖里区"},
            {"name": "集美学村", "city": "厦门", "address": "集美区"},
            {"name": "沙坡尾", "city": "厦门", "address": "思明区"},
        ],
    },
]


def _poi_name_score(keyword: str, poi_name: str) -> int:
    kw = (keyword or "").strip()
    name = (poi_name or "").strip()
    if not kw or not name:
        return -1
    if name == kw:
        return 1000
    if name.startswith(kw) or kw.startswith(name):
        return 900
    if kw in name:
        return 800
    if name in kw:
        return 700
    return 0


def _enrich_place_with_amap(place: dict) -> dict:
    """用高德 POI 补全收藏夹地点的 poi_id / 坐标 / 地址。"""
    if (
        place.get("lng") is not None
        and place.get("lat") is not None
        and place.get("poi_id")
    ):
        return place

    name = str(place.get("name") or "").strip()
    city = str(place.get("city") or "").strip().replace("市", "")
    if not name:
        return place

    amap = get_amap_client()
    if not (amap.api_key or "").strip():
        return place

    try:
        batch = amap.search_poi_by_keyword(
            keyword=name,
            city=city or None,
            limit=8,
            city_limit=bool(city),
        )
        if not batch and city:
            batch = amap.search_poi_by_keyword(name, city=city, limit=8, city_limit=True)
        if not batch:
            return place

        ranked = sorted(batch, key=lambda p: (-_poi_name_score(name, p.name), -(p.rating or 0)))
        best = ranked[0]
        if _poi_name_score(name, best.name) <= 0:
            best = batch[0]

        enriched = dict(place)
        enriched["poi_id"] = best.id
        enriched["lng"] = best.lng
        enriched["lat"] = best.lat
        if best.address:
            enriched["address"] = best.address
        return enriched
    except AmapError:
        return place
    except Exception:
        return place


def _enrich_places(places: list[dict]) -> list[dict]:
    return [_enrich_place_with_amap(dict(p)) for p in places]


def _enrich_collections_if_needed(db: Session) -> None:
    """已有收藏夹若缺坐标，用高德 POI 补全并写回数据库。"""
    rows = db.scalars(select(SharedCollection)).all()
    changed = False
    for row in rows:
        raw = row.places or []
        if not raw:
            continue
        if all(
            p.get("lng") is not None and p.get("lat") is not None and p.get("poi_id")
            for p in raw
        ):
            continue
        enriched = _enrich_places(raw)
        if enriched != raw:
            row.places = enriched
            changed = True
    if changed:
        db.commit()


def _ensure_seed(db: Session) -> None:
    count = db.scalar(select(func.count()).select_from(SharedCollection)) or 0
    if count > 0:
        return
    for item in _SEED:
        places = _enrich_places(item["places"])
        db.add(
            SharedCollection(
                user_id=None,
                title=item["title"],
                summary=item.get("summary"),
                emoji=item.get("emoji", "📁"),
                city=item.get("city"),
                author_display=item.get("author_display", "知径旅人"),
                places=places,
                is_public=True,
            )
        )
    db.commit()


def _subscriber_count(db: Session, collection_id: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(CollectionSubscription)
            .where(CollectionSubscription.collection_id == collection_id)
        )
        or 0
    )


def _is_subscribed(db: Session, collection_id: str, user_id: str | None) -> bool:
    if not user_id:
        return False
    row = db.scalar(
        select(CollectionSubscription.id).where(
            CollectionSubscription.collection_id == collection_id,
            CollectionSubscription.user_id == user_id,
        )
    )
    return row is not None


def _to_summary(
    row: SharedCollection,
    db: Session,
    user_id: str | None,
) -> CollectionSummary:
    places = row.places or []
    cover = [CollectionPlaceOut.model_validate(p) for p in places[:3]]
    return CollectionSummary(
        id=row.id,
        title=row.title,
        summary=row.summary,
        emoji=row.emoji or "📁",
        city=row.city,
        author_display=row.author_display or "旅人",
        place_count=len(places),
        subscriber_count=_subscriber_count(db, row.id),
        subscribed=_is_subscribed(db, row.id, user_id),
        cover_places=cover,
        created_at=row.created_at,
    )


def _to_detail(
    row: SharedCollection,
    db: Session,
    user_id: str | None,
) -> CollectionDetail:
    base = _to_summary(row, db, user_id)
    places = [CollectionPlaceOut.model_validate(p) for p in (row.places or [])]
    return CollectionDetail(
        **base.model_dump(),
        places=places,
        is_owner=bool(user_id and row.user_id == user_id),
    )


@router.get("", response_model=CollectionListResponse)
def list_collections(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """公开收藏夹列表（探索页）。"""
    _ensure_seed(db)
    total = (
        db.scalar(
            select(func.count())
            .select_from(SharedCollection)
            .where(SharedCollection.is_public.is_(True))
        )
        or 0
    )
    rows = db.scalars(
        select(SharedCollection)
        .where(SharedCollection.is_public.is_(True))
        .order_by(SharedCollection.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    uid = user.id if user else None
    return CollectionListResponse(
        items=[_to_summary(r, db, uid) for r in rows],
        total=total,
    )


@router.get("/subscribed", response_model=CollectionListResponse)
def list_subscribed(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """当前用户已订阅的收藏夹。"""
    rows = db.scalars(
        select(SharedCollection)
        .join(CollectionSubscription, CollectionSubscription.collection_id == SharedCollection.id)
        .where(CollectionSubscription.user_id == user.id)
        .order_by(CollectionSubscription.subscribed_at.desc())
    ).all()
    return CollectionListResponse(
        items=[_to_summary(r, db, user.id) for r in rows],
        total=len(rows),
    )


@router.get("/mine", response_model=CollectionListResponse)
def list_mine(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """当前用户发布的收藏夹。"""
    rows = db.scalars(
        select(SharedCollection)
        .where(SharedCollection.user_id == user.id)
        .order_by(SharedCollection.updated_at.desc())
    ).all()
    return CollectionListResponse(
        items=[_to_summary(r, db, user.id) for r in rows],
        total=len(rows),
    )


@router.get("/{collection_id}", response_model=CollectionDetail)
def get_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    row = db.get(SharedCollection, collection_id)
    if not row or not row.is_public:
        raise HTTPException(status_code=404, detail="收藏夹不存在")
    places = row.places or []
    enriched = _enrich_places(places)
    if enriched != places:
        row.places = enriched
        db.commit()
        db.refresh(row)
    uid = user.id if user else None
    return _to_detail(row, db, uid)


@router.post("", response_model=CollectionDetail, status_code=status.HTTP_201_CREATED)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    places = _enrich_places([p.model_dump() for p in payload.places])
    city = payload.city or (places[0].get("city") if places else None)
    row = SharedCollection(
        user_id=user.id,
        title=payload.title.strip(),
        summary=(payload.summary or "").strip() or None,
        emoji=(payload.emoji or "📁").strip() or "📁",
        city=city,
        author_display=user.username,
        places=places,
        is_public=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_detail(row, db, user.id)


@router.put("/{collection_id}", response_model=CollectionDetail)
def update_collection(
    collection_id: str,
    payload: CollectionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(SharedCollection, collection_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="收藏夹不存在或无权编辑")
    places = _enrich_places([p.model_dump() for p in payload.places])
    row.title = payload.title.strip()
    row.summary = (payload.summary or "").strip() or None
    row.emoji = (payload.emoji or "📁").strip() or "📁"
    row.city = payload.city or (places[0].get("city") if places else None)
    row.places = places
    db.commit()
    db.refresh(row)
    return _to_detail(row, db, user.id)


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(SharedCollection, collection_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="收藏夹不存在或无权删除")
    db.delete(row)
    db.commit()


@router.post("/{collection_id}/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(
    collection_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.get(SharedCollection, collection_id)
    if not row or not row.is_public:
        raise HTTPException(status_code=404, detail="收藏夹不存在")
    exists = db.scalar(
        select(CollectionSubscription.id).where(
            CollectionSubscription.collection_id == collection_id,
            CollectionSubscription.user_id == user.id,
        )
    )
    if exists:
        return
    db.add(
        CollectionSubscription(
            collection_id=collection_id,
            user_id=user.id,
        )
    )
    db.commit()


@router.delete("/{collection_id}/subscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    collection_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    sub = db.scalar(
        select(CollectionSubscription).where(
            CollectionSubscription.collection_id == collection_id,
            CollectionSubscription.user_id == user.id,
        )
    )
    if not sub:
        return
    db.delete(sub)
    db.commit()
