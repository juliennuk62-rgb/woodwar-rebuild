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


def get_session():
    """Yield a scoped session. Use in a 'with' block or context manager."""
    return SessionLocal()
