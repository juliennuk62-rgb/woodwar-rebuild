"""
Chargement et exposition des données de jeu statiques (data/*.json).

Les fichiers data/ sont la source de vérité : toute modification d'équilibrage
passe par ces fichiers, pas par le code.

Les fichiers data/generated/*.json contiennent du contenu produit par le
générateur automatique (trigger quotidien). Ils sont chargés en plus des
fichiers de base et peuvent être vides au démarrage.
"""
from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
GENERATED_DIR = DATA_DIR / "generated"


def _load(name: str) -> dict:
    """Load a JSON file from data/. Raises if missing or invalid."""
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing game data file: {path}")
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _load_generated(name: str, default_key: str) -> list:
    """Load a generated file (may be empty) and return its main list.

    Returns an empty list if the file is missing, malformed, or the
    key doesn't exist. Generated content is treated as optional: the
    game must work even if nothing has been generated yet.
    """
    path = GENERATED_DIR / f"{name}.json"
    if not path.exists():
        return []
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        value = data.get(default_key, [])
        if not isinstance(value, list):
            return []
        return value
    except (json.JSONDecodeError, OSError):
        return []


class GameData:
    """Holds all static game data loaded at startup."""

    def __init__(self) -> None:
        self.units = _load("units")
        self.buildings = _load("buildings")
        self.clans = _load("clans")
        self.dracos = _load("dracos")
        self.relics = _load("relics")
        self.rules = _load("rules")
        self.technologies = _load("technologies")
        self.items = _load("items")
        self.achievements = _load("achievements")
        self.weapons = _load("weapons")
        self.packs = _load("packs")

        # Generated content — optional, may be empty.
        self.generated_quests = _load_generated("quests", "quests")
        self.generated_events = _load_generated("events", "events")
        self.generated_lore = _load_generated("lore", "entries")
        self.generated_camps = _load_generated("camps", "camps")
        self.generated_items = _load_generated("items", "items")

        # Merge generated items into the main items list (items.json schema)
        # so that item_by_id and drop logic see them all.
        for gi in self.generated_items:
            if not any(i.get("id") == gi.get("id") for i in self.items["items"]):
                self.items["items"].append(gi)

    def counts(self) -> dict:
        return {
            "units": len(self.units["units"]),
            "buildings": len(self.buildings["buildings"]),
            "clans": len(self.clans["clans"]),
            "dracos": len(self.dracos["dracos"]),
            "relics": len(self.relics["relics"]),
            "technologies": len(self.technologies["technologies"]),
            "items": len(self.items["items"]),
            "achievements": len(self.achievements["achievements"]),
            "weapon_tiers": len(self.weapons["tier_costs"]),
            "packs_historical": len(self.packs["packs"]),
        }

    def unit_by_id(self, unit_id: int) -> dict | None:
        for u in self.units["units"]:
            if u["id"] == unit_id:
                return u
        return None

    def building_by_id(self, building_id: int) -> dict | None:
        for b in self.buildings["buildings"]:
            if b["id"] == building_id:
                return b
        return None

    def clan_by_id(self, clan_id: int) -> dict | None:
        for c in self.clans["clans"]:
            if c["id"] == clan_id:
                return c
        return None

    def technology_by_id(self, tech_id: int) -> dict | None:
        for t in self.technologies["technologies"]:
            if t["id"] == tech_id:
                return t
        return None

    def item_by_id(self, item_id: int) -> dict | None:
        for i in self.items["items"]:
            if i["id"] == item_id:
                return i
        return None

    def achievement_by_id(self, achievement_id: int) -> dict | None:
        for a in self.achievements["achievements"]:
            if a["id"] == achievement_id:
                return a
        return None

    def compute_turret_cost(self, total_player_defense: int, turret_slug: str) -> dict:
        """Apply the dynamic turret pricing formula from prix_tourelles.php.

        turret_slug: one of 'turret_defense', 'turret_deadly',
                     'turret_destroyer', 'motte'.
        """
        fractions = self.buildings["turret_pricing"]["defense_bonus_fraction"]
        if turret_slug not in fractions:
            raise ValueError(f"Unknown turret slug: {turret_slug}")
        def_t = round(total_player_defense * fractions[turret_slug])
        boost = def_t + round(def_t / 10)
        return {
            "defense_bonus": def_t,
            "or": round(boost * 1.0),
            "bois": round(boost * 0.75),
        }


# Singleton instance, loaded once at import time.
game_data = GameData()
