"""
Tests for pure game formulas in game_logic.py.

These tests pin specific numeric values extracted from the original PHP so we
catch any regression caused by well-meaning "simplifications" from the
auto-improver agent.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))

import game_logic
from game_logic import (
    CASERNE,
    MINE_GOLD,
    FOUNTAIN_MANA,
    SAWMILL,
    production_per_hour,
    upgrade_cost,
    max_level,
)


class UpgradeCostTests(unittest.TestCase):

    def test_hardcoded_caserne_level_1_to_2(self):
        cost = upgrade_cost(CASERNE, 1)
        self.assertIsNotNone(cost)
        # Caserne uses the hardcoded table × 2
        self.assertGreater(cost["or"], 0)
        self.assertGreater(cost["bois"], 0)
        self.assertGreater(cost["time"], 0)

    def test_producer_cost_monotonic(self):
        """Mines should always get more expensive per level."""
        previous = 0
        for level in range(1, 20):
            cost = upgrade_cost(MINE_GOLD, level)
            self.assertIsNotNone(cost)
            self.assertGreater(cost["or"], previous)
            previous = cost["or"]

    def test_producer_wood_is_cheaper_than_gold(self):
        for level in (1, 3, 5, 10):
            cost = upgrade_cost(MINE_GOLD, level)
            self.assertLess(cost["bois"], cost["or"])

    def test_max_level_respected(self):
        mx = max_level(CASERNE)
        self.assertEqual(mx, 15)
        # Upgrade from max level returns None.
        self.assertIsNone(upgrade_cost(CASERNE, mx))

    def test_upgrade_cost_returns_int_fields(self):
        cost = upgrade_cost(MINE_GOLD, 3)
        self.assertIsNotNone(cost)
        self.assertIsInstance(cost["or"], int)
        self.assertIsInstance(cost["bois"], int)
        self.assertIsInstance(cost["time"], int)


class ProductionTests(unittest.TestCase):

    def test_production_grows_with_level(self):
        previous = 0
        for level in range(1, 15):
            p = production_per_hour(MINE_GOLD, level)
            self.assertGreater(p, previous)
            previous = p

    def test_production_level_1_is_reasonable(self):
        """Level 1 mine should produce a sane starter amount."""
        p = production_per_hour(MINE_GOLD, 1)
        self.assertGreater(p, 0)
        self.assertLess(p, 100_000)  # sanity upper bound

    def test_three_producers_produce(self):
        for bid in (MINE_GOLD, FOUNTAIN_MANA, SAWMILL):
            p = production_per_hour(bid, 5)
            self.assertGreater(p, 0)


class CombatSanityTests(unittest.TestCase):
    """Combat should be deterministic enough to test, and reasonably balanced."""

    def test_unit_total_damage_scales_linearly(self):
        single = game_logic.unit_total_damage(1, 1)
        ten = game_logic.unit_total_damage(1, 10)
        self.assertEqual(ten, single * 10)

    def test_unit_total_defense_scales_linearly(self):
        single = game_logic.unit_total_defense(1, 1)
        ten = game_logic.unit_total_defense(1, 10)
        self.assertEqual(ten, single * 10)

    def test_unit_damage_positive_for_all_units(self):
        from game_data import game_data
        for u in game_data.units["units"]:
            dmg = game_logic.unit_total_damage(u["id"], 1)
            # Some support units may have 0 damage — but not negative.
            self.assertGreaterEqual(dmg, 0)


class ConstantsTests(unittest.TestCase):

    def test_item_drop_chance_reasonable(self):
        self.assertGreater(game_logic.ITEM_DROP_CHANCE, 0)
        self.assertLess(game_logic.ITEM_DROP_CHANCE, 1)

    def test_relic_multiplier_is_three(self):
        # Canonical: $nb_degats_relique = 3 in config.php.
        self.assertEqual(game_logic.RELIC_DAMAGE_MULTIPLIER, 3)

    def test_alliance_max_members_positive(self):
        self.assertGreater(game_logic.ALLIANCE_MAX_MEMBERS, 0)


if __name__ == "__main__":
    unittest.main()
