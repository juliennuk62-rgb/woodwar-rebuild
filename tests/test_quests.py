"""
Tests for the campaign mode (Feature 3) — PlayerQuest accept/progress/claim.
Uses an in-memory SQLite database so it doesn't pollute the dev DB.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))


class QuestSystemTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        # Force a fresh in-memory DB for these tests so we don't touch the
        # dev sqlite file. Done before importing any model.
        import db
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        db.engine = create_engine("sqlite:///:memory:", future=True)
        db.SessionLocal = sessionmaker(bind=db.engine, autoflush=False, autocommit=False)
        import models  # noqa: F401
        db.Base.metadata.create_all(bind=db.engine)
        cls.SessionLocal = db.SessionLocal

        # Inject a synthetic quest into game_data so accept_quest can find it.
        import game_data
        cls._test_quest = {
            "id": "test_quest_train_5_units",
            "name_fr": "Test : entraîner 5 unités",
            "description_fr": "Test quest for unit training",
            "objective_type": "train_units",
            "objective_count": 5,
            "reward_gold": 200,
            "reward_xp": 150,
            "difficulty": "easy",
            "lore_hook": "test",
        }
        if not any(q.get("id") == cls._test_quest["id"] for q in game_data.game_data.generated_quests):
            game_data.game_data.generated_quests.append(cls._test_quest)

    def _make_player(self, s):
        from models import Player, User
        u = User(username="quest_test_user", password_hash="x")
        s.add(u)
        s.flush()
        p = Player(user_id=u.id, gold=0, wood=0, mana=0, total_units_trained=0)
        s.add(p)
        s.flush()
        return p

    def test_accept_quest_creates_row_with_snapshot(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            p.total_units_trained = 10  # already trained 10 before accepting
            s.flush()
            pq = game_logic.accept_quest(s, p, "test_quest_train_5_units")
            self.assertEqual(pq.snapshot_value, 10)
            self.assertEqual(pq.objective_count, 5)
            self.assertEqual(pq.status, "active")

    def test_accept_unknown_quest_raises(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            with self.assertRaises(ValueError):
                game_logic.accept_quest(s, p, "nonexistent_quest_id")

    def test_accept_same_quest_twice_raises(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            game_logic.accept_quest(s, p, "test_quest_train_5_units")
            with self.assertRaises(ValueError):
                game_logic.accept_quest(s, p, "test_quest_train_5_units")

    def test_progress_promotes_to_claimable(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            game_logic.accept_quest(s, p, "test_quest_train_5_units")
            # Train 5 more units (snapshot was 0).
            p.total_units_trained = 5
            s.flush()
            quests = game_logic.list_player_quests(s, p)
            self.assertEqual(len(quests), 1)
            self.assertEqual(quests[0]["status"], "claimable")
            self.assertEqual(quests[0]["progress"], 5)

    def test_claim_grants_reward_only_when_objective_met(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            pq = game_logic.accept_quest(s, p, "test_quest_train_5_units")
            # Try to claim before objective met → ValueError
            with self.assertRaises(ValueError):
                game_logic.claim_quest_reward(s, p, pq.id)

            # Train enough units, then claim.
            p.total_units_trained = 8
            s.flush()
            # Promote to claimable via list_player_quests (or directly).
            game_logic.list_player_quests(s, p)
            result = game_logic.claim_quest_reward(s, p, pq.id)
            self.assertEqual(result["reward_gold"], 200)
            self.assertEqual(result["reward_xp"], 150)
            self.assertEqual(p.gold, 200)
            self.assertEqual(p.xp, 150)

            # Claiming again should fail.
            with self.assertRaises(ValueError):
                game_logic.claim_quest_reward(s, p, pq.id)

    def test_abandon_quest(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            pq = game_logic.accept_quest(s, p, "test_quest_train_5_units")
            game_logic.abandon_quest(s, p, pq.id)
            self.assertEqual(pq.status, "abandoned")

    def test_quest_objective_field_mapping_complete(self):
        """All objective_types referenced in our schema have a counter mapping."""
        import game_logic
        valid = {"train_units", "win_campaigns", "win_pvp", "earn_gold",
                 "earn_wood", "earn_mana", "build_level", "own_relic"}
        for ot in valid:
            self.assertIn(ot, game_logic.QUEST_OBJECTIVE_FIELDS)


if __name__ == "__main__":
    unittest.main()
