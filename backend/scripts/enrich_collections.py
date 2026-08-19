"""一次性：用高德 POI 补全收藏夹地点坐标。"""
from app.core.database import SessionLocal
from app.api.collections import _enrich_collections_if_needed


def main() -> None:
    db = SessionLocal()
    try:
        _enrich_collections_if_needed(db)
        print("enrich_collections_ok")
    finally:
        db.close()


if __name__ == "__main__":
    main()
