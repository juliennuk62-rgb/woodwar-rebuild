"""
Modèles ORM SQLAlchemy.

Phase 2 : User (authentification) + Player (état de jeu).
Phase 3 : PlayerBuilding (bâtiments possédés par chaque joueur).
Phase 5 : PlayerUnit (stocks d'unités), KoboldCamp (cibles PvE), CombatLog.
Phase 6 : PlayerRelic (reliques possédées), PlayerDraco (stocks de dracos).
Phase 7 : Alliance, AllianceMember, AllianceInvitation, AllianceMessage.
Phase 8 : PrivateMessage (inbox), AllianceDiplomacy (relations alliances).
Phase 9 : PlayerAchievement (prouesses), GameState (singleton, saison).
Phase 10 (Bundle B) : PlayerItem (inventaire), ActiveBuff (buffs
    temporaires), SpyReport (espionnage), Player.training_* (formation
    minutée).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(256), nullable=False)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    clan_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    player: Mapped["Player"] = relationship(back_populates="user", uselist=False)

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r}>"


class Player(Base):
    """Gameplay state for an authenticated user."""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)

    # Progression
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reputation: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Resources
    gold: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    wood: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    mana: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    spelt: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Cumulative counters used by achievements.
    total_units_trained: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_battles: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_victories: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pve_victories: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Active training slot (Bundle B — training_unit_id=0 means idle)
    training_unit_id: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    training_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    training_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    training_completes_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_tick: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[User] = relationship(back_populates="player")
    buildings: Mapped[list["PlayerBuilding"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    units: Mapped[list["PlayerUnit"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    relics: Mapped[list["PlayerRelic"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    dracos: Mapped[list["PlayerDraco"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    achievements: Mapped[list["PlayerAchievement"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    items: Mapped[list["PlayerItem"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )
    buffs: Mapped[list["ActiveBuff"]] = relationship(
        back_populates="player",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Player id={self.id} user_id={self.user_id} lvl={self.level}>"


class PlayerBuilding(Base):
    """A building owned by a player, with its current level."""

    __tablename__ = "player_buildings"
    __table_args__ = (
        UniqueConstraint("player_id", "building_id", name="uq_player_building"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)

    # Reference into rebuild/data/buildings.json
    building_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Current level. 1 = freshly built. Upgrade goes to level + 1.
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # If an upgrade is in progress, these are set.
    upgrading_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    upgrading_to: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped[Player] = relationship(back_populates="buildings")

    def __repr__(self) -> str:
        return f"<PlayerBuilding player={self.player_id} bat={self.building_id} lvl={self.level}>"


class PlayerUnit(Base):
    """Stock of a given unit type owned by a player."""

    __tablename__ = "player_units"
    __table_args__ = (
        UniqueConstraint("player_id", "unit_id", name="uq_player_unit"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)

    # Reference into rebuild/data/units.json (1..12)
    unit_id: Mapped[int] = mapped_column(Integer, nullable=False)

    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    player: Mapped[Player] = relationship(back_populates="units")

    def __repr__(self) -> str:
        return f"<PlayerUnit player={self.player_id} unit={self.unit_id} x{self.count}>"


class KoboldCamp(Base):
    """A Kobold camp that players can attack for loot."""

    __tablename__ = "kobold_camps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str] = mapped_column(String(256), default="")

    # One of: "marecage", "foret", "brouillard", "montagnes", "fortifie".
    biome: Mapped[str] = mapped_column(String(16), default="foret", nullable=False)

    # HP / defense power (single integer in the original)
    pv_max: Mapped[int] = mapped_column(Integer, nullable=False)
    pv_current: Mapped[int] = mapped_column(Integer, nullable=False)

    # Loot awarded on destruction
    loot_gold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loot_wood: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loot_mana: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # When the camp respawns after being destroyed (None = alive).
    respawn_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ----- Phase 11 (enemies AI) ------------------------------------
    # Archetype determines visual + base stats multiplier:
    #  kobold (default), troll, wraith, ambusher, boss
    archetype: Mapped[str] = mapped_column(String(16), default="kobold", nullable=False)

    # AI pattern affects damage calculation in resolve_combat:
    #  passive    — no special effect (default)
    #  aggressive — counter-attacks for X% of player damage
    #  armored    — ignores X% of incoming damage
    #  evasive    — chance to fully avoid an attack
    #  regenerator — restores Y% of pv_max per attack until killed
    ai_pattern: Mapped[str] = mapped_column(String(16), default="passive", nullable=False)

    # 1 = easy, 2 = normal, 3 = hard, 4 = nightmare, 5 = legendary
    difficulty_tier: Mapped[int] = mapped_column(Integer, default=2, nullable=False)

    def __repr__(self) -> str:
        return f"<KoboldCamp id={self.id} name={self.name!r} biome={self.biome} arch={self.archetype} pv={self.pv_current}/{self.pv_max}>"


class CombatLog(Base):
    """Persistent record of a resolved combat for the player to review."""

    __tablename__ = "combat_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    camp_id: Mapped[int] = mapped_column(Integer, nullable=False)
    camp_name: Mapped[str] = mapped_column(String(64), nullable=False)

    outcome: Mapped[str] = mapped_column(String(16), nullable=False)  # victory|defeat|weakened
    attacker_damage: Mapped[int] = mapped_column(Integer, nullable=False)
    camp_pv_before: Mapped[int] = mapped_column(Integer, nullable=False)
    camp_pv_after: Mapped[int] = mapped_column(Integer, nullable=False)

    loot_gold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loot_wood: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    loot_mana: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # JSON-encoded dicts of units sent and lost, stored as strings to keep the
    # schema simple. SQLAlchemy Text would be nicer but String is enough here.
    units_sent_json: Mapped[str] = mapped_column(String(512), default="{}")
    units_lost_json: Mapped[str] = mapped_column(String(512), default="{}")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<CombatLog id={self.id} {self.outcome} vs {self.camp_name}>"


class PlayerRelic(Base):
    """A relic owned by a player. Relics are unique (one per id per player)."""

    __tablename__ = "player_relics"
    __table_args__ = (
        UniqueConstraint("player_id", "relic_id", name="uq_player_relic"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    # Reference into rebuild/data/relics.json (1..12)
    relic_id: Mapped[int] = mapped_column(Integer, nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped[Player] = relationship(back_populates="relics")

    def __repr__(self) -> str:
        return f"<PlayerRelic player={self.player_id} relic={self.relic_id}>"


class PlayerDraco(Base):
    """Stock of a given draco type owned by a player."""

    __tablename__ = "player_dracos"
    __table_args__ = (
        UniqueConstraint("player_id", "draco_id", name="uq_player_draco"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    # Reference into rebuild/data/dracos.json (1..4)
    draco_id: Mapped[int] = mapped_column(Integer, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    player: Mapped[Player] = relationship(back_populates="dracos")

    def __repr__(self) -> str:
        return f"<PlayerDraco player={self.player_id} draco={self.draco_id} x{self.count}>"


# ---------------------------------------------------------------------------
# Phase 7 : alliances, chat, invitations
# ---------------------------------------------------------------------------


class Alliance(Base):
    """A group of players sharing identity, chat, and (eventually) wars."""

    __tablename__ = "alliances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(48), unique=True, nullable=False)
    tag: Mapped[str] = mapped_column(String(5), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    founder_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    members: Mapped[list["AllianceMember"]] = relationship(
        back_populates="alliance",
        cascade="all, delete-orphan",
    )
    invitations: Mapped[list["AllianceInvitation"]] = relationship(
        back_populates="alliance",
        cascade="all, delete-orphan",
    )
    messages: Mapped[list["AllianceMessage"]] = relationship(
        back_populates="alliance",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Alliance id={self.id} tag={self.tag!r} name={self.name!r}>"


class AllianceMember(Base):
    """Membership link. A player belongs to at most one alliance at a time."""

    __tablename__ = "alliance_members"
    __table_args__ = (
        UniqueConstraint("player_id", name="uq_alliance_member_player"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alliance_id: Mapped[int] = mapped_column(ForeignKey("alliances.id"), nullable=False)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16), default="member", nullable=False)  # founder|member
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    alliance: Mapped[Alliance] = relationship(back_populates="members")

    def __repr__(self) -> str:
        return f"<AllianceMember alliance={self.alliance_id} player={self.player_id} role={self.role}>"


class AllianceInvitation(Base):
    """Pending invitation sent by an alliance to a player."""

    __tablename__ = "alliance_invitations"
    __table_args__ = (
        UniqueConstraint(
            "alliance_id", "player_id", name="uq_alliance_invitation"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alliance_id: Mapped[int] = mapped_column(ForeignKey("alliances.id"), nullable=False)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    alliance: Mapped[Alliance] = relationship(back_populates="invitations")

    def __repr__(self) -> str:
        return f"<AllianceInvitation alliance={self.alliance_id} player={self.player_id}>"


class AllianceMessage(Base):
    """A chat message posted in an alliance's channel."""

    __tablename__ = "alliance_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alliance_id: Mapped[int] = mapped_column(ForeignKey("alliances.id"), nullable=False)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(32), nullable=False)  # denormalized for speed
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    alliance: Mapped[Alliance] = relationship(back_populates="messages")

    def __repr__(self) -> str:
        return f"<AllianceMessage id={self.id} alliance={self.alliance_id} from={self.sender_name!r}>"


