# Journal de nuit — Woodwar Rebuild

Ce fichier est le cahier de bord de l'agent d'amélioration continue. Chaque
run du trigger nocturne y ajoute une entrée pour raconter ce qu'il a fait,
pourquoi, et ce qui a marché.

Lis les dernières entrées avant de choisir ta priorité du run.

---

## Run 2026-04-11T02:00:00Z — Setup initial de l'automatisation

**Priorité choisie** : Infrastructure
**Cause** : Premier run nocturne — il faut poser les bases avant que l'agent
prenne le relais tout seul.

**Travail effectué (par humain + assistant)** :
- Suite de tests unittest : `tests/test_data.py` (21 tests), `tests/test_logic.py` (9 tests), `tests/test_routes.py` (11 tests). Total : 41 tests verts.
- Simulateur playtest : `scripts/playtest.py` — simule économie, combat, quests, variété. Produit `data/generated/playtest_reports.json`.
- GitHub Actions : `.github/workflows/ci.yml` (tests sur PR) et `.github/workflows/auto-merge.yml` (auto-merge des branches `claude/*` si tests verts).
- Nouveau prompt trigger : `scripts/nightly_trigger_prompt.md` — flux analyse → priorité → exécution → tests → commit → journal.
- Schedule trigger : passage de 1 run/jour à 1 run/heure.

**Tests** : 41/41 green
**Playtest** : yellow — 1 blocker mineur sur `qst_duel_maneldar` (win_pvp=5 est un peu léger pour hard tier, attendu >= 10)
**Commit** : (initial)

**Priorité suggérée pour le prochain run** : corriger `qst_duel_maneldar` (passer `objective_count` de 5 à 10 et ajuster la récompense proportionnellement).

---

## Run 2026-04-11T13:00:00Z — Blocker levé + événements + rumeurs + vitrine UI

**Priorité choisie** : 1 (blocker playtest) + 3 (contenu manquant) + 6 (polish UI)
**Cause** : Le playtest signalait un seul blocker — `qst_duel_maneldar` avec `win_pvp=5`
(trop facile pour hard tier, attendu ≥ 10). Par ailleurs, les compteurs variety
montraient `events=0` et `lore=0` : deux catégories de contenu entièrement vides.
Enfin la page `/rumeurs` n'affichait les événements que sous forme de compteur —
l'agent précédent avait posé le réservoir, il restait à ouvrir le robinet.

