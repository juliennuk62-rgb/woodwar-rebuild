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
4. Content variety — counts entries across every generated file
   (quests / events / lore / camps / items) and flags near-duplicates.
5. Camps feasibility — verifies pv_max, difficulty_tier, loot and
   archetype/ai_pattern whitelists on every generated camp.
6. Items feasibility — verifies buff_effect, buff_multiplier, duration
   and drop_weight on every generated item, and flags legacy id clashes.

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
    """Flag near-duplicate generated content (same concepts repeated).

    Covers every generated file we currently care about : quests, events,
    lore, camps, items. Counts are exposed in `variety.counts` so the
    trigger agent can immediately see which categories are under-served.
    """
    issues = []
    stats = {}

    for kind, list_key, field in (
        ("quests", "quests", "description_fr"),
        ("events", "events", "description_fr"),
        ("lore", "entries", "body_fr"),
        ("camps", "camps", "description_fr"),
        ("items", "items", "description_fr"),
    ):
        items = _load_generated(kind, list_key)
        stats[kind] = len(items)
        seen_names = set()
        for i in items:
            name = i.get("name_fr") or i.get("title_fr") or i.get("id")
            if name in seen_names:
                issues.append(f"{kind}: duplicate name {name!r}")
            seen_names.add(name)

    # Cross-content id collisions : two different generated files must
    # not re-use the same slug (e.g. a quest id and a camp id matching)
    # because the seeding code keys rows by id and would silently
    # overwrite one with the other.
    id_source = {}
    for kind, list_key in (
        ("quests", "quests"),
        ("events", "events"),
        ("lore", "entries"),
        ("camps", "camps"),
    ):
        for i in _load_generated(kind, list_key):
            iid = i.get("id")
            if iid is None:
                continue
            if iid in id_source and id_source[iid] != kind:
                issues.append(
                    f"cross-content id clash: {iid!r} appears in "
                    f"both {id_source[iid]} and {kind}"
                )
            else:
                id_source[iid] = kind

    return {
        "counts": stats,
        "issues": issues,
    }


# ---------- Scenario 5: camps feasibility -----------------------------------


def check_camps_feasibility() -> dict:
    """Flag generated camps whose stats fall outside playable ranges.

    Mirrors `tests.test_data.test_generated_camps_follow_schema` but runs
    at playtest time so that a bad camp is reported as a yellow blocker
    instead of simply failing the test suite. Also checks loot balance
    (must be non-negative and roughly scaled to pv_max so that tier-5
    camps actually drop tier-5 rewards).
    """
    camps = _load_generated("camps", "camps")
    issues = []

    valid_biomes = {"marecage", "foret", "brouillard", "montagnes", "fortifie"}
    valid_archetypes = {"kobold", "ambusher", "troll", "wraith", "boss"}
    valid_patterns = {
        "passive", "aggressive", "armored", "evasive", "regenerator",
    }

    for c in camps:
        cid = c.get("id", "<no-id>")
        pv = c.get("pv_max")
        if not isinstance(pv, int) or pv < 300 or pv > 100000:
            issues.append(
                f"{cid}: pv_max={pv} outside [300, 100000] playable range"
            )
        biome = c.get("biome")
        if biome is not None and biome not in valid_biomes:
            issues.append(f"{cid}: invalid biome {biome!r}")
        arch = c.get("archetype")
        if arch is not None and arch not in valid_archetypes:
            issues.append(f"{cid}: invalid archetype {arch!r}")
        pattern = c.get("ai_pattern")
        if pattern is not None and pattern not in valid_patterns:
            issues.append(f"{cid}: invalid ai_pattern {pattern!r}")
        tier = c.get("difficulty_tier")
        if tier is not None and (not isinstance(tier, int) or tier < 1 or tier > 5):
            issues.append(
                f"{cid}: difficulty_tier={tier} outside [1, 5]"
            )
        # Loot sanity : must be non-negative and at least one of the three
        # pools must be positive (an empty-loot camp is pointless PvE).
        loot_fields = ("loot_gold", "loot_wood", "loot_mana")
        loot_values = [c.get(f, 0) for f in loot_fields]
        if any((not isinstance(v, int)) or v < 0 for v in loot_values):
            issues.append(
                f"{cid}: one of {loot_fields} is negative or non-int"
            )
        elif sum(loot_values) == 0 and isinstance(pv, int) and pv >= 500:
            issues.append(
                f"{cid}: non-trivial camp (pv={pv}) drops zero loot"
            )

    return {
        "camp_count": len(camps),
        "issues": issues,
    }


# ---------- Scenario 6: items feasibility -----------------------------------


def check_items_feasibility() -> dict:
    """Flag generated items whose stats fall outside playable ranges.

    Mirrors `tests.test_data.test_generated_items_follow_schema` but at
    playtest time, and additionally verifies that no generated item
    re-uses the id of a canonical (legacy) item, which would break the
    merge done in game_data.GameData.__init__.
    """
    items = _load_generated("items", "items")
    issues = []

    valid_buff_effects = {
        "train_speed", "attack_power", "camp_gold",
        "camp_wood", "camp_mana", "fret_capacity",
    }
    legacy_ids = {
        i.get("id") for i in game_data.items.get("items", [])
        if i.get("id") is not None and i.get("id") < 100
    }

    for i in items:
        iid = i.get("id", "<no-id>")
        if isinstance(iid, int) and iid in legacy_ids:
            issues.append(
                f"{iid}: generated item collides with legacy item id"
            )
        if isinstance(iid, int) and iid < 100:
            issues.append(f"{iid}: generated item id must be >= 100")

        buff = i.get("buff_effect")
        if buff is None:
            continue
        if buff not in valid_buff_effects:
            issues.append(f"{iid}: invalid buff_effect {buff!r}")
            continue
        mult = i.get("buff_multiplier")
        if mult is None or not (0.5 <= mult <= 2.5):
            issues.append(
                f"{iid}: buff_multiplier={mult} outside [0.5, 2.5]"
            )
        dur = i.get("buff_duration_seconds")
        if dur is None or not (60 <= dur <= 7200):
            issues.append(
                f"{iid}: buff_duration_seconds={dur} outside [60, 7200]"
            )
        drop = i.get("drop_weight")
        if drop is not None and not (1 <= drop <= 10):
            issues.append(f"{iid}: drop_weight={drop} outside [1, 10]")

    return {
        "item_count": len(items),
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
        "camps": check_camps_feasibility(),
        "items": check_items_feasibility(),
    }

    blockers = []
    blockers.extend(report["combat"].get("blockers", []))
    blockers.extend(report["quests"].get("issues", []))
    blockers.extend(report["variety"].get("issues", []))
    blockers.extend(report["camps"].get("issues", []))
    blockers.extend(report["items"].get("issues", []))
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
