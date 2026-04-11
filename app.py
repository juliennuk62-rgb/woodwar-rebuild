"""
Woodwar Rebuild — Flask application.

Phase 2 : auth (inscription, login, sessions) + choix de clan + dashboard.
Phase 3 : construction et amélioration des bâtiments.
Phase 4 : production passive (tick loop + mise à jour à chaque visite).
"""
from __future__ import annotations

import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

# Make this folder importable regardless of the current working directory.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)

import json

import auth
import game_logic
from db import SessionLocal, init_db
from game_data import game_data
from models import (
    ActiveBuff,
    Alliance,
    AllianceDiplomacy,
    AllianceInvitation,
    AllianceMember,
    AllianceMessage,
    CombatLog,
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


# ----- Helpers ---------------------------------------------------------------


def _flash_achievement(achievement_id: int) -> None:
    meta = next(
        (a for a in game_data.achievements["achievements"] if a["id"] == achievement_id),
        None,
    )
    if meta is None:
        return
    flash(
        f"🏆 Prouesse accomplie : {meta['name_fr']} (+{meta['reward_xp']} XP)",
        "success",
    )


def _building_name(building_id: int) -> str:
    b = game_data.building_by_id(building_id)
    return b["name_fr"] if b else f"Bâtiment #{building_id}"


def _format_duration(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60} min"
    if seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h{m:02d}" if m else f"{h}h"
    d = seconds // 86400
    h = (seconds % 86400) // 3600
    return f"{d}j{h:02d}h" if h else f"{d}j"


# Building id -> legacy image path (checked once at import time).
_BUILDING_IMAGES: dict[int, str] = {}
for _bid in (1, 2, 3, 4, 5, 6, 11, 14):
    for _ext in (".jpg", ".png", ".gif"):
        _candidate = _HERE.parent / "batimentsmoyen" / f"{_bid}{_ext}"
        if _candidate.exists():
            _BUILDING_IMAGES[_bid] = f"batimentsmoyen/{_bid}{_ext}"
            break


def _build_dashboard_view(player: Player) -> list[dict]:
    """Build the per-building view data for the dashboard template."""
    owned: dict[int, PlayerBuilding] = {pb.building_id: pb for pb in player.buildings}
    view = []
    for bid in sorted(game_logic.BUILDABLE_IDS):
        meta = game_data.building_by_id(bid)
        if meta is None:
            continue
        pb = owned.get(bid)
        current_level = pb.level if pb is not None else 0
        cost = game_logic.upgrade_cost(bid, current_level)
        prod = game_logic.production_per_hour(bid, current_level) if current_level > 0 else None
        upgrading = False
        upgrade_remaining = None
        upgrading_until_iso = None
        upgrading_started_iso = None
        if pb is not None and pb.upgrading_until is not None:
            upgrading = True
            remaining = (pb.upgrading_until - datetime.utcnow()).total_seconds()
            upgrade_remaining = max(0, int(remaining))
            upgrading_until_iso = (
                pb.upgrading_until.replace(microsecond=0).isoformat() + "Z"
            )
            # Reconstruct the start time from the upgrade cost duration
            # because PlayerBuilding doesn't store it explicitly (yet).
            in_progress_cost = game_logic.upgrade_cost(bid, current_level)
            if in_progress_cost is not None:
                started = pb.upgrading_until - timedelta(seconds=in_progress_cost["time"])
                upgrading_started_iso = (
                    started.replace(microsecond=0).isoformat() + "Z"
                )

        view.append(
            {
                "id": bid,
                "name": meta["name_fr"],
                "role": meta.get("role", "—"),
                "slug": meta.get("slug", ""),
                "image": _BUILDING_IMAGES.get(bid),
                "level": current_level,
                "owned": pb is not None,
                "upgrading": upgrading,
                "upgrading_to": pb.upgrading_to if pb is not None else None,
                "upgrade_remaining_seconds": upgrade_remaining,
                "upgrade_remaining_fmt": _format_duration(upgrade_remaining) if upgrade_remaining is not None else None,
                "upgrading_until_iso": upgrading_until_iso,
                "upgrading_started_iso": upgrading_started_iso,
                "production_per_hour": prod,
                "resource_produced": game_logic.PRODUCERS.get(bid),
                "next_cost": cost,
                "max_level": game_logic.max_level(bid),
                "at_max": cost is None,
            }
        )
    return view


# ----- Background tick loop --------------------------------------------------


_tick_thread_started = False
_tick_thread_lock = threading.Lock()


def _background_tick_loop(app: Flask, interval_seconds: int = 60) -> None:
    """Periodically credit production to every player.

    The per-request tick (on dashboard load, on /build/...) is the
    authoritative path; this loop is just a safety net for long-idle sessions
    and API-only clients.
    """
    while True:
        try:
            time.sleep(interval_seconds)
            with app.app_context():
                with SessionLocal() as s:
                    players = s.query(Player).all()
                    for p in players:
                        game_logic.apply_production_tick(s, p)
                    s.commit()
        except Exception as e:  # noqa: BLE001 — keep the loop alive
            app.logger.warning("Background tick error: %s", e)


def _start_tick_thread_once(app: Flask) -> None:
    global _tick_thread_started
    with _tick_thread_lock:
        if _tick_thread_started:
            return
        t = threading.Thread(
            target=_background_tick_loop,
            args=(app,),
            name="woodwar-tick",
            daemon=True,
        )
        t.start()
        _tick_thread_started = True


def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.secret_key = auth.load_or_create_secret()
    app.permanent_session_lifetime = timedelta(days=30)

    init_db()
    # Seed the Kobold camps and global state on first launch.
    with SessionLocal() as s:
        game_logic.seed_kobold_camps(s)
        game_logic.get_or_create_game_state(s)
        s.commit()
    _start_tick_thread_once(app)

    @app.context_processor
    def inject_globals():
        user = auth.current_user()
        unread = 0
        if user is not None:
            with SessionLocal() as s:
                unread = game_logic.count_unread_messages(s, user)
        return {"current_user": user, "unread_messages": unread}

    # Serve legacy WoodwarBeta images (persos/, dracos/, bats/, bg/, ...).
    _LEGACY_ROOT = _HERE.parent  # C:\WoodwarBeta
    _ALLOWED_LEGACY_DIRS = {
        "persos", "dracos", "bats", "batimentsmoyen", "batiments_map",
        "bg", "camps", "reliques", "imgs", "fr_imgs", "extensions",
        "export_bg_divs_wwix", "cadre_alertes_wwix", "blasons", "boutons",
        # Phase : alliance visual assets
        "fiche_alliance", "blasons2", "export_actions_wwix",
    }
    # Also serve a handful of root-level GIF/PNG assets used by the UI.
    _ALLOWED_LEGACY_ROOT_FILES = {
        "or.gif", "bois.gif", "mana.gif", "epeautre.gif",
        "fret.gif", "bouclier.gif", "resistance.gif", "tourelle.gif",
        "abeille.gif", "blank.gif", "coche.png",
        "mur_1.jpg", "maj_idle.gif",
        # Royaume / carte assets
        "terrain0_0.jpg", "terrain0_1.jpg", "terrain0_2.jpg",
        "blank.png", "compas.png", "Explorer.gif", "Inventaire.gif",
        "esprit.jpg", "vg.jpg", "vg_0.jpg", "vg_1.jpg", "vg_bat.jpg",
    }

    @app.route("/legacy/<path:filename>")
    def legacy_asset(filename: str):
        normalized = filename.replace("\\", "/")
        if normalized in _ALLOWED_LEGACY_ROOT_FILES:
            return send_from_directory(_LEGACY_ROOT, normalized)
        first = normalized.split("/", 1)[0]
        if first not in _ALLOWED_LEGACY_DIRS:
            return "Not found", 404
        return send_from_directory(_LEGACY_ROOT, normalized)

    # ----- Pages ----------------------------------------------------------

    @app.route("/")
    def index():
        user = auth.current_user()
        if user is not None:
            return redirect(url_for("dashboard"))
        return render_template("home_unlogged.html", counts=game_data.counts())

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if auth.current_user() is not None:
            return redirect(url_for("dashboard"))

        form_data: dict[str, str] = {}

        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            password_confirm = request.form.get("password_confirm") or ""
            email = (request.form.get("email") or "").strip() or None
            clan_id_raw = request.form.get("clan_id") or ""

            form_data = {
                "username": username,
                "email": email or "",
                "clan_id": clan_id_raw,
            }

            error = auth.validate_username(username) or auth.validate_password(password)
            if error is None and password != password_confirm:
                error = "Les deux mots de passe ne correspondent pas."
            if error is None:
                try:
                    clan_id = int(clan_id_raw)
                except ValueError:
                    error = "Choisissez un clan."
                else:
                    if game_data.clan_by_id(clan_id) is None:
                        error = "Ce clan n'existe pas."

            if error is None:
                with SessionLocal() as s:
                    existing = (
                        s.query(User).filter(User.username == username).one_or_none()
                    )
                    if existing is not None:
                        error = "Ce pseudo est déjà pris."
                    else:
                        user = User(
                            username=username,
                            password_hash=auth.hash_password(password),
                            email=email,
                            clan_id=clan_id,
                            created_at=datetime.utcnow(),
                            last_seen=datetime.utcnow(),
                        )
                        s.add(user)
                        s.flush()  # populate user.id
                        player = Player(user_id=user.id)
                        s.add(player)
                        s.flush()
                        # Award the "Create avatar" achievement immediately.
                        game_logic.check_achievements(s, player, user)
                        s.commit()
                        auth.login_user(user)
                        flash(f"Bienvenue, Seigneur {username} !", "success")
                        return redirect(url_for("dashboard"))

            flash(error, "error")

        return render_template(
            "register.html",
            clans=game_data.clans["clans"],
            form_data=form_data,
        )

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if auth.current_user() is not None:
            return redirect(url_for("dashboard"))

        form_data: dict[str, str] = {}

        if request.method == "POST":
            username = (request.form.get("username") or "").strip()
            password = request.form.get("password") or ""
            form_data = {"username": username}

            with SessionLocal() as s:
                user = s.query(User).filter(User.username == username).one_or_none()
                if user is None or not auth.verify_password(user.password_hash, password):
                    flash("Pseudo ou mot de passe incorrect.", "error")
                else:
                    user.last_seen = datetime.utcnow()
                    s.commit()
                    auth.login_user(user)
                    return redirect(url_for("dashboard"))

        return render_template("login.html", form_data=form_data)

    @app.route("/logout")
    def logout():
        auth.logout_user()
        flash("À bientôt, Seigneur.", "success")
        return redirect(url_for("index"))

    # Fixed positions for each building type on the 6x7 map grid.
    # Positions are (row, col) with row in 0..6 and col in 0..5.
    # Chosen to spread the starter buildings across the full map area
    # rather than clustering them in a single column.
    _MAP_POSITIONS = {
        2:  (1, 1),  # Mine d'or           — top-left
        6:  (1, 4),  # Laboratoire tech    — top-right
        3:  (2, 3),  # Fontaine magique    — center-top
        11: (2, 5),  # Bestiaire           — far-right
        4:  (3, 0),  # Scierie             — left
        1:  (4, 2),  # Caserne             — center
        14: (5, 1),  # Auberge             — bottom-left
        5:  (5, 4),  # Laboratoire magie   — bottom-right
    }
    # Visual sprite per building_id for the map view.
    # Tuple = (base PNG, optional animated GIF overlay). The overlay is
    # how the live game animates water, flames, smoke, runes, etc.
    _MAP_SPRITES = {
        1:  ("batiments_map/1.png",  None),              # Caserne — static
        2:  ("batiments_map/2.png",  "batiments_map/2.gif"),   # Mine animation
        3:  ("batiments_map/3.png",  "batiments_map/3.gif"),   # Fountain animation
        4:  ("batiments_map/4.png",  None),              # Sawmill — static
        5:  ("batiments_map/5.png",  "batiments_map/magie.gif"),   # Magic lab
        6:  ("batiments_map/6.png",  "batiments_map/techno.gif"),  # Tech lab
        11: ("batiments_map/11.png", None),              # Bestiary — static
        14: ("batiments_map/14.jpg", None),              # Inn — static
    }

    @app.route("/dashboard")
    @auth.login_required
    def dashboard():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            tick = game_logic.apply_production_tick(s, player)
            s.commit()

            clan = game_data.clan_by_id(user.clan_id) or {
                "name": "—", "chief": "—", "color": "#888"
            }
            buildings_view = _build_dashboard_view(player)

            # Relics owned by the player (with their lore names).
            owned_relic_ids = game_logic.player_relic_ids(player)
            relics_view = []
            for r in game_data.relics["relics"]:
                relics_view.append(
                    {
                        "id": r["id"],
                        "name": r["name_fr"],
                        "owned": r["id"] in owned_relic_ids,
                    }
                )

            # Draco summary.
            draco_stock = game_logic.draco_stock(player)
            draco_dmg, draco_def = game_logic.draco_contribution(player)

            # Alliance membership + pending invitations.
            my_alliance, my_member = game_logic.player_alliance(s, player)
            invitations = game_logic.pending_invitations_for(s, player)
            invitations_view = []
            for inv in invitations:
                alliance = s.get(Alliance, inv.alliance_id)
                sender = s.get(User, inv.sender_id)
                if alliance is None:
                    continue
                invitations_view.append(
                    {
                        "id": inv.id,
                        "alliance_name": alliance.name,
                        "alliance_tag": alliance.tag,
                        "sender_name": sender.username if sender else "?",
                        "created_at": inv.created_at,
                    }
                )

            # Season info.
            state = game_logic.get_or_create_game_state(s)
            season = {
                "number": state.current_season,
                "label": state.season_label,
                "day": game_logic.season_day(state),
            }

            # Achievement summary.
            earned_count = len(player.achievements)
            total_achievements = len(game_data.achievements["achievements"])

            # --- Build the 7x6 map grid for the royaume view ---
            MAP_ROWS = 7
            MAP_COLS = 6
            owned_by_id = {pb.building_id: pb for pb in player.buildings}
            map_grid = [[None for _ in range(MAP_COLS)] for _ in range(MAP_ROWS)]
            for bid, (row, col) in _MAP_POSITIONS.items():
                if bid in owned_by_id and row < MAP_ROWS and col < MAP_COLS:
                    pb = owned_by_id[bid]
                    meta = game_data.building_by_id(bid)
                    sprite, overlay = _MAP_SPRITES.get(bid, ("batiments_map/const.png", None))
                    map_grid[row][col] = {
                        "building_id": bid,
                        "name": meta["name_fr"] if meta else f"#{bid}",
                        "level": pb.level,
                        "sprite": sprite,
                        "overlay": overlay,
                    }

            return render_template(
                "dashboard.html",
                player=player,
                clan=clan,
                buildings=buildings_view,
                rates=tick["rates_per_hour"],
                relics=relics_view,
                relic_count=len(owned_relic_ids),
                draco_stock=draco_stock,
                draco_dmg=draco_dmg,
                draco_def=draco_def,
                my_alliance=my_alliance,
                my_alliance_role=my_member.role if my_member else None,
                invitations=invitations_view,
                season=season,
                earned_count=earned_count,
                total_achievements=total_achievements,
                map_grid=map_grid,
                map_rows=MAP_ROWS,
                map_cols=MAP_COLS,
            )

    # ----- Building actions -----------------------------------------------

    @app.route("/build/<int:building_id>", methods=["POST"])
    @auth.login_required
    def build(building_id: int):
        """Construct a new building (level 0 -> 1) or start an upgrade."""
        if building_id not in game_logic.BUILDABLE_IDS:
            flash("Ce bâtiment n'est pas constructible pour l'instant.", "error")
            return redirect(url_for("dashboard"))

        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            # Always apply the tick before any economic action so the player's
            # resources reflect reality at the moment of the decision.
            game_logic.apply_production_tick(s, player)

            pb = (
                s.query(PlayerBuilding)
                .filter(
                    PlayerBuilding.player_id == player.id,
                    PlayerBuilding.building_id == building_id,
                )
                .one_or_none()
            )

            if pb is not None and pb.upgrading_until is not None:
                s.commit()
                flash(
                    "Ce bâtiment est déjà en cours d'amélioration.",
                    "error",
                )
                return redirect(url_for("dashboard"))

            current_level = pb.level if pb is not None else 0
            cost = game_logic.upgrade_cost(building_id, current_level)
            if cost is None:
                s.commit()
                flash("Ce bâtiment a atteint son niveau maximum.", "error")
                return redirect(url_for("dashboard"))

            if player.gold < cost["or"] or player.wood < cost["bois"]:
                s.commit()
                flash(
                    f"Pas assez de ressources. Il faut {cost['or']} or et {cost['bois']} bois.",
                    "error",
                )
                return redirect(url_for("dashboard"))

            # Pay the cost and start the (up)grade.
            player.gold -= cost["or"]
            player.wood -= cost["bois"]

            building_name = _building_name(building_id)
            if pb is None:
                # Instant first construction so the player sees immediate
                # results. Construction time of 50s for producers feels
                # artificial in a browser idle game.
                pb = PlayerBuilding(
                    player_id=player.id,
                    building_id=building_id,
                    level=1,
                )
                s.add(pb)
                # Keep the in-memory relationship synced so the achievement
                # check sees the new building in the same transaction.
                player.buildings.append(pb)
                flash(
                    f"{building_name} construit. Il produit désormais des ressources !",
                    "success",
                )
            else:
                # Upgrades take the prescribed time from nivprix.php.
                pb.upgrading_until = datetime.utcnow() + timedelta(seconds=cost["time"])
                pb.upgrading_to = pb.level + 1
                flash(
                    f"{building_name} en amélioration vers le niveau {pb.level + 1} "
                    f"(~{_format_duration(cost['time'])}).",
                    "success",
                )

            # Achievement check after each build.
            awarded = game_logic.check_achievements(s, player, user)
            for aid in awarded:
                _flash_achievement(aid)
            s.commit()
            return redirect(url_for("dashboard"))

    @app.route("/api/player/buildings")
    @auth.login_required
    def api_player_buildings():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()
            return jsonify({"buildings": _build_dashboard_view(player)})

    # ----- Caserne (unit training) ----------------------------------------

    @app.route("/caserne")
    @auth.login_required
    def caserne():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            caserne_lvl = game_logic.caserne_level(player)
            stock = game_logic.unit_stock(player)

            # Active training info
            training_info = None
            if player.training_unit_id != 0 and player.training_completes_at is not None:
                unit_meta = game_data.unit_by_id(player.training_unit_id)
                remaining = int((player.training_completes_at - datetime.utcnow()).total_seconds())
                started_iso = (
                    player.training_started_at.replace(microsecond=0).isoformat() + "Z"
                    if player.training_started_at is not None
                    else None
                )
                completes_iso = (
                    player.training_completes_at.replace(microsecond=0).isoformat() + "Z"
                )
                training_info = {
                    "unit_name": unit_meta["name_fr"] if unit_meta else "?",
                    "quantity": player.training_quantity,
                    "remaining_seconds": max(0, remaining),
                    "remaining_fmt": _format_duration(max(0, remaining)),
                    "started_iso": started_iso,
                    "completes_iso": completes_iso,
                }

            units_view = []
            for unit in game_data.units["units"]:
                uid = unit["id"]
                required = unit.get("caserne_required", 1)
                unlocked = caserne_lvl >= required
                cost = unit["cost"]
                max_affordable = 0
                if unlocked and cost["or"] > 0:
                    max_affordable = min(
                        player.gold // cost["or"],
                        player.wood // max(cost["bois"], 1) if cost["bois"] > 0 else 10**9,
                        player.mana // max(cost["mana"], 1) if cost["mana"] > 0 else 10**9,
                    )
                units_view.append(
                    {
                        "id": uid,
                        "name": unit["name_fr"],
                        "image": unit.get("image"),
                        "damage": unit["damage"],
                        "defense": unit["defense"],
                        "caserne_required": required,
                        "unlocked": unlocked,
                        "cost": cost,
                        "owned": stock.get(uid, 0),
                        "max_affordable": max_affordable,
                    }
                )

            return render_template(
                "caserne.html",
                player=player,
                caserne_level=caserne_lvl,
                units=units_view,
                training_info=training_info,
            )

    @app.route("/train/<int:unit_id>", methods=["POST"])
    @auth.login_required
    def train(unit_id: int):
        try:
            quantity = int(request.form.get("quantity", 0))
        except ValueError:
            quantity = 0
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            try:
                result = game_logic.start_training(s, player, unit_id, quantity)
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("caserne"))
            s.commit()
            flash(
                f"Formation de {result['quantity']} × {result['unit_name']} "
                f"lancée ! Terminée dans {_format_duration(result['total_seconds'])}.",
                "success",
            )
            return redirect(url_for("caserne"))

    # ----- Campaigns (PvE combat against Kobold camps) --------------------

    @app.route("/campagnes")
    @auth.login_required
    def campagnes():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            game_logic.refresh_camps(s)
            s.commit()

            now = datetime.utcnow()
            camps = s.query(KoboldCamp).order_by(KoboldCamp.pv_max).all()
            camps_view = []
            for c in camps:
                alive = c.respawn_at is None or c.respawn_at <= now
                respawn_in = None
                if not alive:
                    respawn_in = int((c.respawn_at - now).total_seconds())
                biome_meta = game_logic.BIOMES.get(
                    c.biome, game_logic.BIOMES["foret"]
                )
                camps_view.append(
                    {
                        "id": c.id,
                        "name": c.name,
                        "description": c.description,
                        "biome": c.biome,
                        "biome_label": biome_meta["label"],
                        "image": biome_meta["image"],
                        "pv_max": c.pv_max,
                        "pv_current": c.pv_current if alive else 0,
                        "loot": {
                            "gold": c.loot_gold,
                            "wood": c.loot_wood,
                            "mana": c.loot_mana,
                        },
                        "alive": alive,
                        "respawn_in": respawn_in,
                        "respawn_in_fmt": _format_duration(respawn_in) if respawn_in else None,
                    }
                )

            # Build unit stock view with stats.
            stock = game_logic.unit_stock(player)
            army_view = []
            for unit in game_data.units["units"]:
                uid = unit["id"]
                count = stock.get(uid, 0)
                if count > 0:
                    army_view.append(
                        {
                            "id": uid,
                            "name": unit["name_fr"],
                            "count": count,
                            "damage": unit["damage"],
                            "defense": unit["defense"],
                            "total_damage": unit["damage"] * count,
                        }
                    )
            total_army_damage = sum(a["total_damage"] for a in army_view)

            return render_template(
                "campagnes.html",
                player=player,
                camps=camps_view,
                army=army_view,
                total_army_damage=total_army_damage,
            )

    @app.route("/attack/<int:camp_id>", methods=["POST"])
    @auth.login_required
    def attack(camp_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)

            camp = s.get(KoboldCamp, camp_id)
            if camp is None:
                s.commit()
                flash("Camp introuvable.", "error")
                return redirect(url_for("campagnes"))

            # Parse army from form: each field named "unit_<id>" with int value.
            army: dict[int, int] = {}
            for key, value in request.form.items():
                if key.startswith("unit_"):
                    try:
                        uid = int(key[len("unit_"):])
                        qty = int(value or 0)
                        if qty > 0:
                            army[uid] = qty
                    except ValueError:
                        continue

            try:
                result = game_logic.resolve_combat(s, player, camp, army)
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("campagnes"))

            awarded = game_logic.check_achievements(s, player, user)
            s.commit()
            if result["outcome"] == "victory":
                flash(
                    f"Victoire ! Butin : {result['loot']['gold']} or, "
                    f"{result['loot']['wood']} bois, {result['loot']['mana']} mana.",
                    "success",
                )
            else:
                flash(
                    f"Le camp a résisté. Il lui reste {result['pv_after']} PV.",
                    "error",
                )
            for aid in awarded:
                _flash_achievement(aid)
            return redirect(url_for("combat_report", log_id=result["log_id"]))

    # ----- Dracos (trained at the Bestiary) ------------------------------

    @app.route("/dracos")
    @auth.login_required
    def dracos_page():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            bestiary_lvl = game_logic.bestiary_level(player)
            stock = game_logic.draco_stock(player)

            dracos_view = []
            for d in game_data.dracos["dracos"]:
                did = d["id"]
                required = d["caserne_required"]
                unlocked = bestiary_lvl >= required
                cost = d["cost"]
                max_affordable = 0
                if unlocked:
                    max_affordable = min(
                        player.gold // max(cost["or"], 1),
                        player.wood // max(cost["bois"], 1),
                        player.mana // max(cost["mana"], 1),
                    )
                dracos_view.append(
                    {
                        "id": did,
                        "name": d["name_fr"],
                        "defense": d["defense"],
                        "damage": d["defense"] * 2,
                        "bestiary_required": required,
                        "unlocked": unlocked,
                        "cost": cost,
                        "owned": stock.get(did, 0),
                        "max_affordable": max_affordable,
                    }
                )
            total_draco_dmg, total_draco_def = game_logic.draco_contribution(player)

            return render_template(
                "dracos.html",
                player=player,
                bestiary_level=bestiary_lvl,
                dracos=dracos_view,
                total_draco_dmg=total_draco_dmg,
                total_draco_def=total_draco_def,
            )

    @app.route("/train_draco/<int:draco_id>", methods=["POST"])
    @auth.login_required
    def train_draco_route(draco_id: int):
        try:
            quantity = int(request.form.get("quantity", 0))
        except ValueError:
            quantity = 0
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            try:
                result = game_logic.train_draco(s, player, draco_id, quantity)
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("dracos_page"))
            s.commit()
            flash(
                f"{result['quantity']} × {result['draco_name']} dressé(s) !",
                "success",
            )
            return redirect(url_for("dracos_page"))

    # ----- PvP (attack another player) -----------------------------------

    @app.route("/joueurs")
    @auth.login_required
    def joueurs():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            others = (
                s.query(User, Player)
                .join(Player, Player.user_id == User.id)
                .filter(User.id != user.id)
                .order_by(Player.level.desc(), Player.gold.desc())
                .limit(50)
                .all()
            )
            others_view = []
            for u, p in others:
                clan = game_data.clan_by_id(u.clan_id) or {"name": "—", "color": "#888"}
                others_view.append(
                    {
                        "id": u.id,
                        "username": u.username,
                        "level": p.level,
                        "gold": p.gold,
                        "wood": p.wood,
                        "mana": p.mana,
                        "clan": clan,
                        "total_units": sum(pu.count for pu in p.units),
                    }
                )

            stock = game_logic.unit_stock(player)
            army_view = []
            for unit in game_data.units["units"]:
                uid = unit["id"]
                count = stock.get(uid, 0)
                if count > 0:
                    army_view.append(
                        {
                            "id": uid,
                            "name": unit["name_fr"],
                            "count": count,
                        }
                    )

            return render_template(
                "joueurs.html",
                player=player,
                others=others_view,
                army=army_view,
            )

    @app.route("/attaque_joueur/<int:target_id>", methods=["POST"])
    @auth.login_required
    def attaque_joueur(target_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            attacker = s.query(Player).filter(Player.user_id == user.id).one()
            target_user = s.get(User, target_id)
            if target_user is None:
                flash("Seigneur introuvable.", "error")
                return redirect(url_for("joueurs"))
            defender = s.query(Player).filter(Player.user_id == target_user.id).one()

            game_logic.apply_production_tick(s, attacker)
            game_logic.apply_production_tick(s, defender)

            # Parse army from form.
            army: dict[int, int] = {}
            for key, value in request.form.items():
                if key.startswith("unit_"):
                    try:
                        uid = int(key[len("unit_"):])
                        qty = int(value or 0)
                        if qty > 0:
                            army[uid] = qty
                    except ValueError:
                        continue

            try:
                result = game_logic.resolve_pvp_combat(s, attacker, defender, army)
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("joueurs"))

            awarded = game_logic.check_achievements(s, attacker, user)
            s.commit()
            if result["outcome"] == "victory":
                diplo_suffix = ""
                if result.get("diplomatic_status") == "enemy":
                    diplo_suffix = " (bonus ennemi +20%)"
                flash(
                    f"Victoire sur {target_user.username} !{diplo_suffix} Butin : "
                    f"{result['loot']['gold']} or, "
                    f"{result['loot']['wood']} bois, "
                    f"{result['loot']['mana']} mana.",
                    "success",
                )
            else:
                flash(
                    f"Votre attaque a été repoussée par {target_user.username}.",
                    "error",
                )
            for aid in awarded:
                _flash_achievement(aid)
            return redirect(url_for("combat_report", log_id=result["log_id"]))

    # ----- Alliances (Phase 7) --------------------------------------------

    @app.route("/alliances")
    @auth.login_required
    def alliances_list():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            alliances = s.query(Alliance).order_by(Alliance.created_at).all()
            alliances_view = []
            for a in alliances:
                alliances_view.append(
                    {
                        "id": a.id,
                        "name": a.name,
                        "tag": a.tag,
                        "description": (a.description or "")[:120],
                        "member_count": len(a.members),
                        "max_members": game_logic.ALLIANCE_MAX_MEMBERS,
                        "created_at": a.created_at,
                    }
                )

            my_alliance, my_member = game_logic.player_alliance(s, player)

            return render_template(
                "alliances.html",
                player=player,
                alliances=alliances_view,
                my_alliance=my_alliance,
                my_role=my_member.role if my_member else None,
                creation_cost=game_logic.ALLIANCE_CREATION_COST_GOLD,
            )

    @app.route("/alliance/new", methods=["GET", "POST"])
    @auth.login_required
    def alliance_new():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            existing, _ = game_logic.player_alliance(s, player)
            if existing is not None:
                flash("Vous appartenez déjà à une alliance.", "error")
                return redirect(url_for("alliance_detail", alliance_id=existing.id))

            form_data = {"name": "", "tag": "", "description": ""}
            if request.method == "POST":
                form_data = {
                    "name": request.form.get("name", ""),
                    "tag": request.form.get("tag", ""),
                    "description": request.form.get("description", ""),
                }
                try:
                    alliance = game_logic.create_alliance(
                        s,
                        user,
                        player,
                        form_data["name"],
                        form_data["tag"],
                        form_data["description"],
                    )
                    s.commit()
                    flash(
                        f"Alliance « {alliance.name} » [{alliance.tag}] fondée !",
                        "success",
                    )
                    return redirect(url_for("alliance_detail", alliance_id=alliance.id))
                except ValueError as e:
                    s.rollback()
                    flash(str(e), "error")

            return render_template(
                "alliance_new.html",
                player=player,
                form_data=form_data,
                creation_cost=game_logic.ALLIANCE_CREATION_COST_GOLD,
            )

    @app.route("/alliance/<int:alliance_id>")
    @auth.login_required
    def alliance_detail(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))

            # Build the members view with user + player data.
            members_view = []
            for m in alliance.members:
                mp = s.get(Player, m.player_id)
                mu = s.get(User, mp.user_id)
                clan = game_data.clan_by_id(mu.clan_id) or {"name": "—", "color": "#888"}
                members_view.append(
                    {
                        "username": mu.username,
                        "role": m.role,
                        "level": mp.level,
                        "joined_at": m.joined_at,
                        "clan": clan,
                    }
                )

            is_member = any(m.player_id == player.id for m in alliance.members)
            is_founder = alliance.founder_id == user.id

            messages = (
                s.query(AllianceMessage)
                .filter(AllianceMessage.alliance_id == alliance.id)
                .order_by(AllianceMessage.created_at.desc())
                .limit(50)
                .all()
            )
            messages_view = list(reversed(messages))

            # Alliance meta displayed in the header (mimics vb_ht3).
            age_delta = datetime.utcnow() - alliance.created_at
            age_days = max(1, age_delta.days)
            if age_days < 14:
                age_label = f"il y a {age_days} jour{'s' if age_days > 1 else ''}"
            elif age_days < 60:
                weeks = age_days // 7
                age_label = f"il y a {weeks} semaine{'s' if weeks > 1 else ''}"
            else:
                months = age_days // 30
                age_label = f"il y a {months} mois"
            total_points = sum(m.get("level", 1) * 1000 for m in members_view)

            # Pick a blason from blasons2/ (1554 available) deterministically
            # by alliance id. Files are named "1 (N).png" with N in 1..1554.
            blason_n = (alliance.id * 173 % 1554) + 1
            blason_path = f"blasons2/1 ({blason_n}).png"

            return render_template(
                "alliance_detail.html",
                player=player,
                alliance=alliance,
                members=members_view,
                messages=messages_view,
                is_member=is_member,
                is_founder=is_founder,
                invitation_cost=game_logic.ALLIANCE_INVITATION_COST_GOLD,
                age_label=age_label,
                total_points=total_points,
                blason_path=blason_path,
                has_room=(len(alliance.members) < game_logic.ALLIANCE_MAX_MEMBERS),
                founder_name=next(
                    (m["username"] for m in members_view if m["role"] == "founder"),
                    "?",
                ),
            )

    @app.route("/alliance/<int:alliance_id>/invite", methods=["POST"])
    @auth.login_required
    def alliance_invite(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)

            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))

            try:
                game_logic.invite_to_alliance(
                    s, alliance, user, player, request.form.get("username", "")
                )
                s.commit()
                flash("Invitation envoyée.", "success")
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")

            return redirect(url_for("alliance_detail", alliance_id=alliance_id))

    @app.route("/alliance/invitation/<int:invitation_id>/accept", methods=["POST"])
    @auth.login_required
    def alliance_invitation_accept(invitation_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            invitation = s.get(AllianceInvitation, invitation_id)
            if invitation is None:
                flash("Invitation introuvable.", "error")
                return redirect(url_for("dashboard"))
            try:
                member = game_logic.accept_alliance_invitation(s, invitation, player)
                alliance_id = member.alliance_id
                awarded = game_logic.check_achievements(s, player, user)
                s.commit()
                flash("Bienvenue dans l'alliance !", "success")
                for aid in awarded:
                    _flash_achievement(aid)
                return redirect(url_for("alliance_detail", alliance_id=alliance_id))
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("dashboard"))

    @app.route("/alliance/invitation/<int:invitation_id>/decline", methods=["POST"])
    @auth.login_required
    def alliance_invitation_decline(invitation_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            invitation = s.get(AllianceInvitation, invitation_id)
            if invitation is None:
                flash("Invitation introuvable.", "error")
                return redirect(url_for("dashboard"))
            try:
                game_logic.decline_alliance_invitation(s, invitation, player)
                s.commit()
                flash("Invitation déclinée.", "success")
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
            return redirect(url_for("dashboard"))

    @app.route("/alliance/<int:alliance_id>/leave", methods=["POST"])
    @auth.login_required
    def alliance_leave(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))
            try:
                game_logic.leave_alliance(s, alliance, player)
                s.commit()
                flash("Vous avez quitté l'alliance.", "success")
                return redirect(url_for("alliances_list"))
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("alliance_detail", alliance_id=alliance_id))

    @app.route("/alliance/<int:alliance_id>/disband", methods=["POST"])
    @auth.login_required
    def alliance_disband(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))
            try:
                game_logic.disband_alliance(s, alliance, user)
                s.commit()
                flash("L'alliance a été dissoute.", "success")
                return redirect(url_for("alliances_list"))
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("alliance_detail", alliance_id=alliance_id))

    @app.route("/alliance/<int:alliance_id>/chat", methods=["POST"])
    @auth.login_required
    def alliance_chat(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))
            try:
                game_logic.post_alliance_message(
                    s, alliance, user, player, request.form.get("content", "")
                )
                s.commit()
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
            return redirect(url_for("alliance_detail", alliance_id=alliance_id))

    # ----- Generated content (daily trigger) ------------------------------

    @app.route("/rumeurs")
    @auth.login_required
    def rumeurs_page():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            lore_entries = sorted(
                game_data.generated_lore,
                key=lambda e: e.get("created_at", ""),
                reverse=True,
            )

            # Latest quests (from generated content)
            quests = sorted(
                game_data.generated_quests,
                key=lambda q: q.get("created_at", ""),
                reverse=True,
            )[:10]

            # Latest events — displayed as a flavor preview so players can
            # see what situations may appear on their dashboard.
            events = sorted(
                game_data.generated_events,
                key=lambda e: e.get("weight", 0),
                reverse=True,
            )[:6]

            return render_template(
                "rumeurs.html",
                player=player,
                lore_entries=lore_entries,
                quests=quests,
                events=events,
                total_lore=len(game_data.generated_lore),
                total_quests=len(game_data.generated_quests),
                total_events=len(game_data.generated_events),
                total_camps=len(game_data.generated_camps),
                total_items=len(game_data.generated_items),
            )

    # ----- Bundle B: inventory, items, spy, market ------------------------

    @app.route("/inventaire")
    @auth.login_required
    def inventaire_page():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            game_logic.clean_expired_buffs(s, player)
            s.commit()

            usable_ids = game_logic.usable_item_ids()
            items_view = []
            for pi in sorted(player.items, key=lambda x: x.item_id):
                meta = next(
                    (i for i in game_data.items["items"] if i["id"] == pi.item_id),
                    None,
                )
                if meta is None:
                    continue
                items_view.append({
                    "id": pi.item_id,
                    "name": meta["name_fr"],
                    "description": meta.get("description", ""),
                    "count": pi.count,
                    "usable": pi.item_id in usable_ids,
                })

            now = datetime.utcnow()
            buffs_view = []
            for b in sorted(player.buffs, key=lambda x: x.expires_at):
                if b.expires_at <= now:
                    continue
                remaining = int((b.expires_at - now).total_seconds())
                buffs_view.append({
                    "effect": b.effect,
                    "multiplier": b.multiplier,
                    "remaining_fmt": _format_duration(remaining),
                    "source_item_id": b.source_item_id,
                })

            return render_template(
                "inventaire.html",
                player=player,
                items=items_view,
                buffs=buffs_view,
            )

    @app.route("/use_item/<int:item_id>", methods=["POST"])
    @auth.login_required
    def use_item_route(item_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            try:
                result = game_logic.use_item(s, player, item_id)
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("inventaire_page"))
            s.commit()
            flash(result["label"], "success")
            return redirect(url_for("inventaire_page"))

    @app.route("/espionnage/<int:target_user_id>", methods=["POST"])
    @auth.login_required
    def espionnage(target_user_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            spy_player = s.query(Player).filter(Player.user_id == user.id).one()
            target_user = s.get(User, target_user_id)
            if target_user is None:
                flash("Cible introuvable.", "error")
                return redirect(url_for("joueurs"))
            target_player = s.query(Player).filter(
                Player.user_id == target_user_id
            ).one_or_none()
            if target_player is None:
                flash("Ce Seigneur n'a pas de royaume.", "error")
                return redirect(url_for("joueurs"))

            try:
                report = game_logic.spy_on_player(s, spy_player, target_player)
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
                return redirect(url_for("joueurs"))
            s.commit()

            return render_template(
                "espionnage.html",
                target_name=target_user.username,
                report=report,
            )

    @app.route("/marche", methods=["GET", "POST"])
    @auth.login_required
    def marche():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            game_logic.apply_production_tick(s, player)
            s.commit()

            if request.method == "POST":
                source = request.form.get("source", "")
                target = request.form.get("target", "")
                try:
                    amount = int(request.form.get("amount", "0"))
                except ValueError:
                    amount = 0
                try:
                    result = game_logic.market_exchange(player, source, target, amount)
                    s.commit()
                    flash(
                        f"Échange : {result['spent']} {source} → {result['gained']} {target}.",
                        "success",
                    )
                except ValueError as e:
                    s.rollback()
                    flash(str(e), "error")
                return redirect(url_for("marche"))

            return render_template(
                "marche.html",
                player=player,
                ratio=game_logic.MARKET_EXCHANGE_RATIO,
            )

    # ----- Prouesses (Phase 9) --------------------------------------------

    @app.route("/prouesses")
    @auth.login_required
    def prouesses_page():
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            # Re-evaluate in case an event was missed earlier.
            awarded = game_logic.check_achievements(s, player, user)
            s.commit()
            for aid in awarded:
                _flash_achievement(aid)

            earned_ids = {pa.achievement_id: pa for pa in player.achievements}
            rows = []
            for meta in game_data.achievements["achievements"]:
                pa = earned_ids.get(meta["id"])
                rows.append(
                    {
                        "id": meta["id"],
                        "name": meta["name_fr"],
                        "description": meta["description"],
                        "reward_xp": meta["reward_xp"],
                        "earned": pa is not None,
                        "earned_at": pa.earned_at if pa else None,
                    }
                )

            return render_template(
                "prouesses.html",
                player=player,
                rows=rows,
                earned_count=len(earned_ids),
                total=len(rows),
            )

    # ----- Private messages (Phase 8) -------------------------------------

    @app.route("/inbox")
    @auth.login_required
    def inbox():
        user = auth.current_user()
        with SessionLocal() as s:
            messages = game_logic.inbox_messages(s, user)
            unread_count = sum(
                1 for m in messages
                if not m.is_read and not m.archived_by_recipient
            )
            return render_template(
                "inbox.html",
                messages=messages,
                unread_count=unread_count,
                view="inbox",
            )

    @app.route("/outbox")
    @auth.login_required
    def outbox():
        user = auth.current_user()
        with SessionLocal() as s:
            messages = game_logic.outbox_messages(s, user)
            return render_template(
                "inbox.html",
                messages=messages,
                unread_count=0,
                view="outbox",
            )

    @app.route("/messages/new", methods=["GET", "POST"])
    @auth.login_required
    def messages_new():
        user = auth.current_user()
        form_data = {
            "to": request.args.get("to", ""),
            "subject": "",
            "content": "",
        }
        if request.method == "POST":
            form_data = {
                "to": request.form.get("to", "").strip(),
                "subject": request.form.get("subject", ""),
                "content": request.form.get("content", ""),
            }
            with SessionLocal() as s:
                try:
                    msg = game_logic.send_private_message(
                        s,
                        user,
                        form_data["to"],
                        form_data["subject"],
                        form_data["content"],
                    )
                    s.commit()
                    flash(
                        f"Message envoyé à {msg.recipient_name}.",
                        "success",
                    )
                    return redirect(url_for("outbox"))
                except ValueError as e:
                    s.rollback()
                    flash(str(e), "error")

        return render_template("message_new.html", form_data=form_data)

    @app.route("/messages/<int:message_id>")
    @auth.login_required
    def message_view(message_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            msg = s.get(PrivateMessage, message_id)
            if msg is None:
                flash("Message introuvable.", "error")
                return redirect(url_for("inbox"))
            if msg.sender_id != user.id and msg.recipient_id != user.id:
                flash("Ce message ne vous concerne pas.", "error")
                return redirect(url_for("inbox"))

            game_logic.mark_message_read(s, msg, user)
            s.commit()

            return render_template(
                "message_view.html",
                msg=msg,
                is_recipient=(msg.recipient_id == user.id),
            )

    @app.route("/messages/<int:message_id>/archive", methods=["POST"])
    @auth.login_required
    def message_archive(message_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            msg = s.get(PrivateMessage, message_id)
            if msg is None:
                flash("Message introuvable.", "error")
                return redirect(url_for("inbox"))
            if msg.recipient_id == user.id:
                msg.archived_by_recipient = True
            elif msg.sender_id == user.id:
                msg.archived_by_sender = True
            else:
                flash("Ce message ne vous concerne pas.", "error")
                return redirect(url_for("inbox"))
            s.commit()
            flash("Message archivé.", "success")
            return redirect(url_for("inbox"))

    # ----- Leaderboards (Phase 8) -----------------------------------------

    @app.route("/classements")
    @auth.login_required
    def classements():
        with SessionLocal() as s:
            players = game_logic.top_players(s, limit=20)
            players_view = []
            for u, p in players:
                clan = game_data.clan_by_id(u.clan_id) or {"name": "—", "color": "#888"}
                players_view.append(
                    {
                        "username": u.username,
                        "clan": clan,
                        "level": p.level,
                        "xp": p.xp,
                        "reputation": p.reputation,
                        "gold": p.gold,
                    }
                )

            alliances = game_logic.top_alliances(s, limit=20)
            alliances_view = [
                {
                    "id": a.id,
                    "name": a.name,
                    "tag": a.tag,
                    "members": count,
                }
                for a, count in alliances
            ]

            warriors = game_logic.top_warriors(s, limit=20)
            warriors_view = []
            for u, victories, total in warriors:
                clan = game_data.clan_by_id(u.clan_id) or {"name": "—", "color": "#888"}
                warriors_view.append(
                    {
                        "username": u.username,
                        "clan": clan,
                        "victories": victories,
                        "total": total,
                    }
                )

            return render_template(
                "classements.html",
                players=players_view,
                alliances=alliances_view,
                warriors=warriors_view,
            )

    # ----- Diplomacy (Phase 8) --------------------------------------------

    @app.route("/alliance/<int:alliance_id>/diplomatie")
    @auth.login_required
    def alliance_diplomacy_page(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))

            is_founder = alliance.founder_id == user.id

            all_alliances = (
                s.query(Alliance).filter(Alliance.id != alliance_id).all()
            )
            rows_view = []
            for other in all_alliances:
                relation = game_logic.get_diplomacy(s, alliance.id, other.id)
                rows_view.append(
                    {
                        "id": other.id,
                        "name": other.name,
                        "tag": other.tag,
                        "members": len(other.members),
                        "relation": relation,
                    }
                )

            return render_template(
                "alliance_diplomacy.html",
                alliance=alliance,
                is_founder=is_founder,
                rows=rows_view,
            )

    @app.route("/alliance/<int:alliance_id>/diplomatie/set", methods=["POST"])
    @auth.login_required
    def alliance_diplomacy_set(alliance_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            alliance = s.get(Alliance, alliance_id)
            if alliance is None:
                flash("Alliance introuvable.", "error")
                return redirect(url_for("alliances_list"))

            try:
                target_id = int(request.form.get("target_id", 0))
                relation = request.form.get("relation", "")
            except (ValueError, TypeError):
                flash("Paramètres invalides.", "error")
                return redirect(url_for("alliance_diplomacy_page", alliance_id=alliance_id))

            target = s.get(Alliance, target_id)
            if target is None:
                flash("Alliance cible introuvable.", "error")
                return redirect(url_for("alliance_diplomacy_page", alliance_id=alliance_id))

            try:
                game_logic.set_diplomacy(s, alliance, target, user, relation)
                s.commit()
                flash(f"Relation avec {target.name} mise à jour : {relation}.", "success")
            except ValueError as e:
                s.rollback()
                flash(str(e), "error")
            return redirect(url_for("alliance_diplomacy_page", alliance_id=alliance_id))

    @app.route("/combat/<int:log_id>")
    @auth.login_required
    def combat_report(log_id: int):
        user = auth.current_user()
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            log = s.get(CombatLog, log_id)
            if log is None or log.player_id != player.id:
                flash("Rapport de combat introuvable.", "error")
                return redirect(url_for("campagnes"))

            units_sent_raw = json.loads(log.units_sent_json or "{}")
            units_lost_raw = json.loads(log.units_lost_json or "{}")
            sent_view = []
            for uid_str, count in units_sent_raw.items():
                unit = game_data.unit_by_id(int(uid_str))
                lost = units_lost_raw.get(uid_str, 0)
                sent_view.append(
                    {
                        "id": int(uid_str),
                        "name": unit["name_fr"] if unit else f"#{uid_str}",
                        "image": unit.get("image") if unit else None,
                        "sent": count,
                        "lost": lost,
                        "survivors": count - lost,
                    }
                )

            return render_template(
                "combat_report.html",
                player=player,
                log=log,
                sent_view=sent_view,
            )

    # ----- API ------------------------------------------------------------

    @app.route("/api/health")
    def health():
        return jsonify({"ok": True, "loaded": game_data.counts()})

    @app.route("/api/me")
    def api_me():
        user = auth.current_user()
        if user is None:
            return jsonify({"authenticated": False}), 401
        with SessionLocal() as s:
            player = s.query(Player).filter(Player.user_id == user.id).one()
            tick = game_logic.apply_production_tick(s, player)
            s.commit()
            return jsonify(
                {
                    "authenticated": True,
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "clan_id": user.clan_id,
                    },
                    "player": {
                        "level": player.level,
                        "xp": player.xp,
                        "reputation": player.reputation,
                        "gold": player.gold,
                        "wood": player.wood,
                        "mana": player.mana,
                        "spelt": player.spelt,
                    },
                    "rates_per_hour": tick["rates_per_hour"],
                }
            )

    @app.route("/api/data/units")
    def api_units():
        return jsonify(game_data.units)

    @app.route("/api/data/buildings")
    def api_buildings():
        return jsonify(game_data.buildings)

    @app.route("/api/data/clans")
    def api_clans():
        return jsonify(game_data.clans)

    @app.route("/api/data/dracos")
    def api_dracos():
        return jsonify(game_data.dracos)

    @app.route("/api/data/relics")
    def api_relics():
        return jsonify(game_data.relics)

    @app.route("/api/data/rules")
    def api_rules():
        return jsonify(game_data.rules)

    @app.route("/api/data/technologies")
    def api_technologies():
        return jsonify(game_data.technologies)

    @app.route("/api/data/items")
    def api_items():
        return jsonify(game_data.items)

    @app.route("/api/data/achievements")
    def api_achievements():
        return jsonify(game_data.achievements)

    @app.route("/api/data/weapons")
    def api_weapons():
        return jsonify(game_data.weapons)

    @app.route("/api/data/packs")
    def api_packs():
        return jsonify(game_data.packs)

    return app


if __name__ == "__main__":
    app = create_app()
    print("Woodwar Rebuild — Phase 2")
    print(f"Loaded: {game_data.counts()}")
    print("Running on http://localhost:5002")
    app.run(host="0.0.0.0", port=5002, debug=True)
