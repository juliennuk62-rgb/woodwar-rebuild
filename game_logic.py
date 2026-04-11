"""
Moteur de jeu : formules de coût, de production, combat, et application du tick.

Toutes les formules sont directement extraites du code PHP original :
- Upgrade producers : nivprix.php lignes 27-57
- Upgrade caserne/labs : nivprix.php lignes 4-26, 58-103, 105-128, 130-153
- Production : functions2.php ligne 1213 (calcul_ressources_from_lvl)
- Combat : attaque_campagne2.php + view_campagne_functions.php calcul_armee()
- Multiplicateur reliques : nb_degats_relique = 3 (config.php)
"""
from __future__ import annotations

import json
import random
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from game_data import game_data

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from models import (
        ActiveBuff,
        Alliance,
        AllianceDiplomacy,
        AllianceInvitation,
        AllianceMember,
        AllianceMessage,
        GameState,
        KoboldCamp,
        Player,
        PlayerAchievement,
        PlayerBuilding,
        PlayerDraco,
        PlayerItem,
        PlayerRelic,
        PlayerUnit,
        PrivateMessage,
        User,
    )


# Bundle B constants
ITEM_DROP_CHANCE = 0.15      # 15% chance on PvE victory to drop an item
SPY_MANA_COST = 500           # cost to spy on another player
MARKET_EXCHANGE_RATIO = 2     # 2 units of source = 1 unit of target (50% fee)


# Diplomatic relations.
RELATION_NEUTRAL = "neutral"
RELATION_ALLY = "ally"
RELATION_ENEMY = "enemy"
VALID_RELATIONS = (RELATION_NEUTRAL, RELATION_ALLY, RELATION_ENEMY)

PRIVATE_MESSAGE_MAX_LEN = 2000
PRIVATE_MESSAGE_SUBJECT_MAX_LEN = 128


# Alliance costs (from rules.json).
ALLIANCE_CREATION_COST_GOLD = 2000
ALLIANCE_INVITATION_COST_GOLD = 500
ALLIANCE_MAX_MEMBERS = 30
ALLIANCE_CHAT_MESSAGE_MAX_LEN = 500


# Relic drop rate on camp victory (10%).
_RELIC_DROP_CHANCE = 0.10

# Damage multiplier applied to units matched by an owned relic.
# Source : config.php $nb_degats_relique = 3
RELIC_DAMAGE_MULTIPLIER = 3


# ----- IDs from buildings.json -----------------------------------------------

CASERNE = 1
MINE_GOLD = 2
FOUNTAIN_MANA = 3
SAWMILL = 4
MAGIC_LAB = 5
TECH_LAB = 6
BESTIARY = 11
INN = 14

#: Buildings available for construction/upgrade in Phase 3.
BUILDABLE_IDS = {CASERNE, MINE_GOLD, FOUNTAIN_MANA, SAWMILL, MAGIC_LAB, TECH_LAB, BESTIARY, INN}

#: Buildings that produce resources passively. Map to resource name.
PRODUCERS = {
    MINE_GOLD: "gold",
    FOUNTAIN_MANA: "mana",
    SAWMILL: "wood",
}


# ----- Upgrade cost tables (from nivprix.php) --------------------------------

# Hardcoded table used by caserne (1), magic lab (5), tech lab (6),
# bestiary (11), and inn (14). Key = target level, value = (or, bois, time).
_HARDCODED_TABLE: dict[int, tuple[int, int, int]] = {
    1:  (200,     100,    50),
    2:  (250,     200,    70),
    3:  (400,     400,    100),
    4:  (800,     800,    150),
    5:  (1800,    1600,   300),
    6:  (3000,    2500,   600),
    7:  (6000,    5000,   1000),
    8:  (12000,   10000,  2000),
    9:  (24000,   20000,  4000),
    10: (48000,   40000,  8000),
    11: (96000,   50000,  16000),
    12: (150000,  100000, 32000),
    13: (300000,  200000, 64000),
    14: (600000,  300000, 128000),
    # 15+ saturates at the same cost
}
_HARDCODED_CAP = (1200000, 400000, 256000)

# Multiplier on the hardcoded table, keyed by building id.
_HARDCODED_MULTIPLIER: dict[int, int] = {
    CASERNE: 2,
    MAGIC_LAB: 2,
    TECH_LAB: 2,
    BESTIARY: 4,
    INN: 20,
}

# Max level per building (from niv_max in nivprix.php).
_MAX_LEVEL: dict[int, int] = {
    CASERNE: 15,
    MINE_GOLD: 100000,
    FOUNTAIN_MANA: 100000,
    SAWMILL: 100000,
    MAGIC_LAB: 15,
    TECH_LAB: 13,
    BESTIARY: 15,
    INN: 15,
}

#: Global 0.66 multiplier applied to bois at the very end of nivprix.php.
_GLOBAL_BOIS_FACTOR = 0.66


def max_level(building_id: int) -> int:
    return _MAX_LEVEL.get(building_id, 15)


def upgrade_cost(building_id: int, current_level: int) -> dict | None:
    """Return the cost (or, bois, time_seconds) to upgrade from L to L+1.

    Returns None if the building is not upgradable further or not buildable.
    current_level == 0 means the building has not been constructed yet;
    the returned cost is the cost to *build* it (level 0 -> level 1).
    """
    if building_id not in BUILDABLE_IDS:
        return None
    if current_level >= max_level(building_id):
        return None

    # Producers: Mine (2), Fountain (3), Sawmill (4).
    if building_id in PRODUCERS:
        if current_level == 0:
            or_cost = 50
            time_cost = 50
        else:
            # nivprix.php: $or = round(104.5 * 2^((niveau+1)*1.1))
            or_cost = round(104.5 * 2 ** ((current_level + 1) * 1.1))
            # $temps = ((niveau+1)^1.55 - 2.5) * 3600
            time_cost = round(((current_level + 1) ** 1.55 - 2.5) * 3600)
        # $bois = round(or * 0.66), then globally $bois = round(bois * 0.66)
        bois_cost = round(round(or_cost * 0.66) * _GLOBAL_BOIS_FACTOR)
        return {"or": or_cost, "bois": bois_cost, "time": time_cost}

    # Hardcoded table buildings: caserne, labs, bestiary, inn.
    target = current_level + 1
    if target >= 15:
        base_or, base_bois, base_time = _HARDCODED_CAP
    else:
        base_or, base_bois, base_time = _HARDCODED_TABLE[target]

    mult = _HARDCODED_MULTIPLIER.get(building_id, 1)
    or_cost = base_or * mult
    bois_cost = base_bois * mult
    # Global 0.66 factor at end of nivprix.php applies to all branches.
    bois_cost = round(bois_cost * _GLOBAL_BOIS_FACTOR)
    time_cost = base_time
    return {"or": or_cost, "bois": bois_cost, "time": time_cost}


# ----- Production (from functions2.php calcul_ressources_from_lvl) ------------


def production_per_hour(building_id: int, level: int) -> float:
    """Return the amount of resource produced per hour at the given level.

    Formula (same for gold / wood / mana):
        per_hour = round(295.5 * 2^(level * 0.7)) / 24

    Important difference from the original: level 0 (not built) returns 0.
    The original had a subtle bug where even non-existent mines produced a
    trickle of gold because of an uninitialized variable path.
    """
    if building_id not in PRODUCERS:
        return 0.0
    if level <= 0:
        return 0.0
    return round(295.5 * 2 ** (level * 0.7)) / 24


def production_per_second(building_id: int, level: int) -> float:
    return production_per_hour(building_id, level) / 3600.0


# ----- Tick application -------------------------------------------------------


def apply_production_tick(db_session: "Session", player: "Player") -> dict:
    """Credit the player's resources for the time elapsed since last_tick.

    Also promotes any buildings whose upgrade has completed, collects any
    training batch that has finished, and expires dead buffs.

    Returns a dict of credits applied: {gold, wood, mana, completed_upgrades}.
    Mutates the player in place (the caller is responsible for commit).
    """
    now = datetime.utcnow()
    elapsed = (now - player.last_tick).total_seconds()
    if elapsed < 0:
        elapsed = 0

    # 0) Clean expired buffs + collect finished training (Bundle B).
    clean_expired_buffs(db_session, player)
    training_done = collect_training(db_session, player)

    # 1) Complete any finished upgrades BEFORE computing production, so the
    #    fresh level counts for this tick (imperceptible in practice, but
    #    semantically cleaner).
    completed: list[tuple[int, int]] = []
    for pb in player.buildings:
        if pb.upgrading_until is not None and pb.upgrading_until <= now:
            pb.level = pb.upgrading_to or (pb.level + 1)
            pb.upgrading_until = None
            pb.upgrading_to = None
            completed.append((pb.building_id, pb.level))

    # 2) Sum production rates across all producer buildings.
    rate_gold = rate_wood = rate_mana = 0.0
    for pb in player.buildings:
        if pb.building_id == MINE_GOLD:
            rate_gold += production_per_second(MINE_GOLD, pb.level)
        elif pb.building_id == SAWMILL:
            rate_wood += production_per_second(SAWMILL, pb.level)
        elif pb.building_id == FOUNTAIN_MANA:
            rate_mana += production_per_second(FOUNTAIN_MANA, pb.level)

    # 3) Credit resources. Use integer math on the floor to avoid fractional
    #    drift; the remainder stays in the clock via last_tick.
    credit_gold = int(rate_gold * elapsed)
    credit_wood = int(rate_wood * elapsed)
    credit_mana = int(rate_mana * elapsed)

    player.gold += credit_gold
    player.wood += credit_wood
    player.mana += credit_mana
    player.last_tick = now

    return {
        "elapsed_seconds": elapsed,
        "credits": {"gold": credit_gold, "wood": credit_wood, "mana": credit_mana},
        "rates_per_hour": {
            "gold": rate_gold * 3600,
            "wood": rate_wood * 3600,
            "mana": rate_mana * 3600,
        },
        "completed_upgrades": completed,
    }


