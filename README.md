# Le Jardin d'Agnès 🌱

> Idle tycoon botanique en 3D isométrique — navigateur, gratuit.

Tu incarnes Agnès, botaniste ambitieuse. À partir d'une modeste serre tempérée,
tu cultives, vends, croises et explores pour bâtir un empire floral mondial.

---

## État du projet

**Prompt 1 / 10 — Fondations & Architecture** ✅

- [x] Setup React 18 + Vite + Zustand + Three.js + R3F + break_infinity.js
- [x] Structure du projet conforme au GDD
- [x] gameConfig statique : 5 espèces de la Serre Tempérée
- [x] Store Zustand avec save/load localStorage + autosave 5s
- [x] Boucle de jeu (tick.js, économie, marché dynamique)
- [x] Scène 3D isométrique R3F (sol + 6 pots + plantes procédurales)
- [x] HUD HTML overlay (€, graines rares, saison, slots)
- [x] Plantation, croissance temps réel, auto-récolte, récolte manuelle bonus
- [x] Gains offline (capés à 12 h, efficacité 50 %)
- [x] Floating numbers
- [x] CI GitHub Pages

À venir : **Prompts 2 → 10** (modèles 3D détaillés, marché/météo, expéditions,
hybridation, prestige, quêtes, audio, lancement). Voir `docs/gdd.html`.

---

## Démarrer en local

```bash
npm install
npm run dev
```

Le jeu tourne sur `http://localhost:5173`.

## Build de production

```bash
npm run build
npm run preview
```

## Déploiement

Le workflow `.github/workflows/deploy.yml` publie automatiquement la branche
`main` sur GitHub Pages — accessible à
`https://juliennuk62-rgb.github.io/woodwar-rebuild/`.

> Pense à activer Pages dans **Settings → Pages → Source = GitHub Actions**
> au premier déploiement.

---

## Architecture

```
src/
├── config/      gameConfig, plants, greenhouses (statique)
├── store/       gameStore Zustand (état dynamique)
├── engine/      tick, économie, save/load, offline progress
├── three/       Scène R3F isométrique, pots, plantes procédurales
├── ui/          HUD, ShopPanel, OfflineModal, FloatingNumbers (HTML overlay)
├── utils/       formatage de nombres, wrapper Decimal
└── styles/      CSS global — palette du GDD §02
docs/
└── gdd.html     Game Design Document complet (référence)
```

## Stack

| Couche       | Lib                 | Pourquoi                                         |
|--------------|---------------------|--------------------------------------------------|
| Framework    | React 18 + Vite     | UI overlay rapide, HMR                           |
| State        | Zustand             | Léger, parfait pour idle games                   |
| 3D           | Three.js + R3F      | Scène isométrique navigateur                     |
| Big numbers  | break_infinity.js   | Préparer la croissance exponentielle des €       |
| Save         | localStorage        | MVP — cloud save (Supabase) prévu en V2          |

## Choix techniques

- **Caméra orthographique** position `[12, 12, 12]` zoom `48` — vue iso parfaite.
- **Tick logique 10 fps** (100 ms) — visuel à 60 fps via R3F. Évite de faire
  bouillir le CPU.
- **Plantes 100 % procédurales** en primitives Three.js (cylindre + sphères)
  pour rester sous les 500 polys/plante. Les vrais `.glb` arrivent en Prompt 2.
- **Toon-friendly** : `MeshLambertMaterial` partout, pas de PBR, pas d'ombres
  dynamiques — perfs garanties.
- **Pas de UI 3D** : tout le HUD est en HTML/CSS par-dessus le canvas
  (`position: fixed`).

---

Made with 🌿 — passion project, gratuit.
