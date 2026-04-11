"""
Smoke tests for the static game data files.

These tests are the first gate: if any canonical JSON file is broken, nothing
else matters. They must always pass before any PR is merged.
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

# Make rebuild/ importable no matter where pytest is launched from.
_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))

from game_data import DATA_DIR, GENERATED_DIR, GameData


CANONICAL_FILES = [
    "units", "buildings", "clans", "dracos", "relics", "rules",
    "technologies", "items", "achievements", "weapons", "packs",
]


class CanonicalDataTests(unittest.TestCase):
    """The canonical data files must always load and parse."""

    def test_all_canonical_files_exist(self):
        for name in CANONICAL_FILES:
            path = DATA_DIR / f"{name}.json"
            self.assertTrue(path.exists(), f"Missing canonical file: {path}")

    def test_all_canonical_files_are_valid_json(self):
        for name in CANONICAL_FILES:
            path = DATA_DIR / f"{name}.json"
            with path.open(encoding="utf-8") as f:
                try:
                    json.load(f)
                except json.JSONDecodeError as e:
                    self.fail(f"{name}.json is not valid JSON: {e}")

    def test_game_data_singleton_loads(self):
        gd = GameData()
        counts = gd.counts()
        self.assertGreater(counts["units"], 0)
        self.assertGreater(counts["buildings"], 0)
        self.assertGreater(counts["clans"], 0)
        self.assertGreater(counts["items"], 0)

    def test_units_have_required_fields(self):
        gd = GameData()
        for u in gd.units["units"]:
            self.assertIn("id", u)
            self.assertIn("name_fr", u)
            self.assertIsInstance(u["id"], int)

    def test_buildings_have_required_fields(self):
        gd = GameData()
        for b in gd.buildings["buildings"]:
            self.assertIn("id", b)
            self.assertIn("name_fr", b)

    def test_clans_have_required_fields(self):
        gd = GameData()
        for c in gd.clans["clans"]:
            self.assertIn("id", c)
            self.assertIn("name", c)

    def test_no_duplicate_unit_ids(self):
        gd = GameData()
        ids = [u["id"] for u in gd.units["units"]]
        self.assertEqual(len(ids), len(set(ids)), "Duplicate unit ids")

    def test_no_duplicate_building_ids(self):
        gd = GameData()
        ids = [b["id"] for b in gd.buildings["buildings"]]
        self.assertEqual(len(ids), len(set(ids)), "Duplicate building ids")

    def test_no_duplicate_item_ids(self):
        gd = GameData()
        ids = [i["id"] for i in gd.items["items"]]
        self.assertEqual(len(ids), len(set(ids)), "Duplicate item ids")


class GeneratedDataTests(unittest.TestCase):
    """Generated files may be empty but must always be valid when present."""

    GENERATED_FILES = {
        "quests.json": "quests",
        "events.json": "events",
        "lore.json": "entries",
        "camps.json": "camps",
        "items.json": "items",
        "runs.json": "runs",
    }

    def test_generated_dir_exists(self):
        self.assertTrue(
            GENERATED_DIR.exists(),
            f"Generated dir missing: {GENERATED_DIR}",
        )

    def test_all_generated_files_are_valid_json(self):
        for fname in self.GENERATED_FILES:
            path = GENERATED_DIR / fname
            if not path.exists():
                continue
            with path.open(encoding="utf-8") as f:
                try:
                    json.load(f)
                except json.JSONDecodeError as e:
                    self.fail(f"{fname} is not valid JSON: {e}")

    def test_generated_files_have_meta_and_list(self):
        for fname, list_key in self.GENERATED_FILES.items():
            path = GENERATED_DIR / fname
            if not path.exists():
                continue
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
            self.assertIn("_meta", data, f"{fname} missing _meta")
            self.assertIn(list_key, data, f"{fname} missing {list_key}")
            self.assertIsInstance(data[list_key], list)

    def test_generated_quests_follow_schema(self):
        path = GENERATED_DIR / "quests.json"
        if not path.exists():
            return
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        valid_objective_types = {
            "train_units", "win_campaigns", "win_pvp",
            "earn_gold", "earn_wood", "earn_mana",
            "build_level", "own_relic",
        }
        valid_difficulties = {"easy", "medium", "hard"}
        for q in data.get("quests", []):
            self.assertIn("id", q)
            self.assertIn("name_fr", q)
            self.assertIn("objective_type", q)
            self.assertIn(
                q["objective_type"], valid_objective_types,
                f"Invalid objective_type in {q.get('id')}: {q['objective_type']}",
            )
            self.assertIn("difficulty", q)
            self.assertIn(
                q["difficulty"], valid_difficulties,
                f"Invalid difficulty in {q.get('id')}",
            )
            self.assertIsInstance(q.get("reward_gold", 0), int)
            self.assertIsInstance(q.get("reward_xp", 0), int)

    def test_generated_quest_rewards_are_in_range(self):
        path = GENERATED_DIR / "quests.json"
        if not path.exists():
            return
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        for q in data.get("quests", []):
            diff = q.get("difficulty")
            gold = q.get("reward_gold", 0)
            xp = q.get("reward_xp", 0)
            # Allow a ~2x tolerance over the declared tiers.
            if diff == "easy":
                self.assertLessEqual(gold, 1000, f"{q['id']} easy reward too big")
                self.assertLessEqual(xp, 1000, f"{q['id']} easy xp too big")
            elif diff == "medium":
                self.assertLessEqual(gold, 4000, f"{q['id']} medium reward too big")
                self.assertLessEqual(xp, 4000, f"{q['id']} medium xp too big")
            elif diff == "hard":
                self.assertLessEqual(gold, 20000, f"{q['id']} hard reward too big")
                self.assertLessEqual(xp, 20000, f"{q['id']} hard xp too big")

    def test_generated_camps_valid_biomes(self):
        path = GENERATED_DIR / "camps.json"
        if not path.exists():
            return
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        valid_biomes = {"marecage", "foret", "brouillard", "montagnes", "fortifie"}
        for c in data.get("camps", []):
            biome = c.get("biome")
            if biome is not None:
                self.assertIn(
                    biome, valid_biomes,
                    f"Invalid biome in camp {c.get('id')}: {biome}",
                )

    def test_generated_items_no_conflict_with_legacy(self):
        """Generated items must have id >= 100 to avoid collision with the
        45 legacy items."""
        path = GENERATED_DIR / "items.json"
        if not path.exists():
            return
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        for i in data.get("items", []):
            item_id = i.get("id")
            if item_id is not None:
                self.assertGreaterEqual(
                    item_id, 100,
                    f"Generated item {item_id} collides with legacy range",
                )


if __name__ == "__main__":
    unittest.main()