# ----- Unit training ----------------------------------------------------------


def caserne_level(player: "Player") -> int:
    """Return the player's caserne level, or 0 if not built."""
    for pb in player.buildings:
        if pb.building_id == CASERNE:
            return pb.level
    return 0


def train_unit(
    db_session: "Session",
    player: "Player",
    unit_id: int,
    quantity: int,
) -> dict:
    """Train `quantity` units of type `unit_id`.

    MVP behaviour: instant training (no queue, no timer). The player pays
    the resources and immediately receives the units. This is a deliberate
    simplification over the original game where each unit has a training
    time — we keep the data (time field in units.json) for when we want to
    re-introduce timed training in a later polish pass.

    Raises ValueError with a user-facing message on any problem.
    """
    from models import PlayerUnit  # local import to avoid circular

    if quantity <= 0:
        raise ValueError("Quantité invalide.")
    if quantity > 10000:
        raise ValueError("Quantité trop élevée (max 10 000 par ordre).")

    unit = game_data.unit_by_id(unit_id)
    if unit is None:
        raise ValueError("Unité inconnue.")

    # Caserne level gate.
    caserne_lvl = caserne_level(player)
    required = unit.get("caserne_required", 1)
    if caserne_lvl < required:
        raise ValueError(
            f"Cette unité nécessite une Caserne de niveau {required} "
            f"(actuel : {caserne_lvl})."
        )

    cost = unit["cost"]
    total_or = cost["or"] * quantity
    total_bois = cost["bois"] * quantity
    total_mana = cost["mana"] * quantity
    total_epeautre = cost.get("epeautre", 0) * quantity

    if (
        player.gold < total_or
        or player.wood < total_bois
        or player.mana < total_mana
        or player.spelt < total_epeautre
    ):
        raise ValueError(
            f"Ressources insuffisantes. Il faut {total_or} or, "
            f"{total_bois} bois, {total_mana} mana."
        )

    # Pay.
    player.gold -= total_or
    player.wood -= total_bois
    player.mana -= total_mana
    player.spelt -= total_epeautre

    # Credit the stock.
    existing = None
    for pu in player.units:
        if pu.unit_id == unit_id:
            existing = pu
            break
    if existing is None:
        existing = PlayerUnit(player_id=player.id, unit_id=unit_id, count=quantity)
        db_session.add(existing)
    else:
        existing.count += quantity

    # Track lifetime counter for achievements.
    player.total_units_trained += quantity

    return {
        "unit_id": unit_id,
        "unit_name": unit["name_fr"],
        "quantity": quantity,
        "cost": {"or": total_or, "bois": total_bois, "mana": total_mana},
    }


def unit_stock(player: "Player") -> dict[int, int]:
    """Return {unit_id: count} for all units owned by the player."""
    return {pu.unit_id: pu.count for pu in player.units if pu.count > 0}


def unit_total_damage(unit_id: int, count: int, relic_ids: set[int] | None = None) -> int:
    """Return total damage. If relic_ids contains a relic matching this unit
    (same id), the unit damage is multiplied by RELIC_DAMAGE_MULTIPLIER.

    Matching rule: relics multiply damage for the unit type with the same id.
    Simple 1-to-1 mapping since both relics and units are 1..12.
    """
    unit = game_data.unit_by_id(unit_id)
    if unit is None:
        return 0
    damage = unit["damage"]
    if relic_ids and unit_id in relic_ids:
        damage *= RELIC_DAMAGE_MULTIPLIER
    return damage * count


def unit_total_defense(unit_id: int, count: int) -> int:
    unit = game_data.unit_by_id(unit_id)
    if unit is None:
        return 0
    return unit["defense"] * count


def player_relic_ids(player: "Player") -> set[int]:
    """Return the set of relic ids owned by the player."""
    return {pr.relic_id for pr in player.relics}


# ----- Dracos (trained at the Bestiary) ---------------------------------------


def bestiary_level(player: "Player") -> int:
    for pb in player.buildings:
        if pb.building_id == BESTIARY:
            return pb.level
    return 0


def train_draco(
    db_session: "Session",
    player: "Player",
    draco_id: int,
    quantity: int,
) -> dict:
    """Train dracos at the Bestiary. Requires a Bestiary of adequate level."""
    from models import PlayerDraco

    if quantity <= 0:
        raise ValueError("Quantité invalide.")
    if quantity > 100:
        raise ValueError("Quantité trop élevée (max 100).")

    draco = next((d for d in game_data.dracos["dracos"] if d["id"] == draco_id), None)
    if draco is None:
        raise ValueError("Draco inconnu.")

    required = draco["caserne_required"]  # field name reused from nivprix — it's bestiary level
    bestiary_lvl = bestiary_level(player)
    if bestiary_lvl < required:
        raise ValueError(
            f"Ce draco nécessite un Bestiaire de niveau {required} "
            f"(actuel : {bestiary_lvl})."
        )

    cost = draco["cost"]
    total_or = cost["or"] * quantity
    total_bois = cost["bois"] * quantity
    total_mana = cost["mana"] * quantity

    if (
        player.gold < total_or
        or player.wood < total_bois
        or player.mana < total_mana
    ):
        raise ValueError(
            f"Ressources insuffisantes. Il faut {total_or} or, "
            f"{total_bois} bois, {total_mana} mana."
        )

    player.gold -= total_or
    player.wood -= total_bois
    player.mana -= total_mana

    existing = next((pd for pd in player.dracos if pd.draco_id == draco_id), None)
    if existing is None:
        existing = PlayerDraco(player_id=player.id, draco_id=draco_id, count=quantity)
        db_session.add(existing)
    else:
        existing.count += quantity

    return {
        "draco_id": draco_id,
        "draco_name": draco["name_fr"],
        "quantity": quantity,
        "cost": {"or": total_or, "bois": total_bois, "mana": total_mana},
    }


def draco_stock(player: "Player") -> dict[int, int]:
    return {pd.draco_id: pd.count for pd in player.dracos if pd.count > 0}


def draco_contribution(player: "Player") -> tuple[int, int]:
    """Return (damage, defense) contributed by all player's dracos.

    Dracos contribute flat stats : each draco id maps to a defense value in
    dracos.json. We multiply that by a damage factor so higher-tier dracos
    remain impactful offensively.
    """
    total_dmg = 0
    total_def = 0
    for pd in player.dracos:
        if pd.count <= 0:
            continue
        draco = next((d for d in game_data.dracos["dracos"] if d["id"] == pd.draco_id), None)
        if draco is None:
            continue
        # Higher tier draco = higher multiplier (200, 400, 600, 800 dmg/unit)
        dmg_per = draco["defense"] * 2  # simple derived value
        total_dmg += dmg_per * pd.count
        total_def += draco["defense"] * pd.count
    return total_dmg, total_def


# ----- Combat -----------------------------------------------------------------


