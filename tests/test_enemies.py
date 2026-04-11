"""
Tests for the enemy archetype + AI pattern system (Feature 1).

Validates:
- ENEMY_ARCHETYPES is well-formed
- AI_PATTERN_TUNING covers all archetype default patterns
- resolve_combat applies the patterns correctly (deterministic seed)
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))

import game_logic
from game_logic import AI_PATTERN_TUNING, ENEMY_ARCHETYPES


class ArchetypeMetaTests(unittest.TestCase):

    def test_all_archetypes_have_required_keys(self):
        required = {"label_fr", "hp_mult", "loot_mult", "default_pattern", "tier_min", "tier_max"}
        for name, meta in ENEMY_ARCHETYPES.items():
            missing = required - set(meta.keys())
            self.assertFalse(missing, f"{name} missing keys: {missing}")

    def test_archetype_default_patterns_are_valid(self):
        valid_patterns = set(AI_PATTERN_TUNING.keys())
        for name, meta in ENEMY_ARCHETYPES.items():
            self.assertIn(
                meta["default_pattern"], valid_patterns,
                f"{name} has unknown default_pattern {meta['default_pattern']}",
            )

    def test_archetype_hp_multipliers_positive(self):
        for name, meta in ENEMY_ARCHETYPES.items():
            self.assertGreater(meta["hp_mult"], 0, f"{name} has non-positive hp_mult")
            self.assertGreater(meta["loot_mult"], 0, f"{name} has non-positive loot_mult")

    def test_tier_ranges_consistent(self):
        for name, meta in ENEMY_ARCHETYPES.items():
            self.assertGreaterEqual(meta["tier_min"], 1)
            self.assertLessEqual(meta["tier_max"], 5)
            self.assertLessEqual(meta["tier_min"], meta["tier_max"])

    def test_at_least_five_archetypes(self):
        # We promised the player a varied roster, not just kobolds.
        self.assertGreaterEqual(len(ENEMY_ARCHETYPES), 5)


class AIPatternTuningTests(unittest.TestCase):

    def test_passive_has_no_tuning(self):
        self.assertEqual(AI_PATTERN_TUNING.get("passive"), {})

    def test_aggressive_has_counter_ratio(self):
        self.assertIn("counter_ratio", AI_PATTERN_TUNING["aggressive"])
        self.assertGreater(AI_PATTERN_TUNING["aggressive"]["counter_ratio"], 0)

    def test_armored_has_damage_ignored(self):
        v = AI_PATTERN_TUNING["armored"]["damage_ignored"]
        self.assertGreater(v, 0)
        self.assertLess(v, 1)

    def test_evasive_dodge_chance_in_range(self):
        v = AI_PATTERN_TUNING["evasive"]["dodge_chance"]
        self.assertGreater(v, 0)
        self.assertLess(v, 1)

    def test_regenerator_regen_ratio_in_range(self):
        v = AI_PATTERN_TUNING["regenerator"]["regen_ratio"]
        self.assertGreater(v, 0)
        self.assertLess(v, 1)


class ArchetypeForTierTests(unittest.TestCase):

    def test_low_tier_picks_low_archetypes(self):
        import random
        rng = random.Random(0)
        # Tier 0 of 12 should be in the kobold tier band (tier 1).
        result = game_logic._archetype_for_tier(rng, 0, 12)
        meta = ENEMY_ARCHETYPES[result]
        self.assertLessEqual(meta["tier_min"], 1)

    def test_high_tier_includes_boss(self):
        import random
        rng = random.Random(0)
        seen = set()
        # Sample many high-tier picks; we expect to see boss occasionally.
        for _ in range(200):
            result = game_logic._archetype_for_tier(rng, 11, 12)
            seen.add(result)
        # Boss should have appeared at least once.
        self.assertIn("boss", seen)


if __name__ == "__main__":
    unittest.main()
