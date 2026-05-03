# Le Jardin d'Agnès 🌱

> Idle tycoon botanique en 3D isométrique — navigateur, gratuit.

Tu incarnes Agnès, botaniste ambitieuse. À partir d'une modeste serre tempérée,
tu cultives, vends, croises et explores pour bâtir un empire floral mondial.

**Joue maintenant :** [juliennuk62-rgb.github.io/woodwar-rebuild](https://juliennuk62-rgb.github.io/woodwar-rebuild/)

---

## Statut — Tous les Prompts livrés (1 → 10) ✅

| # | Prompt | État |
|---|---|---|
| 1 | Fondations & Architecture | ✅ |
| 2 | Scène 3D Isométrique | ✅ |
| 3 | Core Loop Complet (jardiniers, upgrades) | ✅ |
| 4 | Marché Dynamique & Météo / Saisons | ✅ |
| 5 | Onboarding & UI Polish | ✅ |
| 6 | Expéditions | ✅ |
| 7 | Hybridation & Labo | ✅ |
| 8 | Serres 2-4 & Prestige | ✅ |
| 9 | Quêtes & Analytics | ✅ |
| 10 | Audio, Sécurité, Lancement | ✅ |

---

## Démarrer en local

```bash
npm install
npm run dev      # serveur de dev sur http://localhost:5173
npm run build    # build de production dans dist/
npm run preview  # preview du build sur http://localhost:4173
```

## Déploiement

Le workflow `.github/workflows/deploy.yml` publie automatiquement la branche
`main` sur GitHub Pages.

**Premier déploiement** : Repo → Settings → Pages → Source = GitHub Actions.

URL finale : `https://juliennuk62-rgb.github.io/woodwar-rebuild/`

---

## Architecture

```
src/
├── config/      gameConfig, plants, greenhouses, gardeners, upgrades,
│                expeditions, quests (statique)
├── store/       gameStore Zustand (état dynamique global)
├── engine/      tick, économie, save/load, offline progress, prestige
├── mechanics/   weather, market, expeditions, hybridation, research, quests
├── three/       Scène R3F isométrique, plantes procédurales, particules,
│                contrôles caméra
├── ui/          HUD, panels (shop, gardeners, upgrades, market, expeditions,
│                lab, quests, settings), modales (offline, discovery, prestige),
│                onboarding, greenhouse selector
├── audio/       audioManager (Web Audio API SFX synthétisés)
├── utils/       formatage, checksum SHA-256, migration save, analytics, decimal
└── styles/      CSS global — palette du GDD §02
docs/
└── gdd.html     Game Design Document complet (référence)
```

## Stack

| Couche       | Lib                       | Rôle                                              |
|--------------|---------------------------|---------------------------------------------------|
| Framework    | React 18 + Vite           | UI overlay, HMR rapide                            |
| State        | Zustand                   | Store global, léger, idéal idle game              |
| 3D           | Three.js + React Three Fiber + Drei | Scène isométrique navigateur            |
| Big numbers  | break_infinity.js         | Préparation croissance exponentielle              |
| Audio        | Web Audio API (natif)     | SFX synthétisés (oscillateurs + ADSR)             |
| Sécurité     | SubtleCrypto SHA-256      | Checksum d'intégrité du save                      |
| Save         | localStorage              | MVP — cloud save (Supabase) prévu en V2           |

## Choix techniques

- **Caméra orthographique** position `[12, 12, 12]`, regarde l'origine.
  Zoom adaptatif selon la taille de la fenêtre.
- **Tick logique 10 Hz** (100 ms) pour la production. Visuel à 60 fps via R3F.
- **Plantes procédurales** en primitives Three.js avec **toon shading**
  (MeshToonMaterial + gradient 3 niveaux) — moins de 500 polys/plante.
- **Pas de UI 3D** : tout l'overlay est en HTML/CSS au-dessus du canvas.
- **Audio synthétisé** : aucun fichier .webm à fournir. Les SFX sont
  produits par Web Audio API (oscillateurs + enveloppe ADSR + jitter pitch).
- **Anti-cheat basique** : checksum SHA-256 du save. Détection de tampering
  loggée en console (la save est conservée pour ne pas pénaliser un faux
  positif).

## Audio synthétisé (Prompt 10)

Les 7 SFX du GDD sont générés à la volée :

| Event       | Composition                                              |
|-------------|----------------------------------------------------------|
| plant       | triangle 660 Hz, ADSR rapide, ±5% pitch                  |
| harvest     | sine 880 → 660 Hz (delay 60 ms), ±5% pitch               |
| upgrade     | triangle C5 → E5 → G5 ascendant                          |
| gardener    | accord majeur G3 + B3 + D4                               |
| prestige    | fanfare C5 → E5 → G5 → C6                                |
| quest       | sine F5 → C6                                             |
| expedition  | sawtooth A3 + E4 (style aventure)                        |

Réglages disponibles dans ⚙️ Réglages : volumes SFX/musique, mute global,
respect de `prefers-reduced-motion`.

## Sauvegarde

- Stockée dans `localStorage` : clé `jardin-agnes:save:v1` (+ `:hash`)
- Autosave toutes les 5 s + à `beforeunload`
- Export/import via Réglages (JSON copié dans presse-papier)
- Migration automatique entre versions via `utils/migrate.js`
- Vérification d'intégrité SHA-256 (en arrière-plan, non-bloquante)

## Checklist de lancement (GDD Prompt 10)

- [x] Save/load avec rechargement de page
- [x] Offline earnings cap 12h
- [x] `prefers-reduced-motion` respecté
- [x] Build production passe : `npm run build`
- [x] Audio synthétisé fonctionne au premier clic (autoplay policy)
- [x] Checksum SHA-256 sur le save
- [x] Migration squelette pour future v2
- [ ] Tests cross-browser (Chrome iOS / Android) — à valider
- [ ] Intégration GameAnalytics réelle — `utils/analytics.js` est prêt à
      brancher

---

Made with 🌿 — passion project, gratuit.
