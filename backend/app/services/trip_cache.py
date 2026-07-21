"""同词条攻略生成缓存：命中后克隆一份新 Trip，避免重复跑 LLM。

缓存键按「玩法」归一化（目的地 + 天数 + 偏好 + 必去），不绑定具体日期。
落盘在 SQLite，不占进程内存；带 TTL 与条数上限。
"""
from __future__ import annotations

import hashlib
import json
import logging
from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Trip, TripGenerationCache

logger = logging.getLogger(__name__)

CACHE_TTL_DAYS = 7
CACHE_MAX_ROWS = 500


def build_cache_key(
    *,
    destination: str,
    days_count: int,
    preferences: dict[str, Any],
    must_include: list[dict] | None,
) -> str | None:
    """无自定义 LLM Key 时才缓存；否则返回 None 表示跳过。"""
    prefs = dict(preferences or {})
    if prefs.get("_llm_override"):
        return None

    interests = sorted(
        str(x).strip() for x in (prefs.get("interests") or []) if str(x).strip()
    )
    must_names = sorted(
        {
            (m.get("poi_id") or m.get("name") or "").strip()
            for m in (must_include or [])
            if (m.get("poi_id") or m.get("name"))
        }
    )
    payload = {
        "destination": (destination or "").strip().lower(),
        "days_count": int(days_count),
        "budget_level": str(prefs.get("budget_level") or "").strip(),
        "transport": str(prefs.get("transport") or "").strip(),
        "interests": interests,
        "must_include": must_names,
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _shift_day_plans(
    day_plans: list[dict[str, Any]], start: date
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, d in enumerate(day_plans or []):
        nd = deepcopy(d)
        nd["day_index"] = i + 1
        nd["date"] = (start + timedelta(days=i)).isoformat()
        items = []
        for it in nd.get("items") or []:
            nit = dict(it)
            nit.pop("id", None)
            items.append(nit)
        nd["items"] = items
        out.append(nd)
    return out


def try_clone_from_cache(
    db: Session,
    *,
    cache_key: str,
    user_id: str,
    destination: str,
    start_date: date,
    end_date: date,
    travelers: int,
    preferences: dict[str, Any],
    title: str,
) -> Trip | None:
    """命中缓存则克隆新行程并立即 ready；未命中返回 None。"""
    row = db.get(TripGenerationCache, cache_key)
    if row is None:
        return None
    age = datetime.utcnow() - (row.updated_at or row.created_at)
    if age > timedelta(days=CACHE_TTL_DAYS):
        db.delete(row)
        db.commit()
        return None

    blob = dict(row.payload or {})
    route_options = deepcopy(blob.get("route_options") or [])
    if not route_options:
        return None

    days_count = (end_date - start_date).days + 1
    selected_id = blob.get("selected_route_id") or route_options[0].get("id")
    selected = next(
        (r for r in route_options if r.get("id") == selected_id), route_options[0]
    )
    day_plans = _shift_day_plans(selected.get("days") or [], start_date)
    if len(day_plans) != days_count:
        return None

    for r in route_options:
        if r.get("days"):
            r["days"] = _shift_day_plans(r["days"], start_date)

    prefs = dict(preferences or {})
    prefs.pop("_llm_override", None)
    prefs["route_options"] = route_options
    prefs["selected_route_id"] = selected.get("id")
    prefs["from_cache"] = True

    trip = Trip(
        user_id=user_id,
        title=(selected.get("title") or title or f"{destination}之旅")[:128],
        destination=destination,
        start_date=start_date,
        end_date=end_date,
        travelers=travelers,
        preferences=prefs,
        external_refs=deepcopy(
            blob.get("external_refs") or {"xiaohongshu": [], "ctrip": []}
        ),
        hotel_fetch_status=blob.get("hotel_fetch_status") or "amap_only",
        hotel_candidates=deepcopy(blob.get("hotel_candidates") or []),
        status="ready",
        error_msg=None,
    )
    per_person = float(blob.get("budget_per_person") or 0)
    if not per_person:
        per_person = float(
            sum(
                it.get("cost", 0) or 0
                for d in day_plans
                for it in d.get("items") or []
            )
        )
    trip.budget_total = per_person * travelers
    db.add(trip)
    db.flush()

    from app.services.generator import get_generator

    get_generator()._persist(trip, day_plans, db)
    trip.status = "ready"
    trip.error_msg = None

    row.hit_count = int(row.hit_count or 0) + 1
    row.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(trip)
    logger.info("trip cache HIT key=%s… trip=%s", cache_key[:12], trip.id)
    return trip


def save_trip_to_cache(db: Session, trip: Trip, cache_key: str | None) -> None:
    """生成成功后写入/刷新缓存。"""
    if not cache_key or trip.status != "ready":
        return
    prefs = dict(trip.preferences or {})
    route_options = prefs.get("route_options") or []
    if not route_options:
        return

    days_count = (trip.end_date - trip.start_date).days + 1
    per_person = 0.0
    if trip.travelers:
        per_person = float(trip.budget_total or 0) / max(1, trip.travelers)

    payload = {
        "route_options": deepcopy(route_options),
        "selected_route_id": prefs.get("selected_route_id"),
        "external_refs": deepcopy(trip.external_refs or {}),
        "hotel_candidates": deepcopy(trip.hotel_candidates or []),
        "hotel_fetch_status": trip.hotel_fetch_status or "amap_only",
        "budget_per_person": per_person,
        "destination": trip.destination,
        "days_count": days_count,
    }

    row = db.get(TripGenerationCache, cache_key)
    now = datetime.utcnow()
    if row is None:
        row = TripGenerationCache(
            cache_key=cache_key,
            destination=trip.destination,
            days_count=days_count,
            payload=payload,
            hit_count=0,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    else:
        row.payload = payload
        row.destination = trip.destination
        row.days_count = days_count
        row.updated_at = now
    db.commit()
    _prune_cache(db)
    logger.info("trip cache SAVE key=%s… dest=%s", cache_key[:12], trip.destination)


def _prune_cache(db: Session) -> None:
    """删过期 + 超量最旧条目。"""
    cutoff = datetime.utcnow() - timedelta(days=CACHE_TTL_DAYS)
    stale = db.scalars(
        select(TripGenerationCache).where(TripGenerationCache.updated_at < cutoff)
    ).all()
    for row in stale:
        db.delete(row)

    rows = db.scalars(
        select(TripGenerationCache).order_by(TripGenerationCache.updated_at.desc())
    ).all()
    for row in rows[CACHE_MAX_ROWS:]:
        db.delete(row)
    db.commit()
