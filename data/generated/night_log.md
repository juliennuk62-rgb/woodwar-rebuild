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
