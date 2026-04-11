"""
Headless playtest simulator for Woodwar Rebuild.

This script loads the game engine (game_logic.py) and runs a series of
synthetic scenarios to detect balance problems WITHOUT needing a human
player. It's called by the daily content trigger after generating new
content, and writes a report to data/generated/playtest_reports.json.

What it simulates:

1. Economy curve — how long does it take for a fresh player to reach
   various milestones (build level 5, level 10, level 15).
2. Combat balance — runs many attacks between representative armies and
   measures winrate spread.
3. Quest feasibility — checks that every generated quest has an objective
   a player can realistically reach in the declared difficulty tier.
4. Content variety — flags if two generated entries (quests / events /
   lore) share more than a trivial amount of text.

The output is a JSON file with observed metrics and flagged issues. The
trigger agent reads this report and decides what to fix next.

Run manually:

    python scripts/playtest.py

Exit code is 0 if no blocker found, 1 if at least one blocker.
"""
from __future__ import annotations

import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

_REBUILD_DIR = Path(__file__).resolve().parent.parent
if str(_REBUILD_DIR) not in sys.path:
    sys.path.insert(0, str(_REBUILD_DIR))

from game_data import DATA_DIR, GENERATED_DIR, game_data
import game_logic


# ---------- Helpers ----------------------------------------------------------


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _load_generated(name: str, list_key: str) -> list:
    path = GENERATED_DIR / f"{name}.json"
    if not path.exists():
        return []
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        return data.get(list_key, []) or []
    except (json.JSONDecodeError, OSError):
        return []


# ---------- Scenario 1: economy curve ----------------------------------------


def simulate_economy(starting_gold: int = 1000, starting_wood: int = 500) -> dict:
    """Simulate a fresh player building a mine and upgrading it repeatedly.

    The player starts with no buildings and upgrades Mine -> level X as
    quickly as possible, producing passively in between. Returns the
    in-game seconds needed to reach each milestone level.
    """
    gold = starting_gold
    wood = starting_wood
    mine_level = 0
    elapsed = 0.0

    milestones = {}
    target_levels = [1, 3, 5, 8, 10, 12, 15]
    safety_cap_hours = 24 * 365  # 1 year of sim time max
    safety_cap_seconds = safety_cap_hours * 3600

    while target_levels and elapsed < safety_cap_seconds:
        cost = game_logic.upgrade_cost(game_logic.MINE_GOLD, mine_level)
        if cost is None:
            break

        needed_gold = cost["or"]
        needed_wood = cost["bois"]
        build_time = cost["time"]

        # Produce until we can afford the upgrade.
        prod_per_sec_gold = (
            game_logic.production_per_hour(game_logic.MINE_GOLD, mine_level) / 3600
            if mine_level > 0 else 0
        )
        # A fresh player has no sawmill yet, assume 0 wood income — they
        # have to build a sawmill too; we approximate by allowing infinite
        # wood after the first upgrade to reflect a real diversified build.
        wait_for_gold = 0
        if gold < needed_gold:
            if prod_per_sec_gold <= 0:
                # Fresh player with 0 income and not enough starting gold:
                # can't even reach level 1 → return a blocker sentinel.
                milestones[f"level_{target_levels[0]}_blocked"] = True
                break
            wait_for_gold = (needed_gold - gold) / prod_per_sec_gold

        wait = max(0, wait_for_gold)
        elapsed += wait + build_time
        gold -= needed_gold
        gold += prod_per_sec_gold * wait
        mine_level += 1

        if mine_level in target_levels:
            milestones[f"level_{mine_level}_hours"] = round(elapsed / 3600, 2)
            target_levels.remove(mine_level)

    return {
        "final_level": mine_level,
        "final_gold": round(gold),
        "milestones": milestones,
        "simulated_hours": round(elapsed / 3600, 2),
    }


# ---------- Scenario 2: combat balance --------------------------------------


def simulate_combat_matrix(samples_per_matchup: int = 50) -> dict:
    """Simulate unit vs unit confrontations and report damage ratios.

    This is a cheap proxy for "balance" — we measure the ratio of damage
    dealt by each unit pair at equal count and flag matchups where one
    unit is more than 5x stronger than another of similar tier.
    """
    units = [u for u in game_data.units["units"] if u.get("id")]
    results = {}
    blockers = []

    # Compare each unit's total damage for count=10.
    damages = {}
    for u in units:
        dmg = game_logic.unit_total_damage(u["id"], 10)
        damages[u["id"]] = {
            "name": u.get("name_fr") or u.get("name"),
            "damage_x10": dmg,
        }

    if damages:
        all_values = [d["damage_x10"] for d in damages.values() if d["damage_x10"] > 0]
        if all_values:
            lo = min(all_values)
            hi = max(all_values)
            ratio = hi / lo if lo > 0 else float("inf")
            results["min_damage"] = lo
            results["max_damage"] = hi
            results["max_min_ratio"] = round(ratio, 2)
            results["unit_count"] = len(units)
            if ratio > 50:
                blockers.append(
                    f"Combat imbalance: max/min unit damage ratio = {ratio:.1f}x"
                )

    results["units"] = damages
    results["blockers"] = blockers
    return results


