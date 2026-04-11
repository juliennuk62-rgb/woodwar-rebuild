"""
Tests for PvP matchmaking + cooldowns + anti-farm (Feature 2).
Uses an in-memory SQLite to avoid touching the dev database.
"""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))


class PvPMatchmakingTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        import db
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        db.engine = create_engine("sqlite:///:memory:", future=True)
        db.SessionLocal = sessionmaker(bind=db.engine, autoflush=False, autocommit=False)
        import models  # noqa: F401
        db.Base.metadata.create_all(bind=db.engine)
        cls.SessionLocal = db.SessionLocal

    def _make_player(self, s, username, level=5, gold=1000):
        from models import Player, User
        u = User(username=username, password_hash="x")
        s.add(u)
        s.flush()
        p = Player(user_id=u.id, level=level, gold=gold)
        s.add(p)
        s.flush()
        return u, p

    def test_cannot_attack_self(self):
        import game_logic
        with self.SessionLocal() as s:
            _, p = self._make_player(s, "self_attack")
            ok, reason = game_logic.can_attack_target(s, p, p)
            self.assertFalse(ok)
            self.assertIn("propre royaume", reason)

    def test_can_attack_returns_true_for_fair_target(self):
        import game_logic
        with self.SessionLocal() as s:
            _, attacker = self._make_player(s, "att1", level=5)
            _, defender = self._make_player(s, "def1", level=5)
            ok, reason = game_logic.can_attack_target(s, attacker, defender)
            self.assertTrue(ok)
            self.assertIsNone(reason)

    def test_cooldown_blocks_repeat_attack(self):
        import game_logic
        with self.SessionLocal() as s:
            _, attacker = self._make_player(s, "att2", level=5)
            _, defender = self._make_player(s, "def2", level=5)

            # Register a cooldown manually.
            game_logic.register_pvp_cooldown(s, attacker.id, defender.id)
            s.flush()

            ok, reason = game_logic.can_attack_target(s, attacker, defender)
            self.assertFalse(ok)
            self.assertIn("récemment", reason)

    def test_rate_limit_blocks_after_max_attacks(self):
        import game_logic
        from models import PvPCooldown
        with self.SessionLocal() as s:
            _, attacker = self._make_player(s, "att3", level=5)
            # Pre-fill the rate limit with N fake cooldowns dated NOW.
            for i in range(game_logic.PVP_ATTACKS_PER_HOUR):
                _, victim = self._make_player(s, f"victim_{i}", level=5)
                game_logic.register_pvp_cooldown(s, attacker.id, victim.id)
            s.flush()

            _, fresh_target = self._make_player(s, "fresh_target", level=5)
            ok, reason = game_logic.can_attack_target(s, attacker, fresh_target)
            self.assertFalse(ok)
            self.assertIn("anti-farm", reason)

    def test_matchmaking_returns_only_close_levels(self):
        import game_logic
        with self.SessionLocal() as s:
            _, me = self._make_player(s, "me", level=10)
            self._make_player(s, "close_lower", level=8)
            self._make_player(s, "close_upper", level=12)
            self._make_player(s, "too_far_low", level=1)   # diff = -9
            self._make_player(s, "too_far_high", level=20) # diff = +10
            self._make_player(s, "exact", level=10)
            s.flush()

            results = game_logic.find_matchmaking_opponents(s, me, limit=10)
            usernames = [r["username"] for r in results]
            self.assertIn("close_lower", usernames)
            self.assertIn("close_upper", usernames)
            self.assertIn("exact", usernames)
            self.assertNotIn("too_far_low", usernames)
            self.assertNotIn("too_far_high", usernames)

    def test_matchmaking_excludes_self(self):
        import game_logic
        with self.SessionLocal() as s:
            _, me = self._make_player(s, "selfme", level=5)
            results = game_logic.find_matchmaking_opponents(s, me)
            self.assertNotIn("selfme", [r["username"] for r in results])

    def test_matchmaking_excludes_targets_on_cooldown(self):
        import game_logic
        with self.SessionLocal() as s:
            _, me = self._make_player(s, "atk", level=5)
            _, on_cd = self._make_player(s, "victim_cd", level=5)
            _, fresh = self._make_player(s, "fresh", level=5)
            game_logic.register_pvp_cooldown(s, me.id, on_cd.id)
            s.flush()

            results = game_logic.find_matchmaking_opponents(s, me)
            usernames = [r["username"] for r in results]
            self.assertIn("fresh", usernames)
            self.assertNotIn("victim_cd", usernames)

    def test_cooldown_view_reflects_state(self):
        import game_logic
        with self.SessionLocal() as s:
            _, me = self._make_player(s, "viewme", level=5)
            v = game_logic.get_pvp_cooldown_view(s, me)
            self.assertEqual(v["attacks_used"], 0)
            self.assertEqual(v["attacks_max"], game_logic.PVP_ATTACKS_PER_HOUR)
            self.assertEqual(v["attacks_remaining"], game_logic.PVP_ATTACKS_PER_HOUR)
            self.assertEqual(v["target_cooldown_minutes"], 30)
            self.assertEqual(v["matchmaking_level_range"], game_logic.PVP_MATCHMAKING_LEVEL_RANGE)


if __name__ == "__main__":
    unittest.main()
