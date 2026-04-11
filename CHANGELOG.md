# Changelog — Woodwar Rebuild

Toutes les modifications notables du projet sont consignées ici. Format
inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Non publié]

### Session de développement autonome 2026-04-11

Démarrage d'une session de développement non-stop pour incorporer 7
features majeures.

#### Features 5 + 6 + 7 — Polish visuel, countdowns live, progress bars

**Added**
- `static/woodwar.js` — module vanilla JS (zéro dépendance) avec :
  - **Countdown** : transforme tout `<span data-countdown-until="ISO">`
    en compteur live mis à jour à la seconde, avec barre de progression
    optionnelle (via `data-countdown-from`) qui change de couleur
    (vert → jaune → rouge) à mesure que le temps approche.
    Reload automatique de la page sur fin si `data-countdown-reload`.
  - **ProgressBar** : tout élément avec `data-progress="42"` devient
    une barre de progression rendue avec gradient.
  - **ActionFeedback** : pulse animation sur `.ww-action` et spinner
    overlay sur `<form method="post">` pendant le submit.
  - Auto-init au DOMContentLoaded + `WW.refresh()` pour contenu injecté.
- Styles CSS associés (`static/style.css`) :
  - `.ww-cd-time`, `.ww-cd-bar`, `.ww-cd-bar-fill[data-zone]`
  - `.ww-progress`, `.ww-progress-fill`, `.ww-progress-label`
  - `.ww-action:hover`, `.ww-action-clicked`, `.ww-form-pending`
  - Transitions globales sur `.card`, `a`, `button`, inputs (focus glow)
  - Animation `ww-fade-in` sur les enfants directs de `.container`
- `base.html` charge `woodwar.js` en `defer`.
- `caserne.html` : la formation en cours utilise un countdown live
  + barre de progression + reload auto à la fin.
- `dashboard.html` : chaque bâtiment en cours d'amélioration affiche
  un countdown live + barre de progression + reload auto à la fin.
- `app.py` : expose `training_started_iso`, `training_completes_iso`,
  `upgrading_until_iso`, `upgrading_started_iso` dans les contextes.
  La date de début d'upgrade est reconstruite à partir de la durée
  d'origine (pas besoin de migration DB).

**Tests** : 41/41 OK

#### Feature 1 — Système d'ennemis (archétypes + IA + difficulté)

**Added**
- 5 archétypes d'ennemis dans `ENEMY_ARCHETYPES` : `kobold`, `ambusher`,
  `troll`, `wraith`, `boss`. Chacun avec `hp_mult`, `loot_mult`,
  `default_pattern`, `tier_min/max`.
- 5 patterns d'IA dans `AI_PATTERN_TUNING` :
  - `passive` — défense classique
  - `aggressive` — counter-attack 20% sur le joueur
  - `armored` — absorbe 30% des dégâts entrants
  - `evasive` — 20% de chance d'esquive totale
  - `regenerator` — soigne 15% du `pv_max` quand survit (boss)
- 3 nouvelles colonnes sur `KoboldCamp` : `archetype`, `ai_pattern`,
  `difficulty_tier` (1..5).
- Migration auto au démarrage : `db._ensure_schema()` ajoute les colonnes
  manquantes via ALTER TABLE (idempotent, safe pour les bases existantes).
- `seed_kobold_camps` étendu : chaque camp reçoit un archétype thématique
  selon son tier (kobolds bas tier, boss haut tier).
- `resolve_combat` honore le pattern : journal `ai_pattern_log`,
  `effective_damage` (vs `total_damage`), counter ratio, esquive,
  régénération.
- Page `/campagnes` affiche désormais 3 tags par camp : archétype,
  pattern IA, tier ★. Couleur shift par archétype (boss en rouge pulsé).
- Barre de progression HP sur les camps vivants (réutilise `data-progress`).
- Countdown live + reload sur les camps en respawn.
- `tests/test_enemies.py` (12 tests) : valide structure des archétypes,
  cohérence des patterns, distribution des tiers.

**Tests** : 53/53 OK · **Playtest** : green, 0 blockers

#### Feature 3 — Mode Campagne (acceptation + progression + récompenses)

**Added**
- Modèle `PlayerQuest` (player_id, quest_id, status, snapshot_value,
  objective_count, objective_type, accepted_at, claimed_at, frozen
  reward_gold + reward_xp). Status ∈ {active, claimable, claimed, abandoned}.
- `game_logic.QUEST_OBJECTIVE_FIELDS` mapping objective_type → counter joueur :
  - `train_units` → `total_units_trained`
  - `win_campaigns` → `pve_victories`
  - `win_pvp` → `total_victories - pve_victories` (computed)
  - `earn_gold/wood/mana` → `gold/wood/mana` (snapshot delta)
  - `build_level` → max niveau de bâtiment
  - `own_relic` → nombre de reliques
