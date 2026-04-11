# Woodwar Rebuild

Réécriture moderne du jeu Woodwar à partir de la spec extraite du code PHP legacy.

## Structure

```
rebuild/
├── app.py              # Application Flask + routes
├── db.py               # Configuration SQLAlchemy + SQLite
├── models.py           # Modèles ORM (User, Player, ...)
├── game_data.py        # Chargement des fichiers data/*.json
├── requirements.txt    # Dépendances Python
├── data/               # Règles du jeu (source de vérité)
│   ├── units.json      #   12 unités avec stats + coûts dérivés
│   ├── buildings.json  #   16 bâtiments
│   ├── clans.json      #   8 clans
│   ├── dracos.json     #   4 dracos
│   ├── relics.json     #   12 reliques
│   └── rules.json      #   constantes globales (config.php)
└── woodwar.db          # Base SQLite (créée au premier lancement)
```

## Démarrage

```bash
cd rebuild
pip install -r requirements.txt
python app.py
```

Le serveur écoute sur **http://localhost:5002** (port choisi pour ne pas entrer en conflit avec WoodwarBis sur 5001 ni Woodwar9 sur 5000).

## Endpoints actuels

| Route | Description |
|-------|-------------|
| `GET /` | Page d'accueil avec inventaire des données chargées |
| `GET /api/health` | Santé du serveur + compteurs |
| `GET /api/data/units` | Les 12 unités |
| `GET /api/data/buildings` | Les 16 bâtiments |
| `GET /api/data/clans` | Les 8 clans |
| `GET /api/data/dracos` | Les 4 dracos |
| `GET /api/data/relics` | Les 12 reliques |
| `GET /api/data/rules` | Constantes globales |

## Phases

Voir `../SPEC.md` pour la stratégie complète.

- **Phase 0** ✅ Extraction des données en JSON
- **Phase 1** ✅ Squelette Flask + SQLite + endpoints de lecture
- **Phase 2** ⏳ Auth (inscription, login, sessions)
- **Phase 3** ⏳ Ressources & production passive
- **Phase 4** ⏳ Bâtiments constructibles
- **Phase 5** ⏳ Unités et combat basique
- **Phase 6** ⏳ Alliances, reliques, dracos, contenu complet

## Conventions

- **Les données JSON de `data/` font foi** — si on veut modifier l'équilibrage, on modifie le JSON, pas le code.
- **Tous les prix d'unités sont calculés depuis `damage` et `defense`** via les formules documentées dans `data/units.json`.
- **Encoding** : UTF-8 partout. Les caractères `�` du code PHP original sont corrigés lors de l'extraction.
- **Pas de monétisation** dans le rebuild (PayPal, Allopass, CMI, SMS retirés).
- **Pas de Facebook** dans le rebuild (SDK, like buttons, invitations retirés).
