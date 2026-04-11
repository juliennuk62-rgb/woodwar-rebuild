"""
Tests for the headless playtest harness itself.

`scripts/playtest.py` is the trigger agent's feedback loop : every night
run reads its report to decide what to fix. If the harness is silently
broken — e.g. a feasibility check always returns an empty list because
we renamed a field — the agent would keep seeing green and miss real
regressions. These tests lock the contract of each scenario so that a
broken harness fails CI before it ever lies to the agent.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))

import scripts.playtest as pt


class PlaytestVarietyTests(unittest.TestCase):
    """`check_content_variety` must count every generated file we track."""

    def test_variety_counts_include_camps_and_items(self):
        report = pt.check_content_variety()
        counts = report["counts"]
        for kind in ("quests", "events", "lore", "camps", "items"):
            self.assertIn(
                kind, counts,
                f"variety.counts is missing key {kind!r}",
            )

    def test_variety_flags_cross_content_id_clash(self):
        def fake_loader(name, list_key):
            if name == "quests":
                return [{"id": "x_dup", "name_fr": "Q"}]
            if name == "camps":
                return [{"id": "x_dup", "name_fr": "C", "pv_max": 1000}]
            return []
        with patch.object(pt, "_load_generated", side_effect=fake_loader):
            report = pt.check_content_variety()
        self.assertTrue(
            any("cross-content id clash" in i for i in report["issues"]),
            f"expected cross-content clash, got {report['issues']}",
        )


class PlaytestCampsFeasibilityTests(unittest.TestCase):
    """`check_camps_feasibility` must catch out-of-range stats."""

    def test_current_camps_are_clean(self):
        report = pt.check_camps_feasibility()
        self.assertEqual(
            report["issues"], [],
            f"live camps should be clean but got {report['issues']}",
        )
        self.assertGreaterEqual(report["camp_count"], 0)

    def test_rejects_bad_pv_max(self):
        bad = [{"id": "bad", "name_fr": "Bad", "pv_max": 50}]
        with patch.object(pt, "_load_generated", return_value=bad):
            report = pt.check_camps_feasibility()
        self.assertTrue(
            any("pv_max" in i for i in report["issues"]),
            f"expected pv_max issue, got {report['issues']}",
        )

    def test_rejects_bad_archetype(self):
        bad = [{
            "id": "bad", "name_fr": "Bad", "pv_max": 1000,
            "loot_gold": 10, "archetype": "dragon",
        }]
        with patch.object(pt, "_load_generated", return_value=bad):
            report = pt.check_camps_feasibility()
        self.assertTrue(
            any("archetype" in i for i in report["issues"]),
            f"expected archetype issue, got {report['issues']}",
        )

    def test_rejects_zero_loot_nontrivial_camp(self):
        bad = [{
            "id": "poor", "name_fr": "Poor", "pv_max": 5000,
            "loot_gold": 0, "loot_wood": 0, "loot_mana": 0,
        }]
        with patch.object(pt, "_load_generated", return_value=bad):
            report = pt.check_camps_feasibility()
        self.assertTrue(
            any("zero loot" in i for i in report["issues"]),
            f"expected zero-loot issue, got {report['issues']}",
        )


class PlaytestItemsFeasibilityTests(unittest.TestCase):
    """`check_items_feasibility` must catch out-of-range buff stats."""

    def test_current_items_are_clean(self):
        report = pt.check_items_feasibility()
        self.assertEqual(
            report["issues"], [],
            f"live items should be clean but got {report['issues']}",
        )

    def test_rejects_buff_multiplier_out_of_range(self):
        bad = [{
            "id": 200, "name_fr": "Bad", "buff_effect": "train_speed",
            "buff_multiplier": 10, "buff_duration_seconds": 600,
        }]
        with patch.object(pt, "_load_generated", return_value=bad):
            report = pt.check_items_feasibility()
        self.assertTrue(
            any("buff_multiplier" in i for i in report["issues"]),
            f"expected multiplier issue, got {report['issues']}",
        )

    def test_rejects_legacy_id_collision(self):
        bad = [{"id": 50, "name_fr": "Legacy clash"}]
        with patch.object(pt, "_load_generated", return_value=bad):
            report = pt.check_items_feasibility()
        self.assertTrue(
            any("id must be >= 100" in i for i in report["issues"]),
            f"expected legacy id issue, got {report['issues']}",
        )


class PlaytestRunAllTests(unittest.TestCase):
    """`run_all` must surface camps/items issues in the top-level blockers."""

    def test_run_all_propagates_camps_issues_into_blockers(self):
        bad = [{"id": "broken", "name_fr": "Broken", "pv_max": 0}]

        def fake_loader(name, list_key):
            return bad if name == "camps" else []

        with patch.object(pt, "_load_generated", side_effect=fake_loader):
            report = pt.run_all()

        self.assertIn("camps", report)
        self.assertEqual(report["status"], "yellow")
        self.assertTrue(
            any("broken" in b for b in report["blockers"]),
            f"camp issue should have surfaced in blockers, got {report['blockers']}",
        )


if __name__ == "__main__":
    unittest.main()