- Fonctions :
  - `accept_quest(player, quest_id)` — snapshot du compteur, status=active
  - `list_player_quests(player)` — auto-promote vers `claimable` quand
    la progression atteint l'objectif
  - `claim_quest_reward(player, pq_id)` — crédite gold + XP, status=claimed
  - `abandon_quest(player, pq_id)`
- Routes Flask :
  - `POST /quete/<quest_id>/accepter`
  - `POST /quete/<int:pq_id>/reclamer`
  - `POST /quete/<int:pq_id>/abandonner`
- UI sur `/rumeurs` :
  - Section "⚜ Vos quêtes en cours" en haut, avec barre de progression
    (réutilise `data-progress`) et bouton "Réclamer la récompense" qui
    pulse quand l'objectif est atteint
  - Boutons "Accepter la quête" sur chaque carte de quête disponible
  - Tags d'état (en cours, ★ objectif atteint, ✓ réclamée, abandonnée)
- `tests/test_quests.py` (7 tests) : accept/snapshot/progress/claim/abandon
  via une base SQLite in-memory pour pas polluer le dev DB.

**Tests** : 60/60 OK · **Playtest** : green, 0 blockers

#### Feature 2 — Mode PvP (matchmaking + cooldowns + anti-farm)

**Added**
- Modèle `PvPCooldown` (attacker_id, defender_id, last_attack_at,
  expires_at) avec contrainte unique sur la paire.
- Constants dans `game_logic` :
  - `PVP_TARGET_COOLDOWN_SEC = 1800` (30 min entre 2 attaques sur la
    même cible)
  - `PVP_ATTACKS_PER_HOUR = 10` (rate limit anti-farm global)
  - `PVP_MATCHMAKING_LEVEL_RANGE = 3` (±3 niveaux pour le matchmaking)
  - `PVP_MINIMUM_LEVEL = 1`
- Fonctions :
  - `can_attack_target(attacker, defender)` → (ok, reason_fr) — gate
    centralisée appelée par `resolve_pvp_combat` (cooldown, rate limit,
    diplomatie alliée, niveau min, self-attack)
  - `register_pvp_cooldown(attacker, defender)` — créé/refresh la ligne
    après un combat
  - `find_matchmaking_opponents(attacker)` — retourne les Seigneurs au
    rang ±3, hors cooldown, hors même alliance, triés par proximité de
    niveau puis richesse
  - `get_pvp_cooldown_view(attacker)` — snapshot du rate limit
  - `_pvp_cooldown_active`, `_pvp_attacks_last_hour` (helpers internes)
- Route `/pvp` : nouvelle page Arène avec :
  - Carte de l'état du rate limit (X / 10 attaques utilisées + barre de
    progression réutilisant `data-progress`)
  - Hint sur la fenêtre de niveau et le cooldown par cible
  - Liste de cibles recommandées avec clan coloré, niveau différentiel
    (+/-/=), ressources, total unités, formulaire d'attaque inline
- `/joueurs` toujours dispo pour parcourir tous les Seigneurs sans filtre
- Lien "Arène" dans la nav
- `resolve_pvp_combat` appelle maintenant `can_attack_target` au début et
  `register_pvp_cooldown` après une attaque
- `tests/test_pvp.py` (8 tests) : self-attack, cooldown, rate limit,
  matchmaking range, exclusion self/cooldown, view consistency

**Tests** : 68/68 OK · **Playtest** : green, 0 blockers

#### Feature 4 — Automatisation (auto-farm + build queue + scripts dev)

**Added — côté joueur**
- **Auto-farm** : `POST /auto_farm` attaque automatiquement jusqu'à
  10 camps Kobolds que le joueur peut vaincre sans perdre plus de 20%
  de son armée. Constants `AUTO_FARM_MAX_CAMPS=10`,
  `AUTO_FARM_MAX_LOSS_RATIO=0.20`.
  - Calcule le total damage de l'armée + relics + dracos
  - Sélectionne les camps vivants dont `pv_max <= 0.8 × total_damage`
  - Lance `resolve_combat` en boucle, agrège loot + losses
  - Bouton « ⚙ Auto-farm » dans `/campagnes` (banner orange en haut)
- **Build queue** : modèle `BuildQueueItem(player_id, building_id,
  position)`. Le joueur peut ajouter des bâtiments à une file qui se
  vide automatiquement.
  - `enqueue_build`, `dequeue_build`, `list_build_queue`
  - `process_build_queue` lancé par le tick loop ET par chaque visite
    du dashboard : si aucune upgrade en cours et qu'il y a une queue,
    démarre le prochain item si le joueur peut le payer
  - Bouton « ➕ File » sur chaque carte bâtiment du dashboard
  - Section « ⚙ File de construction automatique » sur le dashboard
    avec liste numérotée + bouton ✕ Retirer

**Added — côté dev**
- `scripts/seed_test_data.py` : crée 4 utilisateurs de test (test_alpha,
  test_beta, test_gamma, test_delta) avec différents niveaux/clans/armées
  pour avoir du contenu dans /joueurs et /pvp en dev. Idempotent.
  Mot de passe par défaut : `test`.