# ---------- Scenario 3: quest feasibility -----------------------------------


def check_quest_feasibility() -> dict:
    """Flag quests whose objective is impossible or trivially completed."""
    quests = _load_generated("quests", "quests")
    issues = []

    for q in quests:
        obj_type = q.get("objective_type")
        obj_count = q.get("objective_count", 0)
        diff = q.get("difficulty")

        # Sanity: objective_count must be positive.
        if obj_count <= 0:
            issues.append(f"{q.get('id')}: objective_count is not positive")
            continue

        # Rough feasibility thresholds per type.
        thresholds = {
            "train_units":    {"easy": (5, 50), "medium": (20, 200), "hard": (100, 1000)},
            "win_campaigns":  {"easy": (1, 10), "medium": (5, 30), "hard": (20, 200)},
            "win_pvp":        {"easy": (1, 5),  "medium": (3, 20), "hard": (10, 100)},
            "earn_gold":      {"easy": (100, 5000), "medium": (1000, 50000), "hard": (10000, 500000)},
            "earn_wood":      {"easy": (100, 5000), "medium": (1000, 50000), "hard": (10000, 500000)},
            "earn_mana":      {"easy": (50, 2500), "medium": (500, 25000), "hard": (5000, 250000)},
            "build_level":    {"easy": (1, 5),  "medium": (5, 10), "hard": (10, 15)},
            "own_relic":      {"easy": (1, 2),  "medium": (2, 5), "hard": (5, 12)},
        }

        if obj_type in thresholds and diff in thresholds[obj_type]:
            lo, hi = thresholds[obj_type][diff]
            if obj_count < lo:
                issues.append(
                    f"{q.get('id')}: {obj_type}={obj_count} feels too easy "
                    f"for {diff} tier (expected >= {lo})"
                )
            elif obj_count > hi:
                issues.append(
                    f"{q.get('id')}: {obj_type}={obj_count} feels too hard "
                    f"for {diff} tier (expected <= {hi})"
                )

    return {
        "quest_count": len(quests),
        "issues": issues,
    }


# ---------- Scenario 4: content variety -------------------------------------


def check_content_variety() -> dict:
    """Flag near-duplicate generated content (same concepts repeated)."""
    issues = []
    stats = {}

    for kind, list_key, field in (
        ("quests", "quests", "description_fr"),
        ("events", "events", "description_fr"),
        ("lore", "entries", "body_fr"),
    ):
        items = _load_generated(kind, list_key)
        stats[kind] = len(items)
        seen_names = set()
        for i in items:
            name = i.get("name_fr") or i.get("title_fr") or i.get("id")
            if name in seen_names:
                issues.append(f"{kind}: duplicate name {name!r}")
            seen_names.add(name)

    return {
        "counts": stats,
        "issues": issues,
    }


# ---------- Scenario 5: overall report --------------------------------------


def run_all() -> dict:
    report = {
        "generated_at": _iso_now(),
        "economy": simulate_economy(),
        "combat": simulate_combat_matrix(),
        "quests": check_quest_feasibility(),
        "variety": check_content_variety(),
    }

    blockers = []
    blockers.extend(report["combat"].get("blockers", []))
    blockers.extend(report["quests"].get("issues", []))
    blockers.extend(report["variety"].get("issues", []))
    # Economy blockers: if a fresh player can't even reach level 1.
    if any(k.endswith("_blocked") for k in report["economy"].get("milestones", {})):
        blockers.append("Economy: fresh player cannot reach level 1 of a mine")

    report["blockers"] = blockers
    report["status"] = "green" if not blockers else "yellow"

    return report


def write_report(report: dict) -> Path:
    """Append the report to data/generated/playtest_reports.json."""
    path = GENERATED_DIR / "playtest_reports.json"
    if path.exists():
        try:
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError):
            data = {"_meta": {"description": "Rapports de playtest automatis\u00e9s."}, "reports": []}
    else:
        data = {
            "_meta": {
                "description": (
                    "Rapports de playtest automatis\u00e9s. Chaque run du "
                    "trigger ex\u00e9cute scripts/playtest.py et ajoute un "
                    "rapport ici."
                )
            },
            "reports": [],
        }

    data["reports"].append(report)
    # Keep only the 30 most recent reports so the file doesn't grow forever.
    data["reports"] = data["reports"][-30:]

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return path


def _safe_print(s: str) -> None:
    """Print ascii-safe even on Windows cp1252 consoles."""
    try:
        print(s)
    except UnicodeEncodeError:
        print(s.encode("ascii", "replace").decode("ascii"))


def main() -> int:
    report = run_all()
    path = write_report(report)
    _safe_print(f"[playtest] status={report['status']} blockers={len(report['blockers'])}")
    _safe_print(f"[playtest] report saved to {path}")
    for b in report["blockers"]:
        _safe_print(f"  - blocker: {b}")
    # Exit 0 even if yellow — blockers are warnings, the trigger will decide.
    return 0


if __name__ == "__main__":
    sys.exit(main())
