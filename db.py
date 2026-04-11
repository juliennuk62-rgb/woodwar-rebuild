"""
Configuration SQLAlchemy + SQLite.

Le fichier SQLite est créé à côté de ce module si absent.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = Path(__file__).parent / "woodwar.db"
DB_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    DB_URL,
    echo=False,
    future=True,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """Base class for all ORM models."""


def init_db() -> None:
    """Create all tables if they don't exist."""
    # Import models so SQLAlchemy knows about them before create_all().
    import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_schema()


# ---------------------------------------------------------------------------
# Lightweight schema migrations
# ---------------------------------------------------------------------------
#
# SQLAlchemy's create_all() only creates missing TABLES, not missing
# COLUMNS. As features get added we accumulate new fields on existing
# tables; rather than ship a heavyweight migration framework, we run a
# tiny "ensure" pass on startup that adds any missing column with a
# safe default. This is sufficient for an SQLite-only single-file dev
# environment and lets the app evolve without losing player data.

# (table_name, column_name, sql_to_add_column)
_SCHEMA_PATCHES: list[tuple[str, str, str]] = [
    ("kobold_camps", "archetype",       "ALTER TABLE kobold_camps ADD COLUMN archetype VARCHAR(16) NOT NULL DEFAULT 'kobold'"),
    ("kobold_camps", "ai_pattern",      "ALTER TABLE kobold_camps ADD COLUMN ai_pattern VARCHAR(16) NOT NULL DEFAULT 'passive'"),
    ("kobold_camps", "difficulty_tier", "ALTER TABLE kobold_camps ADD COLUMN difficulty_tier INTEGER NOT NULL DEFAULT 2"),
    # Phase 12 (campaign mode — PlayerQuest is created by create_all if missing)
]


def _ensure_schema() -> None:
    """Run idempotent schema patches for missing columns."""
    from sqlalchemy import text

    with engine.connect() as conn:
        for table, column, ddl in _SCHEMA_PATCHES:
            try:
                cols = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            except Exception:
                continue
            existing = {c[1] for c in cols}
            if column in existing:
                continue
            try:
                conn.exec_driver_sql(ddl)
                conn.commit()
            except Exception as e:
                # Don't crash on patch failure; the next startup will retry.
                print(f"[db] schema patch failed for {table}.{column}: {e}")


def get_session():
    """Yield a scoped session. Use in a 'with' block or context manager."""
    return SessionLocal()
