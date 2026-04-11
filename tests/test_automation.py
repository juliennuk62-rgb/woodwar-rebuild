"""
Tests for the automation features (Feature 4): auto-farm + build queue.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))


class AutomationTests(unittest.TestCase):

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

    def _make_player(self, s, username="auto_user", level=5, gold=10000, wood=5000):
        from models import Player, User
        u = User(username=username, password_hash="x")
        s.add(u)
        s.flush()
        p = Player(user_id=u.id, level=level, gold=gold, wood=wood, mana=2000)
        s.add(p)
        s.flush()
        return p

    # ----- Auto-farm ---------------------------------------------------

    def test_auto_farm_without_units_raises(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            with self.assertRaises(ValueError) as cm:
                game_logic.auto_farm_run(s, p)
            self.assertIn("Aucune unité", str(cm.exception))

    def test_auto_farm_constants_in_range(self):
        import game_logic
        self.assertGreater(game_logic.AUTO_FARM_MAX_CAMPS, 0)
        self.assertLessEqual(game_logic.AUTO_FARM_MAX_CAMPS, 50)
        self.assertGreater(game_logic.AUTO_FARM_MAX_LOSS_RATIO, 0)
        self.assertLess(game_logic.AUTO_FARM_MAX_LOSS_RATIO, 1)

    # ----- Build queue -------------------------------------------------

    def test_enqueue_build_appends_to_queue(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            game_logic.enqueue_build(s, p, 1)  # caserne
            game_logic.enqueue_build(s, p, 2)  # mine_gold
            game_logic.enqueue_build(s, p, 3)  # fountain_mana
            queue = game_logic.list_build_queue(s, p)
            self.assertEqual(len(queue), 3)
            self.assertEqual(queue[0]["building_id"], 1)
            self.assertEqual(queue[1]["building_id"], 2)
            self.assertEqual(queue[2]["building_id"], 3)
            # Positions are strictly increasing.
            self.assertLess(queue[0]["position"], queue[1]["position"])
            self.assertLess(queue[1]["position"], queue[2]["position"])

    def test_enqueue_invalid_building_raises(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            with self.assertRaises(ValueError):
                game_logic.enqueue_build(s, p, 999)  # not a buildable id

    def test_dequeue_build_removes_item(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s)
            item = game_logic.enqueue_build(s, p, 2)
            game_logic.dequeue_build(s, p, item.id)
            queue = game_logic.list_build_queue(s, p)
            self.assertEqual(len(queue), 0)

    def test_dequeue_other_player_item_raises(self):
        import game_logic
        with self.SessionLocal() as s:
            p1 = self._make_player(s, "owner")
            p2 = self._make_player(s, "intruder")
            item = game_logic.enqueue_build(s, p1, 2)
            with self.assertRaises(ValueError):
                game_logic.dequeue_build(s, p2, item.id)

    def test_process_queue_starts_next_build(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s, gold=99999, wood=99999)
            game_logic.enqueue_build(s, p, 2)  # mine
            result = game_logic.process_build_queue(s, p)
            self.assertIsNotNone(result)
            self.assertEqual(result["building_id"], 2)
            self.assertEqual(result["target_level"], 1)
            # Queue should be empty now.
            self.assertEqual(len(game_logic.list_build_queue(s, p)), 0)
            # Player should have one building upgrading.
            self.assertEqual(len(p.buildings), 1)
            self.assertIsNotNone(p.buildings[0].upgrading_until)

    def test_process_queue_skips_if_busy(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s, gold=99999, wood=99999)
            # First build starts.
            game_logic.enqueue_build(s, p, 2)
            game_logic.process_build_queue(s, p)
            # Add a second item — it should NOT start because first is busy.
            game_logic.enqueue_build(s, p, 3)
            result = game_logic.process_build_queue(s, p)
            self.assertIsNone(result)
            self.assertEqual(len(game_logic.list_build_queue(s, p)), 1)

    def test_process_queue_skips_if_unaffordable(self):
        import game_logic
        with self.SessionLocal() as s:
            p = self._make_player(s, gold=10, wood=10)  # broke
            game_logic.enqueue_build(s, p, 1)  # caserne
            result = game_logic.process_build_queue(s, p)
            self.assertIsNone(result)
            # Queue still has the item.
            self.assertEqual(len(game_logic.list_build_queue(s, p)), 1)


if __name__ == "__main__":
    unittest.main()
