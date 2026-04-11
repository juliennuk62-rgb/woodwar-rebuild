"""
Seed a small set of test users + players into the dev SQLite database
so /joueurs, /pvp matchmaking, and the leaderboards have something to
display in dev. Idempotent: safe to run repeatedly.

Creates 4 test users (test_alpha, test_beta, test_gamma, test_delta)
spread across different clans and levels, each with a small army.

Usage:
    python scripts/seed_test_data.py
"""
from __future__ import annotations

import sys
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))

from werkzeug.security import generate_password_hash

import auth  # noqa: F401 — ensures auth.load_or_create_secret runs
from db import SessionLocal, init_db
from game_data import game_data
from models import Player, PlayerBuilding, PlayerUnit, User


TEST_USERS = [
    # username,         clan_id, level, gold,   wood,  mana, units (id->count)
    ("test_alpha",      1,        4,    8000,   3500,  1200, {1: 30, 2: 8, 3: 4}),
    ("test_beta",       3,        6,    15000,  6000,  2500, {1: 50, 2: 15, 4: 6}),
    ("test_gamma",      5,        7,    22000,  9000,  4000, {1: 60, 3: 12, 5: 5}),
    ("test_delta",      7,        9,    40000,  18000, 7000, {1: 80, 4: 20, 6: 8, 7: 3}),
]
DEFAULT_PASSWORD = "test"


def _safe_print(s: str) -> None:
    try:
        print(s)
    except UnicodeEncodeError:
        print(s.encode("ascii", "replace").decode("ascii"))


def seed() -> int:
    init_db()
    created = 0
    with SessionLocal() as s:
        for username, clan_id, level, gold, wood, mana, units in TEST_USERS:
            existing = s.query(User).filter(User.username == username).one_or_none()
            if existing is not None:
                _safe_print(f"  skip   {username} (already exists)")
                continue

            user = User(
                username=username,
                password_hash=generate_password_hash(DEFAULT_PASSWORD),
                clan_id=clan_id,
            )
            s.add(user)
            s.flush()

            player = Player(
                user_id=user.id,
                level=level,
                gold=gold,
                wood=wood,
                mana=mana,
                xp=level * 500,
            )
            s.add(player)
            s.flush()

            # Give them a basic caserne so they can be displayed in PvP.
            s.add(PlayerBuilding(player_id=player.id, building_id=1, level=max(1, level // 2)))

            for unit_id, count in units.items():
                s.add(PlayerUnit(player_id=player.id, unit_id=unit_id, count=count))

            _safe_print(f"  create {username} (lvl {level}, clan {clan_id}, units {sum(units.values())})")
            created += 1
        s.commit()
    return created


def main() -> int:
    n = seed()
    _safe_print(f"\n[seed] {n} test users created. Password = {DEFAULT_PASSWORD!r}")
    if n > 0:
        _safe_print("[seed] Open http://127.0.0.1:5002 and login as test_alpha / test")
    return 0


if __name__ == "__main__":
    sys.exit(main())