- `scripts/smoke_check.py` : check 1-commande qui lance :
  1. Le full unittest suite (77 tests)
  2. Le playtest simulator
  3. Smoke HTTP sur 10 endpoints clés (skip si serveur down)
  Exit code 0 si tout OK, 1 sinon. Idéal pour pre-commit ou CI.

**Refactor**
- `_background_tick_loop` appelle aussi `process_build_queue` pour
  chaque player à chaque tick (60s par défaut)

- `tests/test_automation.py` (9 tests) :
  - auto-farm without units → ValueError
  - constants in valid range
  - enqueue/dequeue/list build queue
  - invalid building_id → ValueError
  - dequeue other player's item → ValueError
  - process_queue starts next build, skips if busy, skips if unaffordable

**Tests** : 77/77 OK · **Playtest** : green, 0 blockers · **Smoke** : ✓

#### Bugfixes — `datetime.utcnow` deprecation + `auto-merge.yml`

**Fixed — `datetime.utcnow()` deprecation (Python 3.12+)**
- Nouveau module `utils.py` avec helper `utcnow()` qui retourne un
  `datetime` naive UTC via `datetime.now(timezone.utc).replace(tzinfo=None)`
  — zéro dépendance, zéro warning, API identique à l'ancien `datetime.utcnow()`.
- Migré les 47 occurrences réparties dans :
  - `models.py` : 17 `default=datetime.utcnow` → `default=utcnow`
  - `app.py` : 9 `datetime.utcnow()` → `utcnow()`
  - `game_logic.py` : 21 `datetime.utcnow()` → `utcnow()`
- Vérifié avec `python -W error::DeprecationWarning -m unittest discover tests`
  → 77/77 OK, zéro deprecation warning promu en erreur.
- Pas de migration DB nécessaire : `utcnow()` retourne toujours un naive
  UTC, parfaitement compatible avec les colonnes `DateTime` existantes
  (qui sont toutes naive).

**Fixed — `auto-merge.yml` ne se déclenchait jamais**
- Avant : workflow triggeré sur `pull_request`, mais l'agent du trigger
  faisait juste `git push` sur `claude/**` sans jamais appeler `gh pr create`
  → le workflow ne tournait jamais → 9 branches orphelines accumulées.
- Après : workflow triggeré sur `push: branches: claude/**`, avec pipeline :
  1. Checkout
  2. Install deps + run full unittest suite + playtest
  3. Étape `ensure_pr` : cherche une PR ouverte pour la branche ; si
     absente, la crée via `gh pr create` en tirant le titre/body du
     dernier commit
  4. Merge la PR (`gh pr merge --merge --delete-branch --admin`)
  5. Si l'une des étapes échoue, poste un commentaire sur la PR avec
     un lien vers les logs de l'action.
- Nettoyé les 9 branches `claude/*` orphelines via
  `git push origin --delete` (toutes redondantes, même fix déjà mergé).
- Le prochain run de l'agent nocturne devrait maintenant se merger
  automatiquement.

**Tests** : 77/77 OK · **Playtest** : green, 0 blockers

## [0.10.0] — 2026-04-11 — Bundle B + automatisation nocturne

### Added
- Suite de tests `tests/test_data.py` (21), `tests/test_logic.py` (9),
  `tests/test_routes.py` (11). Total : 41 tests verts.
- Simulateur playtest `scripts/playtest.py` — économie, combat, quest
  feasibility, content variety. Produit `data/generated/playtest_reports.json`.
- GitHub Actions :
  - `.github/workflows/ci.yml` — tests sur PR
  - `.github/workflows/auto-merge.yml` — auto-merge des branches `claude/*`
  - `.github/workflows/discord-notify.yml` — notifications Discord sur push
- Helper `scripts/discord_notify.py` (stdlib uniquement)
- Remote Trigger `Woodwar nightly improver` (toutes les heures)
- Génération automatique de contenu : 5 quêtes, 5 événements, 6 entrées lore
- Section "Événements qui rôdent" sur `/rumeurs`

### Fixed
- Blocker `qst_duel_maneldar` : `objective_count` 5 → 12 (cohérent avec
  le tier hard win_pvp ≥ 10), récompenses 6800 → 9200 or, 7400 → 9800 XP

### Known issues
- `auto-merge.yml` se déclenche `on: pull_request` mais l'agent du trigger
  fait `git push` sans créer de PR → workflow jamais déclenché. À fixer.

## [0.9.0] — Bundle B (Content & depth)

### Added
- Inventaire avec items utilisables
- Training timé (caserne)
- Espionnage (coût mana)
- Marché (échange ressources avec ratio 2:1)
- Buffs temporaires (`ActiveBuff`)
- Drops d'items sur victoires PvE

## [0.1.0 — 0.8.0] — Phases 0 à 9

Reconstruction complète du jeu PHP legacy Woodwar (2007-2012) en
Python/Flask/SQLAlchemy/SQLite. Phases : auth, clans, buildings, units,
combat, relics, alliances, diplomacy, seasons, achievements.
