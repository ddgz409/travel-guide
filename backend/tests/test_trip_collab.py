"""协作分享：登录加入后可共同编辑。"""
from datetime import date, timedelta
import uuid

from fastapi.testclient import TestClient

from app.core.database import Base, SessionLocal, engine, ensure_sqlite_columns
from app.main import app
from app.models import Day, Item, Trip

Base.metadata.create_all(bind=engine)
ensure_sqlite_columns()


def _register(client: TestClient, prefix: str) -> tuple[str, dict]:
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    r = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "testpass123"},
    )
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return username, {"Authorization": f"Bearer {token}"}


def _seed_trip(user_id: str) -> str:
    db = SessionLocal()
    try:
        start = date.today()
        trip = Trip(
            user_id=user_id,
            title="杭州测试之旅",
            destination="杭州",
            start_date=start,
            end_date=start + timedelta(days=1),
            travelers=2,
            preferences={},
            status="ready",
        )
        db.add(trip)
        db.flush()
        day = Day(trip_id=trip.id, day_index=1, date=start, summary="西湖")
        db.add(day)
        db.flush()
        db.add(
            Item(
                day_id=day.id,
                seq=0,
                time_slot="morning",
                type="attraction",
                name="西湖",
                selected=True,
            )
        )
        db.commit()
        return trip.id
    finally:
        db.close()


def test_collab_share_join_and_edit():
    client = TestClient(app)
    owner_name, owner_h = _register(client, "owner")
    friend_name, friend_h = _register(client, "friend")

    me = client.get("/api/v1/auth/me", headers=owner_h)
    assert me.status_code == 200
    trip_id = _seed_trip(me.json()["id"])

    r = client.post(
        f"/api/v1/trips/{trip_id}/share",
        headers=owner_h,
        json={"mode": "collab"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    token = body["share_token"]
    assert token
    assert body["share_mode"] == "collab"
    assert body["can_edit"] is True
    assert any(c["username"] == owner_name and c["role"] == "owner" for c in body["collaborators"])

    anon = client.get(f"/api/v1/trips/share/{token}")
    assert anon.status_code == 200
    assert anon.json()["can_edit"] is False

    join = client.post(f"/api/v1/trips/share/{token}/join", headers=friend_h)
    assert join.status_code == 200, join.text
    joined = join.json()
    assert joined["can_edit"] is True
    names = [c["username"] for c in joined["collaborators"]]
    assert owner_name in names
    assert friend_name in names

    item_id = joined["days"][0]["items"][0]["id"]
    edited = client.put(
        f"/api/v1/trips/{trip_id}/items/{item_id}",
        headers=friend_h,
        json={"selected": False},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["days"][0]["items"][0]["selected"] is False

    detail = client.get(f"/api/v1/trips/{trip_id}", headers=friend_h)
    assert detail.status_code == 200
    names = [c["username"] for c in detail.json()["collaborators"]]
    assert owner_name in names
    assert friend_name in names

    listed = client.get("/api/v1/trips", headers=friend_h)
    assert listed.status_code == 200
    assert trip_id in [t["id"] for t in listed.json()]

    noauth = client.post(f"/api/v1/trips/share/{token}/join")
    assert noauth.status_code in (401, 403)


def test_read_share_join_cannot_edit():
    client = TestClient(app)
    _, owner_h = _register(client, "ownr")
    _, friend_h = _register(client, "frnd")
    me = client.get("/api/v1/auth/me", headers=owner_h)
    trip_id = _seed_trip(me.json()["id"])

    r = client.post(
        f"/api/v1/trips/{trip_id}/share",
        headers=owner_h,
        json={"mode": "read"},
    )
    token = r.json()["share_token"]
    joined = client.post(f"/api/v1/trips/share/{token}/join", headers=friend_h)
    assert joined.status_code == 200
    assert joined.json()["can_edit"] is False

    item_id = joined.json()["days"][0]["items"][0]["id"]
    edited = client.put(
        f"/api/v1/trips/{trip_id}/items/{item_id}",
        headers=friend_h,
        json={"selected": False},
    )
    assert edited.status_code in (403, 404)
