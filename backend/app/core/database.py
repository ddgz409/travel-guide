"""数据库引擎与会话管理。"""
from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# SQLite 需要启用外键约束检查（默认关闭）
connect_args = {"check_same_thread": False} if settings.is_sqlite else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类。"""


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：提供数据库会话，请求结束自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_sqlite_columns() -> None:
    """为已有 SQLite 库补全 create_all 不会添加的新列。"""
    if not settings.is_sqlite:
        return
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    alters: list[str] = []

    if "trips" in tables:
        cols = {c["name"] for c in inspector.get_columns("trips")}
        if "external_refs" not in cols:
            alters.append(
                "ALTER TABLE trips ADD COLUMN external_refs JSON "
                "DEFAULT '{\"xiaohongshu\":[],\"ctrip\":[]}'"
            )
        if "hotel_fetch_status" not in cols:
            alters.append(
                "ALTER TABLE trips ADD COLUMN hotel_fetch_status VARCHAR(16) "
                "DEFAULT 'amap_only'"
            )
        if "hotel_candidates" not in cols:
            alters.append(
                "ALTER TABLE trips ADD COLUMN hotel_candidates JSON DEFAULT '[]'"
            )

    if "users" in tables:
        ucols = {c["name"] for c in inspector.get_columns("users")}
        if "llm_provider" not in ucols:
            alters.append("ALTER TABLE users ADD COLUMN llm_provider VARCHAR(32)")
        if "llm_api_key" not in ucols:
            alters.append("ALTER TABLE users ADD COLUMN llm_api_key VARCHAR(256)")
        if "llm_model" not in ucols:
            alters.append("ALTER TABLE users ADD COLUMN llm_model VARCHAR(64)")

    if alters:
        with engine.begin() as conn:
            for sql in alters:
                conn.execute(text(sql))