def resolve_combat(
    db_session: "Session",
    player: "Player",
    camp: "KoboldCamp",
    army: dict[int, int],
) -> dict:
    """Resolve an attack against a Kobold camp.

    army: {unit_id: count_sent}

    Rules (adapted from attaque_campagne2.php + view_campagne_functions.php):
    - For each unit sent: damage = unit.damage × RELIC_DAMAGE_MULTIPLIER (×3)
      if the player owns the matching relic, else unit.damage
    - Dracos contribute their own flat damage (not affected by relics)
    - If points_armee >= camp.pv_current: VICTORY
        * Camp destroyed, respawn in 10 min
        * Full loot
        * Chance of relic drop (10%)
        * Small losses proportional to how contested the fight was
    - Else: CAMP WEAKENED
        * Camp HP reduced by points_armee
        * No loot
        * Losses up to 80% of the sent army
    """
    from models import CombatLog, PlayerRelic, PlayerUnit  # local import

    # Validate camp is alive.
    now = datetime.utcnow()
    if camp.respawn_at is not None and camp.respawn_at > now:
        raise ValueError("Ce camp a été détruit récemment, il est en train de se reformer.")
    if camp.respawn_at is not None and camp.respawn_at <= now:
        # Respawn: reset HP and clear the cooldown.
        camp.pv_current = camp.pv_max
        camp.respawn_at = None

    relic_ids = player_relic_ids(player)

    # Validate the army: every unit must be actually owned.
    stock = {pu.unit_id: pu for pu in player.units}
    total_units_sent = 0
    total_damage = 0
    total_defense = 0
    for unit_id, count in army.items():
        if count <= 0:
            continue
        pu = stock.get(unit_id)
        if pu is None or pu.count < count:
            raise ValueError(
                f"Vous n'avez pas {count} unités du type {unit_id}."
            )
        total_units_sent += count
        total_damage += unit_total_damage(unit_id, count, relic_ids)
        total_defense += unit_total_defense(unit_id, count)

    # Dracos always participate in every combat (they're a small number of
    # high-value units, not picked per battle).
    draco_dmg, draco_def = draco_contribution(player)
    total_damage += draco_dmg
    total_defense += draco_def

    # Bundle B: apply buff multipliers before resolution.
    clean_expired_buffs(db_session, player)
    attack_mult = active_multiplier(player, "attack_power")
    if attack_mult != 1.0:
        total_damage = int(total_damage * attack_mult)

    if total_units_sent == 0 and draco_dmg == 0:
        raise ValueError("Vous devez envoyer au moins une unité.")

    pv_before = camp.pv_current

    # ----- AI pattern resolution -----
    #
    # Apply the camp's archetype/AI pattern BEFORE comparing damage to HP.
    # Each pattern can mutate `effective_damage` and `extra_player_loss_ratio`.
    pattern = (camp.ai_pattern or "passive").lower()
    pattern_meta = AI_PATTERN_TUNING.get(pattern, {})
    pattern_log: list[str] = []  # short notes for the combat report
    effective_damage = total_damage
    extra_loss_ratio = 0.0

    if pattern == "evasive":
        if random.random() < pattern_meta.get("dodge_chance", 0.0):
            effective_damage = 0
            pattern_log.append("✦ L'ennemi esquive entièrement l'assaut.")
        else:
            pattern_log.append("✦ L'ennemi tente une esquive — sans succès.")

    elif pattern == "armored":
        ignored = pattern_meta.get("damage_ignored", 0.0)
        absorbed = int(effective_damage * ignored)
        effective_damage = max(0, effective_damage - absorbed)
        pattern_log.append(f"✦ Armure : {absorbed} dégâts absorbés.")

    elif pattern == "aggressive":
        # Counter-attack hits the player after the assault.
        counter = pattern_meta.get("counter_ratio", 0.0)
        extra_loss_ratio += counter
        pattern_log.append(
            f"✦ Contre-attaque : +{int(counter * 100)}% de pertes additionnelles."
        )

    elif pattern == "regenerator":
        # Will be applied AFTER outcome resolution if the camp survives.
        pass

    # Resolve outcome.
    relic_dropped = None
    item_dropped = None
    if effective_damage >= camp.pv_current:
        outcome = "victory"
        pv_after = 0
        # Bundle B: apply camp_gold/wood/mana buffs to the loot.
        gold_mult = active_multiplier(player, "camp_gold")
        wood_mult = active_multiplier(player, "camp_wood")
        mana_mult = active_multiplier(player, "camp_mana")
        loot = {
            "gold": int(camp.loot_gold * gold_mult),
            "wood": int(camp.loot_wood * wood_mult),
            "mana": int(camp.loot_mana * mana_mult),
        }
        loss_ratio = min(0.30, camp.pv_current / max(total_damage, 1) * 0.30)

        # Relic drop: 10% chance, only if player doesn't own all 12 already.
        if random.random() < _RELIC_DROP_CHANCE:
            owned = relic_ids
            all_ids = {r["id"] for r in game_data.relics["relics"]}
            available = list(all_ids - owned)
            if available:
                chosen_id = random.choice(available)
                db_session.add(
                    PlayerRelic(player_id=player.id, relic_id=chosen_id)
                )
                relic_info = next(
                    (r for r in game_data.relics["relics"] if r["id"] == chosen_id),
                    None,
                )
                relic_dropped = {
                    "id": chosen_id,
                    "name": relic_info["name_fr"] if relic_info else "Relique",
                }

        # Bundle B: usable item drop (independent from relic drop).
        dropped_item = drop_random_item(db_session, player)
        if dropped_item is not None:
            item_meta = next(
                (i for i in game_data.items["items"] if i["id"] == dropped_item),
                None,
            )
            item_dropped = {
                "id": dropped_item,
                "name": item_meta["name_fr"] if item_meta else f"Objet #{dropped_item}",
            }
    else:
        outcome = "weakened"
        pv_after = camp.pv_current - effective_damage
        loot = {"gold": 0, "wood": 0, "mana": 0}
        if total_defense > 0:
            loss_ratio = min(0.80, camp.pv_current / total_defense * 0.5)
        else:
            loss_ratio = 0.80

        # Regenerator pattern: if the camp survived, it heals back 15% of pv_max.
        if pattern == "regenerator":
            regen = int(camp.pv_max * pattern_meta.get("regen_ratio", 0.0))
            healed = min(regen, camp.pv_max - pv_after)
            if healed > 0:
                pv_after += healed
                pattern_log.append(f"✦ Régénération : +{healed} PV restaurés.")

    # Apply the aggressive counter-attack to player losses (added to base ratio).
    loss_ratio = min(0.95, loss_ratio + extra_loss_ratio)

    # Apply losses to each unit type proportionally (dracos are immortal here
    # — a deliberate simplification; in the original only their defense
    # degrades).
    losses: dict[int, int] = {}
    for unit_id, count in army.items():
        if count <= 0:
            continue
        lost = int(count * loss_ratio)
        losses[unit_id] = lost
        if lost > 0:
            stock[unit_id].count -= lost

    # Update camp state.
    player.total_battles += 1
    if outcome == "victory":
        camp.pv_current = 0
        camp.respawn_at = now + timedelta(minutes=10)
        player.gold += loot["gold"]
        player.wood += loot["wood"]
        player.mana += loot["mana"]
        player.total_victories += 1
        player.pve_victories += 1
    else:
        camp.pv_current = pv_after

    # Persist a combat log.
    log = CombatLog(
        player_id=player.id,
        camp_id=camp.id,
        camp_name=camp.name,
        outcome=outcome,
        attacker_damage=total_damage,
        camp_pv_before=pv_before,
        camp_pv_after=pv_after,
        loot_gold=loot["gold"],
        loot_wood=loot["wood"],
        loot_mana=loot["mana"],
        units_sent_json=json.dumps({str(k): v for k, v in army.items() if v > 0}),
        units_lost_json=json.dumps({str(k): v for k, v in losses.items() if v > 0}),
    )
    db_session.add(log)
    db_session.flush()

    return {
        "log_id": log.id,
        "outcome": outcome,
        "total_damage": total_damage,
        "effective_damage": effective_damage,
        "total_defense": total_defense,
        "pv_before": pv_before,
        "pv_after": pv_after,
        "loot": loot,
        "losses": losses,
        "loss_ratio": loss_ratio,
        "relic_dropped": relic_dropped,
        "item_dropped": item_dropped,
        "draco_damage": draco_dmg,
        "ai_pattern": pattern,
        "ai_pattern_log": pattern_log,
        "archetype": camp.archetype,
    }


# ----- PvP combat -------------------------------------------------------------


def resolve_pvp_combat(
    db_session: "Session",
    attacker: "Player",
    defender: "Player",
    army: dict[int, int],
) -> dict:
    """Attack another player with the given army.

    Simplified PvP rules:
    - attacker damage = Σ(unit.damage × relic_mult × count) + draco_dmg
    - defender effective defense = Σ(defender_unit.defense × defender_count) + draco_def
    - If attacker_damage > defender_defense:
        * Attacker wins
        * Steal 10% of defender's gold+wood+mana
        * Attacker losses = proportional (ratio * 0.25)
        * Defender loses some defending units (ratio * 0.3)
    - Else:
        * Attack repelled
        * No loot, attacker loses up to 70% of sent army
        * Defender loses minor units (up to 10%)
    """
    from models import CombatLog  # local

    if attacker.id == defender.id:
        raise ValueError("Vous ne pouvez pas attaquer votre propre royaume.")

    # Diplomatic gate: cannot attack allies (same alliance or ally relation).
    status, loot_mult = pvp_diplomacy_adjustment(db_session, attacker, defender)
    if status == "allied":
        raise ValueError(
            "Vous ne pouvez pas attaquer un allié. Rompez d'abord la diplomatie."
        )

    att_relics = player_relic_ids(attacker)
    def_relics = player_relic_ids(defender)

    # Attacker army
    att_stock = {pu.unit_id: pu for pu in attacker.units}
    att_damage = 0
    att_defense = 0
    total_sent = 0
    for unit_id, count in army.items():
        if count <= 0:
            continue
        pu = att_stock.get(unit_id)
        if pu is None or pu.count < count:
            raise ValueError(
                f"Vous n'avez pas {count} unités du type {unit_id}."
            )
        total_sent += count
        att_damage += unit_total_damage(unit_id, count, att_relics)
        att_defense += unit_total_defense(unit_id, count)

    att_draco_dmg, att_draco_def = draco_contribution(attacker)
    att_damage += att_draco_dmg
    att_defense += att_draco_def

    if total_sent == 0 and att_draco_dmg == 0:
        raise ValueError("Vous devez envoyer au moins une unité.")

    # Defender's full army (they defend with everything)
    def_stock = {pu.unit_id: pu for pu in defender.units}
    def_damage = 0
    def_defense = 0
    for unit_id, pu in def_stock.items():
        if pu.count <= 0:
            continue
        def_damage += unit_total_damage(unit_id, pu.count, def_relics)
        def_defense += unit_total_defense(unit_id, pu.count)

    def_draco_dmg, def_draco_def = draco_contribution(defender)
    def_damage += def_draco_dmg
    def_defense += def_draco_def

    # Compare
    loot = {"gold": 0, "wood": 0, "mana": 0}
    att_loss_ratio = 0.0
    def_loss_ratio = 0.0

    if att_damage > def_defense:
        outcome = "victory"
        # Steal 10% of each resource, scaled by diplomatic multiplier
        # (enemies yield +20%, neutral stays at base rate).
        base_rate = 0.10 * loot_mult
        loot = {
            "gold": int(defender.gold * base_rate),
            "wood": int(defender.wood * base_rate),
            "mana": int(defender.mana * base_rate),
        }
        att_loss_ratio = min(0.40, def_defense / max(att_damage, 1) * 0.25)
        def_loss_ratio = min(0.50, att_damage / max(def_defense, 1) * 0.30 - 0.30)
        def_loss_ratio = max(0.05, def_loss_ratio)
    else:
        outcome = "repelled"
        att_loss_ratio = min(0.70, def_defense / max(att_damage, 1) * 0.50)
        def_loss_ratio = min(0.10, att_damage / max(def_defense, 1) * 0.10)

    # Apply losses to attacker
    att_losses: dict[int, int] = {}
    for unit_id, count in army.items():
        if count <= 0:
            continue
        lost = int(count * att_loss_ratio)
        att_losses[unit_id] = lost
        if lost > 0:
            att_stock[unit_id].count -= lost

    # Apply losses to defender (proportional across all unit types)
    def_losses: dict[int, int] = {}
    for unit_id, pu in def_stock.items():
        if pu.count <= 0:
            continue
        lost = int(pu.count * def_loss_ratio)
        def_losses[unit_id] = lost
        if lost > 0:
            pu.count -= lost

    # Apply loot
    if outcome == "victory":
        defender.gold -= loot["gold"]
        defender.wood -= loot["wood"]
        defender.mana -= loot["mana"]
        attacker.gold += loot["gold"]
        attacker.wood += loot["wood"]
        attacker.mana += loot["mana"]

    # Lifetime counters (PvP counts as a battle for both sides).
    attacker.total_battles += 1
    defender.total_battles += 1
    if outcome == "victory":
        attacker.total_victories += 1

    # Persist a combat log on the attacker's side. We reuse CombatLog with
    # camp_id=0 and camp_name pointing to the defender for now.
    log = CombatLog(
        player_id=attacker.id,
        camp_id=0,
        camp_name=f"PvP vs {defender.user.username}",
        outcome=outcome,
        attacker_damage=att_damage,
        camp_pv_before=def_defense,
        camp_pv_after=def_defense,  # defender's defense isn't "consumed"
        loot_gold=loot["gold"],
        loot_wood=loot["wood"],
        loot_mana=loot["mana"],
        units_sent_json=json.dumps({str(k): v for k, v in army.items() if v > 0}),
        units_lost_json=json.dumps({str(k): v for k, v in att_losses.items() if v > 0}),
    )
    db_session.add(log)
    db_session.flush()

    return {
        "log_id": log.id,
        "outcome": outcome,
        "attacker_damage": att_damage,
        "defender_defense": def_defense,
        "loot": loot,
        "attacker_losses": att_losses,
        "defender_losses": def_losses,
        "diplomatic_status": status,
        "loot_multiplier": loot_mult,
    }