# ---------------------------------------------------------------------------
# Phase 8 : messagerie privée, classements, diplomatie
# ---------------------------------------------------------------------------


class PrivateMessage(Base):
    """One-to-one message between two players (both referencing users.id)."""

    __tablename__ = "private_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(32), nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(32), nullable=False)
    subject: Mapped[str] = mapped_column(String(128), default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archived_by_recipient: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    archived_by_sender: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PrivateMessage id={self.id} from={self.sender_id} to={self.recipient_id}>"


class AllianceDiplomacy(Base):
    """Diplomatic relationship between two alliances.

    To avoid duplicates, the pair is stored with ordered IDs :
    alliance_low_id < alliance_high_id always.
    """

    __tablename__ = "alliance_diplomacy"
    __table_args__ = (
        UniqueConstraint("alliance_low_id", "alliance_high_id", name="uq_alliance_pair"),
        CheckConstraint("alliance_low_id < alliance_high_id", name="ck_alliance_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    alliance_low_id: Mapped[int] = mapped_column(ForeignKey("alliances.id"), nullable=False)
    alliance_high_id: Mapped[int] = mapped_column(ForeignKey("alliances.id"), nullable=False)
    relation: Mapped[str] = mapped_column(String(16), default="neutral", nullable=False)
    # Who proposed / last updated the relation (for future "proposal" workflow).
    updated_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return (
            f"<AllianceDiplomacy {self.alliance_low_id}<->{self.alliance_high_id} "
            f"{self.relation}>"
        )


# ---------------------------------------------------------------------------
# Phase 9 : prouesses (achievements) + saison
# ---------------------------------------------------------------------------


class PlayerAchievement(Base):
    """A prouesse earned by a player. One row per (player, achievement)."""

    __tablename__ = "player_achievements"
    __table_args__ = (
        UniqueConstraint("player_id", "achievement_id", name="uq_player_achievement"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    # Reference into rebuild/data/achievements.json (0..15)
    achievement_id: Mapped[int] = mapped_column(Integer, nullable=False)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped[Player] = relationship(back_populates="achievements")

    def __repr__(self) -> str:
        return f"<PlayerAchievement player={self.player_id} ach={self.achievement_id}>"


class GameState(Base):
    """Singleton row holding global game state (current season, etc.)."""

    __tablename__ = "game_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    current_season: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    season_started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    season_label: Mapped[str] = mapped_column(String(64), default="Saison 1 — Aube")

    def __repr__(self) -> str:
        return f"<GameState season={self.current_season} label={self.season_label!r}>"


# ---------------------------------------------------------------------------
# Phase 10 (Bundle B) : inventory, buffs, spy reports
# ---------------------------------------------------------------------------


class PlayerItem(Base):
    """Stack of an item type owned by a player (items.json 0..46)."""

    __tablename__ = "player_items"
    __table_args__ = (
        UniqueConstraint("player_id", "item_id", name="uq_player_item"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped[Player] = relationship(back_populates="items")

    def __repr__(self) -> str:
        return f"<PlayerItem player={self.player_id} item={self.item_id} x{self.count}>"


class ActiveBuff(Base):
    """A timed effect currently active on a player."""

    __tablename__ = "active_buffs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), nullable=False)

    # Effect kind, resolved by game_logic. Examples:
    #  'train_speed'     — multiplies training time (0.5 = twice as fast)
    #  'camp_gold'       — multiplies PvE gold loot
    #  'camp_wood'       — multiplies PvE wood loot
    #  'camp_mana'       — multiplies PvE mana loot
    #  'attack_power'    — multiplies outgoing attacker damage
    #  'fret_capacity'   — multiplies carry/stolen amount
    #  'turret_protect'  — flag, no multiplier (boolean)
    effect: Mapped[str] = mapped_column(String(32), nullable=False)
    multiplier: Mapped[float] = mapped_column(default=1.0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    source_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped[Player] = relationship(back_populates="buffs")

    def __repr__(self) -> str:
        return f"<ActiveBuff {self.effect} x{self.multiplier} expires={self.expires_at}>"