**Travail effectué** :
- **Blocker corrigé** : `qst_duel_maneldar` passe de 5 → 12 victoires PvP (au lieu
  de 10 minimum, un chiffre narrativement plus fort et raccord avec le motif des
  douze lunes d'acier). Récompenses rehaussées proportionnellement :
  `reward_gold` 6800 → 9200, `reward_xp` 7400 → 9800. Description et lore_hook
  réécrits pour intégrer le nouveau chiffre et un registre nominatif tenu par
  les bardes de Legamir.
- **5 événements générés** dans `data/generated/events.json` — narratifs français
  avec 3 choix chacun, effets d'économie et buffs variés :
  - `evt_caravane_thulmis` (neutral, weight 40) — marchand Blöstrom + Kobolds.
  - `evt_oracle_aura_vacillante` (hostile, weight 25) — Oracle Mazar d'Isorfidia,
    buff attack_power 1.25x / 48h.
  - `evt_festin_gaelyn` (peaceful, weight 60) — Lune Rousse, buff camp_wood 1.5x / 24h.
  - `evt_traitre_akkrongar` (hostile, weight 15) — bannière à trois lunes dans
    les marécages de l'Est.
  - `evt_bestiaire_amaraldor` (neutral, weight 30) — jeune Draco blessé, buff
    train_speed 1.4x / 7 jours.
- **6 entrées lore générées** dans `data/generated/lore.json` — une par catégorie
  (bulletin, prophétie, rumeur, chant, fable, + un second bulletin qui boucle
  narrativement sur la correction du Ban d'honneur des Maneldar) :
  - `lore_bulletin_tourelles_brouillard` — les Tourelles reprennent vie.
  - `lore_prophetie_baiser_fenrir` — le douzième Seigneur marqué par le givre.
  - `lore_rumeur_draco_albatre` — Draco blanc aperçu dans les cols Gleoryn.
  - `lore_chant_bucherons_langwen` — refrain des bûcherons repris par les Orghana.
  - `lore_fable_corbeau_argent` — conte Amaraldor, cent ans sans se poser.
  - `lore_bulletin_duel_maneldar` — correction officielle du ban (5 → 12), auto-
    référentielle avec le fix du blocker.
- **Polish UI** : nouvelle section « Événements qui rôdent » sur `/rumeurs`
  (`app.py:1273-1302`, `templates/rumeurs.html`, `static/style.css`). Affiche les
  6 événements les plus fortement pondérés avec titre, tag difficulté, narratif,
  et liste des choix possibles. Palette cohérente avec `.quest-*` et `.lore-*`
  (peaceful=vert, neutral=lien, hostile=rouge). Zéro nouvelle dépendance.
- **runs.json** mis à jour avec `run_20260411_events_lore_01` (theme=mixed,
  entries_added=11).

**Tests** : 41/41 green (test_data 16, test_logic 14, test_routes 11). Smoke test
manuel du endpoint `/rumeurs` authentifié : status 200, les sections
« Événements qui rôdent », Caravane de Thulmis, Aura vacillante, Tourelles du
Brouillard, et « douze rivaux » sont toutes présentes dans le HTML rendu.
**Playtest** : **green**, 0 blocker (contre 1 au run précédent).
**Commit** : (à venir)

**Priorité suggérée pour le prochain run** : camps Kobolds générés (camps=0
dans variety), puis items générés (items=0). Ou ajouter un test unitaire
dédié aux événements (`test_generated_events_follow_schema`) pour verrouiller
la structure des choix/effects comme c'est déjà fait pour les quêtes.

---

## Run 2026-04-11T22:00:00Z — Camps Kobolds + items générés

**Priorité choisie** : 3 (contenu sous-servi) — rotation camps + items
**Cause** : L'état du playtest est **green** (0 blocker), les tests passent
71/71, mais `variety.counts` montre toujours `camps=0` et `items=0`. Les deux
derniers runs ont touché quests puis mixed (events+lore) : c'est pile la
rotation parfaite pour attaquer les deux catégories encore vides, en
respectant la règle anti-répétition.

**Plan du run** (chaque étape = son propre commit vert) :
- **Étape 1** : Générer 5 camps Kobolds (biomes variés, archetypes + AI
  patterns + difficulty tiers pour exploiter le système de Phase 11).
- **Étape 2** : Générer 5 items nouveaux (id ≥ 100, buffs variés, durée
  et drop_weight cohérents).
- **Étape 3** : Ajouter un test unitaire dédié qui verrouille les champs
  obligatoires des camps et items générés (pv_max 300-100k, buff_effect
  dans la liste blanche, buff_multiplier 0.5-2.5).

### Étape 1 — Commit de démarrage — ✅
### Étape 2 — 5 camps Kobolds générés — ✅

Cinq camps couvrant les cinq biomes, avec une progression tier 1→5 et
chacun son archetype + ai_pattern distinct :

- `camp_bourbier_blostrom` — marécage, kobold/passive, tier 1, pv 1800,
  lié au marchand Blöstrom (évt_caravane_thulmis).
- `camp_clairiere_eolric` — forêt, ambusher/evasive, tier 2, pv 5200,
  clin d'œil au druide Eolric (rumeurs, festin Gaelyn).
- `camp_brume_isorfidia` — brouillard, wraith/aggressive, tier 3,
  pv 12000, résonne avec l'évt Aura vacillante.
- `camp_nid_vank` — montagnes, troll/armored, tier 4, pv 22000,
  nom hommage au chef Vank des Maneldar.
- `camp_forteresse_akkrongar` — fortifié, boss/regenerator, tier 5,
  pv 48000, ancre narrative du Traître Akkrongär (voir evt_traitre et
  prophétie Maneldar). Loot 14500/3200/2800.

Chaque camp a un backstory_fr de 4-6 phrases qui tisse des liens avec
les quêtes, événements et rumeurs déjà générés. Les archetypes/patterns
utilisent exactement le vocabulaire d'ENEMY_ARCHETYPES + AI_PATTERN_TUNING
de game_logic.py pour permettre une intégration future dans seed_kobold_camps.

### Étape 3 — 6 items générés — ✅

Six items ajoutés à `data/generated/items.json` (id 100-105), un par
`buff_effect` de la whitelist (train_speed, attack_power, camp_gold,
camp_wood, camp_mana, fret_capacity) :

- `100 Cor de Legamir` — train_speed 1.5x / 1h (drop 6).
- `101 Hache votive des Orghana` — attack_power 1.35x / 40min (drop 5).
- `102 Bourse d'écaille Draco` — camp_gold 1.9x / 30min (drop 3, rare).
- `103 Scie runique de Thulmis` — camp_wood 1.7x / 1h (drop 5).
- `104 Reliquaire d'Isorfidia` — camp_mana 2.5x / 20min (drop 2, légendaire).
- `105 Harnais de portage Gleoryn` — fret_capacity 1.8x / 1h30 (drop 4).

Les multiplicateurs restent dans [0.5, 2.5], les durées dans [60, 7200],
et chaque item cite un clan ou un lieu du lore établi. GameData.__init__
les fusionne automatiquement dans `items['items']` via la boucle déjà en
place dans game_data.py:75-77 — aucune modif du code de chargement n'a
été nécessaire.

### Étape 4 — Tests unitaires dédiés camps + items — ✅

Deux nouveaux tests dans `tests/test_data.py` pour verrouiller les
schémas qu'on vient de remplir :

- `test_generated_camps_follow_schema` — vérifie l'unicité des ids, la
  présence de name_fr, pv_max int dans [300, 100000], et quand ils sont
  renseignés : archetype ∈ {kobold, ambusher, troll, wraith, boss},
  ai_pattern ∈ {passive, aggressive, armored, evasive, regenerator},
  difficulty_tier ∈ [1, 5]. Les whitelists sont copiées 1:1 depuis
  game_logic.py (ENEMY_ARCHETYPES, AI_PATTERN_TUNING).
- `test_generated_items_follow_schema` — vérifie l'unicité des ids, la
  présence de name_fr, et pour tout item qui déclare un buff : effect
  dans la whitelist, multiplier dans [0.5, 2.5], duration dans [60, 7200],
  drop_weight dans [1, 10].

Total tests : 77 → 79 (deux nouveaux). Tous les camps et items du run
actuel passent ces tests, et tout futur run qui violerait un de ces
invariants sera bloqué au niveau du CI avant merge.

**Tests finaux** : 79/79
**Playtest final** : green, 0 blocker
**Total commits** : 5 (1 démarrage + 3 étapes + 1 clôture)

---