# ----- Kobold camp seeding ----------------------------------------------------


# Biome metadata used by the campaign grid. Keys match KoboldCamp.biome.
BIOMES: dict[str, dict] = {
    "marecage":   {"label": "MARÉCAGE",      "image": "camps/camp_fantome.jpg",    "difficulty": 1.0},
    "foret":      {"label": "FORÊT DENSE",   "image": "camps/camp_foret.jpg",      "difficulty": 1.1},
    "brouillard": {"label": "BROUILLARD",    "image": "camps/camp_brouillard.jpg", "difficulty": 1.3},
    "montagnes":  {"label": "MONTAGNES",     "image": "camps/camp_montagne.jpg",   "difficulty": 1.6},
    "fortifie":   {"label": "CAMP FORTIFIÉ", "image": "camps/camp_fortifie.jpg",   "difficulty": 2.0},
}

_BIOME_KEYS = list(BIOMES.keys())

# ----- Phase 11 (enemies AI) -------------------------------------------------

# Each archetype has visual flavor + a HP / loot multiplier on top of the
# base biome difficulty.
ENEMY_ARCHETYPES: dict[str, dict] = {
    "kobold": {
        "label_fr": "Kobolds",
        "hp_mult": 1.0,
        "loot_mult": 1.0,
        "default_pattern": "passive",
        "tier_min": 1, "tier_max": 3,
    },
    "ambusher": {
        "label_fr": "Embusqueurs",
        "hp_mult": 0.85,
        "loot_mult": 1.15,
        "default_pattern": "evasive",
        "tier_min": 2, "tier_max": 4,
    },
    "troll": {
        "label_fr": "Trolls",
        "hp_mult": 1.6,
        "loot_mult": 1.3,
        "default_pattern": "armored",
        "tier_min": 2, "tier_max": 4,
    },
    "wraith": {
        "label_fr": "Spectres",
        "hp_mult": 0.75,
        "loot_mult": 1.25,
        "default_pattern": "aggressive",
        "tier_min": 3, "tier_max": 5,
    },
    "boss": {
        "label_fr": "Champion",
        "hp_mult": 3.0,
        "loot_mult": 2.5,
        "default_pattern": "regenerator",
        "tier_min": 4, "tier_max": 5,
    },
}

# AI pattern numeric tuning, used by resolve_combat.
AI_PATTERN_TUNING: dict[str, dict] = {
    "passive":     {},
    "aggressive":  {"counter_ratio": 0.20},  # 20% of player damage hits back
    "armored":     {"damage_ignored": 0.30},  # 30% of incoming damage absorbed
    "evasive":     {"dodge_chance": 0.20},    # 20% chance to dodge entirely
    "regenerator": {"regen_ratio": 0.15},     # heals 15% of pv_max per attack survived
}

# Thematic descriptions per biome (rotated randomly when seeding).
_BIOME_NAMES: dict[str, list[str]] = {
    "marecage": [
        "Avant-poste vaseux", "Tanière des noyés", "Bourbier des Kobolds",
        "Mouillère maudite", "Enclave des sangsues",
    ],
    "foret": [
        "Camp de la Canopée", "Clairière embusquée", "Fourré sombre",
        "Repaire sylvestre", "Hameau des racines",
    ],
    "brouillard": [
        "Campement fantôme", "Brume des égarés", "Poste embrumé",
        "Camp nébuleux", "Bivouac des murmures",
    ],
    "montagnes": [
        "Nid d'aigle kobold", "Éperon rocheux", "Grotte d'altitude",
        "Col des vents", "Sommet désolé",
    ],
    "fortifie": [
        "Bastion kobold", "Redoute de pierre", "Donjon abandonné",
        "Citadelle souterraine", "Forteresse oubliée",
    ],
}


def _archetype_for_tier(rng: "random.Random", tier_idx: int, count_per_biome: int) -> str:
    """Pick a thematic archetype for a camp at the given tier index.

    Lower tiers are mostly kobolds, higher tiers introduce trolls,
    ambushers, wraiths, and bosses. Tier indexing is 0..count_per_biome-1.
    """
    # Map raw tier index to a 1..5 difficulty tier band.
    tier = 1 + min(4, tier_idx * 5 // max(1, count_per_biome))
    candidates = [
        name for name, meta in ENEMY_ARCHETYPES.items()
        if meta["tier_min"] <= tier <= meta["tier_max"]
    ]
    if not candidates:
        return "kobold"
    return rng.choice(candidates)


def seed_kobold_camps(db_session: "Session") -> int:
    """Generate a grid of ~60 procedural camps across all biomes.

    Only runs if no camps exist yet. Defense values form a geometric
    progression so early camps are beatable by a starter army and late ones
    require real investment. Each camp gets an archetype + AI pattern.
    """
    from models import KoboldCamp

    existing = db_session.query(KoboldCamp).count()
    if existing > 0:
        return 0

    import random
    rng = random.Random(42)  # deterministic seeding

    count_per_biome = 12
    camps_to_create = []
    for biome_key in _BIOME_KEYS:
        meta = BIOMES[biome_key]
        names_pool = _BIOME_NAMES[biome_key]
        for tier in range(count_per_biome):
            # Pick an archetype appropriate for the tier band.
            archetype = _archetype_for_tier(rng, tier, count_per_biome)
            arch_meta = ENEMY_ARCHETYPES[archetype]
            ai_pattern = arch_meta["default_pattern"]
            difficulty_tier = 1 + min(4, tier * 5 // max(1, count_per_biome))

            # Geometric progression: tier 0 ~300 PV, tier 11 ~50k PV,
            # then archetype HP multiplier on top.
            base_pv = int(300 * (1.6 ** tier) * meta["difficulty"] * arch_meta["hp_mult"])
            pv_max = base_pv + rng.randint(-base_pv // 10, base_pv // 10)

            loot_mult = arch_meta["loot_mult"]
            loot_gold = int(pv_max * 0.45 * loot_mult)
            loot_wood = int(pv_max * 0.20 * loot_mult)
            loot_mana = int(pv_max * 0.10 * loot_mult)

            archetype_label = arch_meta["label_fr"]
            biome_label = meta["label"].lower()
            description = f"Un camp {biome_label} occupé par des {archetype_label.lower()}."

            camps_to_create.append({
                "name": rng.choice(names_pool),
                "description": description,
                "biome": biome_key,
                "pv_max": pv_max,
                "loot_gold": loot_gold,
                "loot_wood": loot_wood,
                "loot_mana": loot_mana,
                "archetype": archetype,
                "ai_pattern": ai_pattern,
                "difficulty_tier": difficulty_tier,
            })

    # Shuffle so biomes are mixed in the grid (like the original game).
    rng.shuffle(camps_to_create)

    for data in camps_to_create:
        camp = KoboldCamp(
            name=data["name"],
            description=data["description"],
            biome=data["biome"],
            pv_max=data["pv_max"],
            pv_current=data["pv_max"],
            loot_gold=data["loot_gold"],
            loot_wood=data["loot_wood"],
            loot_mana=data["loot_mana"],
            archetype=data["archetype"],
            ai_pattern=data["ai_pattern"],
            difficulty_tier=data["difficulty_tier"],
        )
        db_session.add(camp)
    db_session.commit()
    return len(camps_to_create)


def refresh_camps(db_session: "Session") -> int:
    """Respawn camps whose cooldown has elapsed. Returns count refreshed."""
    from models import KoboldCamp

    now = datetime.utcnow()
    refreshed = 0
    camps = db_session.query(KoboldCamp).filter(KoboldCamp.respawn_at <= now).all()
    for camp in camps:
        camp.pv_current = camp.pv_max
        camp.respawn_at = None
        refreshed += 1
    return refreshed


# ----- Alliances --------------------------------------------------------------


def player_alliance(
    db_session: "Session", player: "Player"
) -> tuple["Alliance | None", "AllianceMember | None"]:
    """Return (alliance, member_row) for the player, or (None, None)."""
    from models import Alliance, AllianceMember

    mem = (
        db_session.query(AllianceMember)
        .filter(AllianceMember.player_id == player.id)
        .one_or_none()
    )
    if mem is None:
        return None, None
    alliance = db_session.get(Alliance, mem.alliance_id)
    return alliance, mem


def _validate_alliance_name(name: str) -> str | None:
    if not name:
        return "Le nom de l'alliance est requis."
    if len(name) < 3:
        return "Le nom doit faire au moins 3 caractères."
    if len(name) > 48:
        return "Le nom ne peut pas dépasser 48 caractères."
    return None


def _validate_alliance_tag(tag: str) -> str | None:
    if not tag:
        return "Le tag est requis."
    if len(tag) < 2 or len(tag) > 5:
        return "Le tag doit faire entre 2 et 5 caractères."
    if not all(c.isalnum() for c in tag):
        return "Le tag ne peut contenir que des lettres et chiffres."
    return None


def create_alliance(
    db_session: "Session",
    founder_user: "User",
    founder_player: "Player",
    name: str,
    tag: str,
    description: str,
) -> "Alliance":
    from models import Alliance, AllianceMember

    # Already in an alliance?
    existing_alliance, _ = player_alliance(db_session, founder_player)
    if existing_alliance is not None:
        raise ValueError("Vous êtes déjà membre d'une alliance.")

    name = name.strip()
    tag = tag.strip().upper()
    description = (description or "").strip()[:1000]

    err = _validate_alliance_name(name) or _validate_alliance_tag(tag)
    if err:
        raise ValueError(err)

    if founder_player.gold < ALLIANCE_CREATION_COST_GOLD:
        raise ValueError(
            f"Il faut {ALLIANCE_CREATION_COST_GOLD} or pour fonder une alliance."
        )

    # Uniqueness checks.
    if db_session.query(Alliance).filter(Alliance.name == name).one_or_none():
        raise ValueError("Ce nom d'alliance est déjà pris.")
    if db_session.query(Alliance).filter(Alliance.tag == tag).one_or_none():
        raise ValueError("Ce tag d'alliance est déjà pris.")

    founder_player.gold -= ALLIANCE_CREATION_COST_GOLD
    alliance = Alliance(
        name=name,
        tag=tag,
        description=description,
        founder_id=founder_user.id,
    )
    db_session.add(alliance)
    db_session.flush()

    member = AllianceMember(
        alliance_id=alliance.id,
        player_id=founder_player.id,
        role="founder",
    )
    db_session.add(member)
    return alliance


def invite_to_alliance(
    db_session: "Session",
    alliance: "Alliance",
    sender_user: "User",
    sender_player: "Player",
    target_username: str,
) -> "AllianceInvitation":
    from models import AllianceInvitation, AllianceMember, Player, User

    target_username = target_username.strip()
    if not target_username:
        raise ValueError("Indiquez le pseudo du Seigneur à inviter.")

    target_user = (
        db_session.query(User).filter(User.username == target_username).one_or_none()
    )
    if target_user is None:
        raise ValueError("Ce Seigneur n'existe pas.")
    if target_user.id == sender_user.id:
        raise ValueError("Vous ne pouvez pas vous inviter vous-même.")

    target_player = (
        db_session.query(Player).filter(Player.user_id == target_user.id).one_or_none()
    )
    if target_player is None:
        raise ValueError("Ce Seigneur n'a pas de royaume actif.")

    # Sender must be in the alliance.
    sender_member = next(
        (m for m in alliance.members if m.player_id == sender_player.id),
        None,
    )
    if sender_member is None:
        raise ValueError("Vous n'êtes pas membre de cette alliance.")

    # Check target isn't already in an alliance.
    existing = (
        db_session.query(AllianceMember)
        .filter(AllianceMember.player_id == target_player.id)
        .one_or_none()
    )
    if existing is not None:
        raise ValueError("Ce Seigneur est déjà membre d'une alliance.")

    # Check no duplicate pending invitation.
    pending = (
        db_session.query(AllianceInvitation)
        .filter(
            AllianceInvitation.alliance_id == alliance.id,
            AllianceInvitation.player_id == target_player.id,
        )
        .one_or_none()
    )
    if pending is not None:
        raise ValueError("Une invitation est déjà en attente pour ce Seigneur.")

    # Alliance max size.
    if len(alliance.members) >= ALLIANCE_MAX_MEMBERS:
        raise ValueError(
            f"Votre alliance a atteint la taille maximale ({ALLIANCE_MAX_MEMBERS})."
        )

    # Cost on the sender.
    if sender_player.gold < ALLIANCE_INVITATION_COST_GOLD:
        raise ValueError(
            f"Il faut {ALLIANCE_INVITATION_COST_GOLD} or pour envoyer une invitation."
        )
    sender_player.gold -= ALLIANCE_INVITATION_COST_GOLD

    inv = AllianceInvitation(
        alliance_id=alliance.id,
        player_id=target_player.id,
        sender_id=sender_user.id,
    )
    db_session.add(inv)
    return inv


def accept_alliance_invitation(
    db_session: "Session",
    invitation: "AllianceInvitation",
    player: "Player",
) -> "AllianceMember":
    from models import AllianceMember

    if invitation.player_id != player.id:
        raise ValueError("Cette invitation ne vous concerne pas.")

    existing_alliance, _ = player_alliance(db_session, player)
    if existing_alliance is not None:
        raise ValueError("Vous êtes déjà membre d'une alliance.")

    # Alliance still has room?
    alliance_members = (
        db_session.query(AllianceMember)
        .filter(AllianceMember.alliance_id == invitation.alliance_id)
        .count()
    )
    if alliance_members >= ALLIANCE_MAX_MEMBERS:
        raise ValueError("L'alliance a atteint sa taille maximale.")

    member = AllianceMember(
        alliance_id=invitation.alliance_id,
        player_id=player.id,
        role="member",
    )
    db_session.add(member)
    db_session.delete(invitation)
    return member


def decline_alliance_invitation(
    db_session: "Session",
    invitation: "AllianceInvitation",
    player: "Player",
) -> None:
    if invitation.player_id != player.id:
        raise ValueError("Cette invitation ne vous concerne pas.")
    db_session.delete(invitation)


def leave_alliance(
    db_session: "Session",
    alliance: "Alliance",
    player: "Player",
) -> None:
    member = next((m for m in alliance.members if m.player_id == player.id), None)
    if member is None:
        raise ValueError("Vous n'êtes pas membre de cette alliance.")
    if member.role == "founder":
        raise ValueError(
            "Le fondateur ne peut pas quitter l'alliance. Dissolvez-la à la place."
        )
    db_session.delete(member)


def disband_alliance(
    db_session: "Session",
    alliance: "Alliance",
    actor_user: "User",
) -> None:
    if alliance.founder_id != actor_user.id:
        raise ValueError("Seul le fondateur peut dissoudre l'alliance.")
    db_session.delete(alliance)  # cascade deletes members, invitations, messages


def post_alliance_message(
    db_session: "Session",
    alliance: "Alliance",
    sender_user: "User",
    sender_player: "Player",
    content: str,
) -> "AllianceMessage":
    from models import AllianceMessage

    member = next((m for m in alliance.members if m.player_id == sender_player.id), None)
    if member is None:
        raise ValueError("Vous n'êtes pas membre de cette alliance.")

    content = (content or "").strip()
    if not content:
        raise ValueError("Le message ne peut pas être vide.")
    if len(content) > ALLIANCE_CHAT_MESSAGE_MAX_LEN:
        raise ValueError(
            f"Le message ne peut pas dépasser {ALLIANCE_CHAT_MESSAGE_MAX_LEN} caractères."
        )

    msg = AllianceMessage(
        alliance_id=alliance.id,
        sender_id=sender_user.id,
        sender_name=sender_user.username,
        content=content,
    )
    db_session.add(msg)
    return msg


def pending_invitations_for(
    db_session: "Session", player: "Player"
) -> list["AllianceInvitation"]:
    from models import AllianceInvitation

    return (
        db_session.query(AllianceInvitation)
        .filter(AllianceInvitation.player_id == player.id)
        .order_by(AllianceInvitation.created_at.desc())
        .all()
    )


# ----- Private messages -------------------------------------------------------


def send_private_message(
    db_session: "Session",
    sender: "User",
    recipient_name: str,
    subject: str,
    content: str,
) -> "PrivateMessage":
    from models import PrivateMessage, User

    recipient_name = recipient_name.strip()
    subject = (subject or "").strip()[:PRIVATE_MESSAGE_SUBJECT_MAX_LEN]
    content = (content or "").strip()

    if not recipient_name:
        raise ValueError("Indiquez le destinataire.")
    if not content:
        raise ValueError("Le message ne peut pas être vide.")
    if len(content) > PRIVATE_MESSAGE_MAX_LEN:
        raise ValueError(
            f"Le message ne peut pas dépasser {PRIVATE_MESSAGE_MAX_LEN} caractères."
        )

    recipient = (
        db_session.query(User).filter(User.username == recipient_name).one_or_none()
    )
    if recipient is None:
        raise ValueError(f"Le Seigneur « {recipient_name} » n'existe pas.")
    if recipient.id == sender.id:
        raise ValueError("Vous ne pouvez pas vous écrire à vous-même.")

    msg = PrivateMessage(
        sender_id=sender.id,
        sender_name=sender.username,
        recipient_id=recipient.id,
        recipient_name=recipient.username,
        subject=subject,
        content=content,
    )
    db_session.add(msg)
    return msg


def count_unread_messages(db_session: "Session", user: "User") -> int:
    from models import PrivateMessage

    return (
        db_session.query(PrivateMessage)
        .filter(
            PrivateMessage.recipient_id == user.id,
            PrivateMessage.is_read == False,  # noqa: E712
            PrivateMessage.archived_by_recipient == False,  # noqa: E712
        )
        .count()
    )


def inbox_messages(db_session: "Session", user: "User") -> list["PrivateMessage"]:
    from models import PrivateMessage

    return (
        db_session.query(PrivateMessage)
        .filter(
            PrivateMessage.recipient_id == user.id,
            PrivateMessage.archived_by_recipient == False,  # noqa: E712
        )
        .order_by(PrivateMessage.created_at.desc())
        .limit(100)
        .all()
    )


def outbox_messages(db_session: "Session", user: "User") -> list["PrivateMessage"]:
    from models import PrivateMessage

    return (
        db_session.query(PrivateMessage)
        .filter(
            PrivateMessage.sender_id == user.id,
            PrivateMessage.archived_by_sender == False,  # noqa: E712
        )
        .order_by(PrivateMessage.created_at.desc())
        .limit(100)
        .all()
    )


def mark_message_read(
    db_session: "Session", message: "PrivateMessage", user: "User"
) -> None:
    if message.recipient_id != user.id:
        return
    message.is_read = True


# ----- Diplomacy --------------------------------------------------------------


def _normalize_pair(a_id: int, b_id: int) -> tuple[int, int]:
    if a_id == b_id:
        raise ValueError("Une alliance ne peut pas avoir de relation avec elle-même.")
    if a_id < b_id:
        return a_id, b_id
    return b_id, a_id


def get_diplomacy(
    db_session: "Session", alliance_a_id: int, alliance_b_id: int
) -> str:
    """Return the relation string between two alliances. Defaults to neutral."""
    from models import AllianceDiplomacy

    low, high = _normalize_pair(alliance_a_id, alliance_b_id)
    row = (
        db_session.query(AllianceDiplomacy)
        .filter(
            AllianceDiplomacy.alliance_low_id == low,
            AllianceDiplomacy.alliance_high_id == high,
        )
        .one_or_none()
    )
    return row.relation if row else RELATION_NEUTRAL


def set_diplomacy(
    db_session: "Session",
    alliance: "Alliance",
    target_alliance: "Alliance",
    actor_user: "User",
    relation: str,
) -> "AllianceDiplomacy":
    """Set the relation between two alliances.

    Only the founder of `alliance` can change relations. This is a simple
    unilateral model (no acceptance workflow) — good enough for Phase 8.
    """
    from models import AllianceDiplomacy

    if relation not in VALID_RELATIONS:
        raise ValueError("Relation invalide.")
    if alliance.founder_id != actor_user.id:
        raise ValueError("Seul le fondateur peut gérer la diplomatie.")
    if alliance.id == target_alliance.id:
        raise ValueError("Choisissez une autre alliance.")

    low, high = _normalize_pair(alliance.id, target_alliance.id)
    row = (
        db_session.query(AllianceDiplomacy)
        .filter(
            AllianceDiplomacy.alliance_low_id == low,
            AllianceDiplomacy.alliance_high_id == high,
        )
        .one_or_none()
    )
    now = datetime.utcnow()
    if row is None:
        row = AllianceDiplomacy(
            alliance_low_id=low,
            alliance_high_id=high,
            relation=relation,
            updated_by_user_id=actor_user.id,
            updated_at=now,
        )
        db_session.add(row)
    else:
        row.relation = relation
        row.updated_by_user_id = actor_user.id
        row.updated_at = now
    return row


def player_alliance_id(db_session: "Session", player: "Player") -> int | None:
    from models import AllianceMember

    mem = (
        db_session.query(AllianceMember)
        .filter(AllianceMember.player_id == player.id)
        .one_or_none()
    )
    return mem.alliance_id if mem else None


# ----- Leaderboards -----------------------------------------------------------


def top_players(db_session: "Session", limit: int = 20) -> list[tuple["User", "Player"]]:
    from models import Player, User

    return (
        db_session.query(User, Player)
        .join(Player, Player.user_id == User.id)
        .order_by(Player.level.desc(), Player.gold.desc(), Player.xp.desc())
        .limit(limit)
        .all()
    )


def top_alliances(db_session: "Session", limit: int = 20) -> list[tuple["Alliance", int]]:
    from models import Alliance, AllianceMember
    from sqlalchemy import func

    rows = (
        db_session.query(Alliance, func.count(AllianceMember.id).label("member_count"))
        .outerjoin(AllianceMember, AllianceMember.alliance_id == Alliance.id)
        .group_by(Alliance.id)
        .order_by(func.count(AllianceMember.id).desc(), Alliance.created_at)
        .limit(limit)
        .all()
    )
    return [(a, int(c)) for a, c in rows]


# ----- Achievements (prouesses) -----------------------------------------------
#
# Trigger detection is implemented inline for each achievement that the MVP
# supports. Each condition is evaluated when the relevant event happens
# (register, build, train, combat, alliance join...). Unsupported achievements
# (eclipse, aura, portail) are left for later phases.


# Mapping of supported achievement ids to a human-friendly hook name.
ACHIEVEMENT_REGISTER = 0         # Create avatar
ACHIEVEMENT_FIRST_3_BUILDINGS = 1  # Build mine + sawmill + fountain
ACHIEVEMENT_TRAIN_5 = 2          # Train 5 combat units
ACHIEVEMENT_FIRST_WIN = 3        # First battle victory
ACHIEVEMENT_FIRST_CAMPAIGN = 4   # First Kobold campaign win
ACHIEVEMENT_FIRST_TURRET = 5     # First turret built
ACHIEVEMENT_BATTLE_STREAK = 6    # 3 victories + 5 campaigns
ACHIEVEMENT_JOIN_ALLIANCE = 7    # Belong to an alliance
ACHIEVEMENT_CUMULATE_50K = 8     # Accumulate 50k resources
ACHIEVEMENT_HAS_RELIC = 15       # Own 1 relic

# Derived constants for counters.
ACHIEVEMENT_TRAIN_1500 = 13
ACHIEVEMENT_BATTLE_2000 = 14


def _already_earned(player: "Player", achievement_id: int) -> bool:
    return any(pa.achievement_id == achievement_id for pa in player.achievements)


def _award(
    db_session: "Session", player: "Player", achievement_id: int
) -> "PlayerAchievement | None":
    """Award the achievement if not already earned. Grants XP reward."""
    from game_data import game_data
    from models import PlayerAchievement

    if _already_earned(player, achievement_id):
        return None

    meta = next(
        (a for a in game_data.achievements["achievements"] if a["id"] == achievement_id),
        None,
    )
    if meta is None:
        return None

    pa = PlayerAchievement(player_id=player.id, achievement_id=achievement_id)
    db_session.add(pa)
    # Keep the in-memory relationship in sync so subsequent checks in the
    # same tick don't double-award.
    player.achievements.append(pa)
    player.xp += int(meta.get("reward_xp", 0) or 0)
    return pa


def check_achievements(
    db_session: "Session", player: "Player", user: "User | None" = None
) -> list[int]:
    """Evaluate all achievement conditions and award any that just unlocked.

    Returns the list of achievement ids awarded during this call.
    """
    awarded: list[int] = []

    # #0 Create avatar — trivially true for any logged-in player.
    if _award(db_session, player, ACHIEVEMENT_REGISTER) is not None:
        awarded.append(ACHIEVEMENT_REGISTER)

    # #1 Build mine + sawmill + fountain.
    have_building_ids = {pb.building_id for pb in player.buildings if pb.level > 0}
    if {MINE_GOLD, SAWMILL, FOUNTAIN_MANA}.issubset(have_building_ids):
        if _award(db_session, player, ACHIEVEMENT_FIRST_3_BUILDINGS) is not None:
            awarded.append(ACHIEVEMENT_FIRST_3_BUILDINGS)

    # #2 Train 5 units total.
    total_owned_units = sum(pu.count for pu in player.units)
    if player.total_units_trained >= 5 or total_owned_units >= 5:
        if _award(db_session, player, ACHIEVEMENT_TRAIN_5) is not None:
            awarded.append(ACHIEVEMENT_TRAIN_5)

    # #3 / #4 first victory (PvE or PvP).
    if player.total_victories >= 1:
        if _award(db_session, player, ACHIEVEMENT_FIRST_WIN) is not None:
            awarded.append(ACHIEVEMENT_FIRST_WIN)
    if player.pve_victories >= 1:
        if _award(db_session, player, ACHIEVEMENT_FIRST_CAMPAIGN) is not None:
            awarded.append(ACHIEVEMENT_FIRST_CAMPAIGN)

    # #6 battle streak (3 wins + 5 campaigns).
    if player.total_victories >= 3 and player.pve_victories >= 5:
        if _award(db_session, player, ACHIEVEMENT_BATTLE_STREAK) is not None:
            awarded.append(ACHIEVEMENT_BATTLE_STREAK)

    # #7 Belong to an alliance.
    alliance, _ = player_alliance(db_session, player)
    if alliance is not None:
        if _award(db_session, player, ACHIEVEMENT_JOIN_ALLIANCE) is not None:
            awarded.append(ACHIEVEMENT_JOIN_ALLIANCE)

    # #8 Cumulate 50k resources (sum of gold + wood + mana).
    if (player.gold + player.wood + player.mana) >= 50000:
        if _award(db_session, player, ACHIEVEMENT_CUMULATE_50K) is not None:
            awarded.append(ACHIEVEMENT_CUMULATE_50K)

    # #13 Train 1500 combat units.
    if player.total_units_trained >= 1500:
        if _award(db_session, player, ACHIEVEMENT_TRAIN_1500) is not None:
            awarded.append(ACHIEVEMENT_TRAIN_1500)

    # #14 Participate in 2000 battles.
    if player.total_battles >= 2000:
        if _award(db_session, player, ACHIEVEMENT_BATTLE_2000) is not None:
            awarded.append(ACHIEVEMENT_BATTLE_2000)

    # #15 Own at least 1 relic.
    if len(player.relics) > 0:
        if _award(db_session, player, ACHIEVEMENT_HAS_RELIC) is not None:
            awarded.append(ACHIEVEMENT_HAS_RELIC)

    return awarded


# ----- Seasons ----------------------------------------------------------------


def get_or_create_game_state(db_session: "Session") -> "GameState":
    from models import GameState

    state = db_session.get(GameState, 1)
    if state is None:
        state = GameState(id=1)
        db_session.add(state)
        db_session.flush()
    return state


def season_day(state: "GameState") -> int:
    """Return the day number of the current season (1-indexed)."""
    delta = datetime.utcnow() - state.season_started_at
    return int(delta.total_seconds() // 86400) + 1


# ----- Diplomacy effects on PvP -----------------------------------------------


def pvp_diplomacy_adjustment(
    db_session: "Session",
    attacker_player: "Player",
    defender_player: "Player",
) -> tuple[str, float]:
    """Return (status, loot_multiplier).

    status is one of:
      - 'allied'  — PvP is forbidden
      - 'enemy'   — +20% loot
      - 'neutral' — unchanged
    """
    att_alliance_id = player_alliance_id(db_session, attacker_player)
    def_alliance_id = player_alliance_id(db_session, defender_player)
    if att_alliance_id is None or def_alliance_id is None:
        return "neutral", 1.0
    if att_alliance_id == def_alliance_id:
        # Same alliance : treated as ally by default.
        return "allied", 1.0
    relation = get_diplomacy(db_session, att_alliance_id, def_alliance_id)
    if relation == RELATION_ALLY:
        return "allied", 1.0
    if relation == RELATION_ENEMY:
        return "enemy", 1.2
    return "neutral", 1.0


# ----- Bundle B: Items, Buffs, Training, Spy, Market ----------------------


# Map usable item id → (effect_kind, multiplier, duration_seconds, label).
# Only items with gameplay effects that matter in our rebuild are listed;
# the others exist in items.json but do nothing for now.
_ITEM_EFFECTS: dict[int, tuple[str, float, int, str]] = {
    2:  ("camp_gold",      1.5, 7200,  "Marteau Kobold : +50% or en campagne pendant 2h"),
    9:  ("camp_gold",      1.3, 7200,  "Ceinturon Kobold : +30% or en campagne"),
    14: ("camp_wood",      2.0, 3600,  "Poignard Sylvestre : x2 bois en campagne"),
    19: ("camp_gold",      2.0, 180,   "Clef Kobold : x2 or en campagne pendant 3 min"),
    25: ("attack_power",   1.25, 1200, "Elixir des Berserkir : +25% force d'attaque"),
    26: ("turret_protect", 1.0,  3600, "Tour dorée : tourelles protégées"),
    28: ("fret_capacity",  2.0,  600,  "Pierre d'âme : x2 butin volé"),
    29: ("camp_gold",      2.0,  600,  "Obsidienne : x2 or par nécromancien"),
    30: ("camp_gold",      2.0,  600,  "Sanglier sacré : x2 drops"),
    31: ("train_speed",    0.5,  600,  "Elixir ardent : formation 2x plus rapide"),
    32: ("camp_mana",      2.0,  900,  "Baguette de sourcier : x2 mana en campagne"),
    33: ("attack_power",   2.0,  600,  "Oeil d'éternité : x2 attaque vs Huvoko"),
    35: ("train_speed",    0.5,  600,  "Briquet sacré : formation 2x plus rapide"),
    36: ("attack_power",   1.1,  600,  "Conque : +10% puissance"),
    46: ("turret_protect", 1.0,  36000, "Drapeau blanc : protection 10h"),
}


def usable_item_ids() -> set[int]:
    return set(_ITEM_EFFECTS.keys())


def grant_item(db_session: "Session", player: "Player", item_id: int, count: int = 1) -> None:
    """Add `count` copies of an item to the player inventory."""
    from models import PlayerItem

    existing = next((pi for pi in player.items if pi.item_id == item_id), None)
    if existing is None:
        existing = PlayerItem(player_id=player.id, item_id=item_id, count=count)
        db_session.add(existing)
        player.items.append(existing)
    else:
        existing.count += count


def drop_random_item(db_session: "Session", player: "Player") -> int | None:
    """Roll for a random item drop. Returns item id if dropped, None otherwise.

    Drops one of the items that has a gameplay effect (from _ITEM_EFFECTS),
    so the drop is always meaningful.
    """
    if random.random() >= ITEM_DROP_CHANCE:
        return None
    pool = list(_ITEM_EFFECTS.keys())
    chosen = random.choice(pool)
    grant_item(db_session, player, chosen, 1)
    return chosen


def clean_expired_buffs(db_session: "Session", player: "Player") -> int:
    """Remove buffs whose expires_at has passed. Returns count removed."""
    now = datetime.utcnow()
    to_delete = [b for b in player.buffs if b.expires_at <= now]
    for b in to_delete:
        db_session.delete(b)
    for b in to_delete:
        if b in player.buffs:
            player.buffs.remove(b)
    return len(to_delete)


def active_multiplier(player: "Player", effect: str) -> float:
    """Return the product of all active buff multipliers for a given effect.

    Expired buffs are ignored (caller should clean them periodically).
    """
    now = datetime.utcnow()
    total = 1.0
    for b in player.buffs:
        if b.effect == effect and b.expires_at > now:
            total *= b.multiplier
    return total


def use_item(db_session: "Session", player: "Player", item_id: int) -> dict:
    """Consume 1 item and apply its effect as a timed buff.

    Raises ValueError if the item is missing or has no effect.
    """
    from models import ActiveBuff

    if item_id not in _ITEM_EFFECTS:
        raise ValueError("Cet objet ne peut pas être utilisé.")

    stock = next((pi for pi in player.items if pi.item_id == item_id), None)
    if stock is None or stock.count <= 0:
        raise ValueError("Vous ne possédez pas cet objet.")

    effect, mult, duration, label = _ITEM_EFFECTS[item_id]
    expires = datetime.utcnow() + timedelta(seconds=duration)
    buff = ActiveBuff(
        player_id=player.id,
        effect=effect,
        multiplier=mult,
        expires_at=expires,
        source_item_id=item_id,
    )
    db_session.add(buff)
    player.buffs.append(buff)

    stock.count -= 1
    if stock.count <= 0:
        db_session.delete(stock)
        if stock in player.items:
            player.items.remove(stock)

    return {
        "item_id": item_id,
        "effect": effect,
        "multiplier": mult,
        "expires_at": expires,
        "label": label,
    }


# ----- Timed training ---------------------------------------------------------


def start_training(
    db_session: "Session",
    player: "Player",
    unit_id: int,
    quantity: int,
) -> dict:
    """Queue a batch of units for timed formation. Only one active slot at a time.

    Respects the `train_speed` buff (multiplier < 1 makes it faster).
    """
    if quantity <= 0:
        raise ValueError("Quantité invalide.")
    if quantity > 1000:
        raise ValueError("Quantité trop élevée (max 1 000 par ordre).")

    unit = game_data.unit_by_id(unit_id)
    if unit is None:
        raise ValueError("Unité inconnue.")

    caserne_lvl = caserne_level(player)
    required = unit.get("caserne_required", 1)
    if caserne_lvl < required:
        raise ValueError(
            f"Cette unité nécessite une Caserne de niveau {required} "
            f"(actuel : {caserne_lvl})."
        )

    if player.training_unit_id != 0 and player.training_completes_at and player.training_completes_at > datetime.utcnow():
        raise ValueError("Une formation est déjà en cours. Attendez sa fin.")

    cost = unit["cost"]
    total_or = cost["or"] * quantity
    total_bois = cost["bois"] * quantity
    total_mana = cost["mana"] * quantity
    if (
        player.gold < total_or
        or player.wood < total_bois
        or player.mana < total_mana
    ):
        raise ValueError(
            f"Ressources insuffisantes. Il faut {total_or} or, "
            f"{total_bois} bois, {total_mana} mana."
        )

    player.gold -= total_or
    player.wood -= total_bois
    player.mana -= total_mana

    speed_mult = active_multiplier(player, "train_speed")
    # unit time is already divided by 4 in units.json; multiply by speed buff.
    seconds_per_unit = max(1, unit["time"] * speed_mult)
    total_seconds = int(seconds_per_unit * quantity)

    now = datetime.utcnow()
    player.training_unit_id = unit_id
    player.training_quantity = quantity
    player.training_started_at = now
    player.training_completes_at = now + timedelta(seconds=total_seconds)

    return {
        "unit_id": unit_id,
        "unit_name": unit["name_fr"],
        "quantity": quantity,
        "total_seconds": total_seconds,
        "completes_at": player.training_completes_at,
        "cost": {"or": total_or, "bois": total_bois, "mana": total_mana},
    }


def collect_training(db_session: "Session", player: "Player") -> dict | None:
    """If the active training has completed, credit the units and clear the slot."""
    from models import PlayerUnit

    if player.training_unit_id == 0:
        return None
    if player.training_completes_at is None:
        return None
    if player.training_completes_at > datetime.utcnow():
        return None

    unit_id = player.training_unit_id
    qty = player.training_quantity
    existing = next((pu for pu in player.units if pu.unit_id == unit_id), None)
    if existing is None:
        existing = PlayerUnit(player_id=player.id, unit_id=unit_id, count=qty)
        db_session.add(existing)
        player.units.append(existing)
    else:
        existing.count += qty

    player.total_units_trained += qty
    player.training_unit_id = 0
    player.training_quantity = 0
    player.training_started_at = None
    player.training_completes_at = None
    return {"unit_id": unit_id, "quantity": qty}


# ----- Espionnage -------------------------------------------------------------


def spy_on_player(
    db_session: "Session",
    spy: "Player",
    target: "Player",
) -> dict:
    """Pay mana to get a snapshot of another player's army + resources."""
    if spy.id == target.id:
        raise ValueError("Vous ne pouvez pas espionner votre propre royaume.")
    if spy.mana < SPY_MANA_COST:
        raise ValueError(f"Il faut {SPY_MANA_COST} mana pour espionner.")

    spy.mana -= SPY_MANA_COST

    # Snapshot of units
    units = []
    total_units = 0
    total_damage = 0
    total_defense = 0
    for pu in target.units:
        if pu.count <= 0:
            continue
        u = game_data.unit_by_id(pu.unit_id)
        if u is None:
            continue
        units.append({
            "id": pu.unit_id,
            "name": u["name_fr"],
            "count": pu.count,
            "damage": u["damage"],
            "defense": u["defense"],
            "image": u.get("image"),
        })
        total_units += pu.count
        total_damage += u["damage"] * pu.count
        total_defense += u["defense"] * pu.count

    # Snapshot of buildings
    buildings = []
    for pb in target.buildings:
        meta = game_data.building_by_id(pb.building_id)
        buildings.append({
            "id": pb.building_id,
            "name": meta["name_fr"] if meta else f"#{pb.building_id}",
            "level": pb.level,
        })

    return {
        "target_id": target.id,
        "resources": {
            "gold": target.gold,
            "wood": target.wood,
            "mana": target.mana,
            "spelt": target.spelt,
        },
        "units": units,
        "total_units": total_units,
        "total_damage": total_damage,
        "total_defense": total_defense,
        "buildings": buildings,
        "relics_count": len(target.relics),
    }


# ----- Marché -----------------------------------------------------------------


def market_exchange(
    player: "Player",
    source: str,
    target: str,
    amount: int,
) -> dict:
    """Exchange `amount` of `source` resource into `target` at 2:1 ratio.

    source / target in {'gold', 'wood', 'mana'}.
    """
    if source == target:
        raise ValueError("La ressource source et cible doivent être différentes.")
    if source not in {"gold", "wood", "mana"} or target not in {"gold", "wood", "mana"}:
        raise ValueError("Ressource invalide.")
    if amount <= 0:
        raise ValueError("Quantité invalide.")
    if amount > 1_000_000:
        raise ValueError("Quantité trop élevée (max 1 000 000 par transaction).")

    current_source = {"gold": player.gold, "wood": player.wood, "mana": player.mana}[source]
    if current_source < amount:
        raise ValueError("Ressources insuffisantes.")

    gained = amount // MARKET_EXCHANGE_RATIO
    if gained <= 0:
        raise ValueError(f"Quantité trop petite (minimum {MARKET_EXCHANGE_RATIO}).")

    if source == "gold":   player.gold -= amount
    elif source == "wood": player.wood -= amount
    else:                  player.mana -= amount

    if target == "gold":   player.gold += gained
    elif target == "wood": player.wood += gained
    else:                  player.mana += gained

    return {"source": source, "target": target, "spent": amount, "gained": gained}


def top_warriors(db_session: "Session", limit: int = 20) -> list[tuple["User", int, int]]:
    """Return [(user, victories, total_combats), ...] sorted by victories."""
    from models import CombatLog, Player, User
    from sqlalchemy import case, func

    victories_expr = func.sum(case((CombatLog.outcome == "victory", 1), else_=0))
    total_expr = func.count(CombatLog.id)

    rows = (
        db_session.query(
            User,
            victories_expr.label("victories"),
            total_expr.label("total"),
        )
        .join(Player, Player.user_id == User.id)
        .join(CombatLog, CombatLog.player_id == Player.id)
        .group_by(User.id)
        .order_by(victories_expr.desc(), total_expr.desc())
        .limit(limit)
        .all()
    )
    return [(u, int(v or 0), int(t or 0)) for u, v, t in rows]


# ===========================================================================
# Phase 12 — Campaign mode (PlayerQuest accept / progress / claim)
# ===========================================================================

# Map quest objective_type → (player attribute, label_fr).
# A quest's progress is tracked by snapshotting this attribute at accept
# time and comparing the current value at any later request.
QUEST_OBJECTIVE_FIELDS = {
    "train_units":   ("total_units_trained", "unités formées"),
    "win_campaigns": ("pve_victories",       "campagnes gagnées"),
    "win_pvp":       ("_pvp_victories",      "victoires PvP"),  # computed
    "earn_gold":     ("gold",                "or accumulé"),
    "earn_wood":     ("wood",                "bois accumulé"),
    "earn_mana":     ("mana",                "mana accumulé"),
    "build_level":   ("_max_building_level", "niveau de bâtiment"),
    "own_relic":     ("_relic_count",        "reliques possédées"),
}


def _quest_counter_value(player: "Player", objective_type: str) -> int:
    """Return the current value of the player counter relevant to a quest."""
    if objective_type == "win_pvp":
        return max(0, player.total_victories - player.pve_victories)
    if objective_type == "_max_building_level" or objective_type == "build_level":
        if not player.buildings:
            return 0
        return max(b.level for b in player.buildings)
    if objective_type == "_relic_count" or objective_type == "own_relic":
        return len(player.relics)
    field, _ = QUEST_OBJECTIVE_FIELDS.get(
        objective_type, (objective_type, objective_type)
    )
    return int(getattr(player, field, 0) or 0)


def _quest_meta_by_id(quest_id: str) -> dict | None:
    """Look up a generated quest by id (from data/generated/quests.json)."""
    for q in game_data.generated_quests:
        if q.get("id") == quest_id:
            return q
    return None


def list_player_quests(db_session: "Session", player: "Player") -> list[dict]:
    """Return active and recently claimed quests for the player, with progress."""
    from models import PlayerQuest

    rows = (
        db_session.query(PlayerQuest)
        .filter(PlayerQuest.player_id == player.id)
        .order_by(PlayerQuest.id.desc())
        .all()
    )
    out = []
    for pq in rows:
        meta = _quest_meta_by_id(pq.quest_id)
        current = _quest_counter_value(player, pq.objective_type)
        progress = max(0, current - pq.snapshot_value)
        progress = min(progress, pq.objective_count)
        # Auto-promote to claimable if objective met.
        if pq.status == "active" and progress >= pq.objective_count:
            pq.status = "claimable"
        pct = round(100 * progress / max(1, pq.objective_count), 1)
        out.append({
            "id": pq.id,
            "quest_id": pq.quest_id,
            "name_fr": meta.get("name_fr", pq.quest_id) if meta else pq.quest_id,
            "description_fr": meta.get("description_fr", "") if meta else "",
            "objective_type": pq.objective_type,
            "objective_count": pq.objective_count,
            "progress": progress,
            "progress_pct": pct,
            "status": pq.status,
            "reward_gold": pq.reward_gold,
            "reward_xp": pq.reward_xp,
            "claimed_at": pq.claimed_at,
        })
    return out


def accept_quest(db_session: "Session", player: "Player", quest_id: str) -> "PlayerQuest":
    """Insert a PlayerQuest row for the given quest, snapshotting counters."""
    from models import PlayerQuest

    meta = _quest_meta_by_id(quest_id)
    if meta is None:
        raise ValueError("Cette quête n'existe pas.")

    existing = (
        db_session.query(PlayerQuest)
        .filter(
            PlayerQuest.player_id == player.id,
            PlayerQuest.quest_id == quest_id,
        )
        .one_or_none()
    )
    if existing is not None:
        if existing.status == "claimed":
            raise ValueError("Cette quête a déjà été réclamée.")
        if existing.status in ("active", "claimable"):
            raise ValueError("Cette quête est déjà active.")

    objective_type = meta.get("objective_type", "train_units")
    objective_count = int(meta.get("objective_count", 1))
    snapshot = _quest_counter_value(player, objective_type)

    pq = PlayerQuest(
        player_id=player.id,
        quest_id=quest_id,
        status="active",
        snapshot_value=snapshot,
        objective_count=objective_count,
        objective_type=objective_type,
        reward_gold=int(meta.get("reward_gold", 0)),
        reward_xp=int(meta.get("reward_xp", 0)),
    )
    db_session.add(pq)
    db_session.flush()
    return pq


def claim_quest_reward(db_session: "Session", player: "Player", quest_db_id: int) -> dict:
    """Mark a claimable quest as claimed and credit gold + XP to the player."""
    from models import PlayerQuest

    pq = db_session.get(PlayerQuest, quest_db_id)
    if pq is None or pq.player_id != player.id:
        raise ValueError("Quête introuvable.")
    if pq.status == "claimed":
        raise ValueError("Cette quête a déjà été réclamée.")

    # Recompute progress to confirm it's actually claimable.
    current = _quest_counter_value(player, pq.objective_type)
    progress = max(0, current - pq.snapshot_value)
    if progress < pq.objective_count:
        raise ValueError(
            f"Objectif non atteint ({progress}/{pq.objective_count})."
        )

    pq.status = "claimed"
    pq.claimed_at = datetime.utcnow()
    player.gold += pq.reward_gold
    player.xp += pq.reward_xp
    return {
        "quest_id": pq.quest_id,
        "reward_gold": pq.reward_gold,
        "reward_xp": pq.reward_xp,
    }


def abandon_quest(db_session: "Session", player: "Player", quest_db_id: int) -> None:
    from models import PlayerQuest

    pq = db_session.get(PlayerQuest, quest_db_id)
    if pq is None or pq.player_id != player.id:
        raise ValueError("Quête introuvable.")
    if pq.status == "claimed":
        raise ValueError("Quête déjà réclamée, impossible d'abandonner.")
    pq.status = "abandoned"
