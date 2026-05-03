// Boucle de jeu principale : 10 fps logique (100 ms).
//   1. Marché : recalcule les prix toutes les 5 s avec pression d'offre + historique
//   2. Météo : tirage d'un nouvel épisode toutes les ~90 s
//   3. Saisons : transition du cycle toutes les 10 min réelles
//   4. Plantes : auto-vente à maturité (replant auto si jardinier)
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { getPlantStage } from './economy.js';
import { marketTick, MARKET_TICK_MS } from '../mechanics/market.js';
import {
  SEASON_DURATION_MS,
  WEATHER_DURATION_MS,
  nextSeason,
  pickWeatherForSeason,
} from '../mechanics/weather.js';

let intervalId = null;
let lastMarketUpdate = 0;

export function startGameLoop() {
  if (intervalId) return;
  const store = useGameStore.getState();
  if (!store.ready) store.init();

  // Tick initial du marché : sinon les prix démarrent vides
  bumpMarket(Date.now());
  intervalId = setInterval(tick, GAME_CONFIG.tickIntervalMs);
}

export function stopGameLoop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function tick() {
  const now = Date.now();
  const store = useGameStore.getState();

  // ── 1. Marché ──────────────────────────────────────────────
  if (now - lastMarketUpdate >= MARKET_TICK_MS) {
    bumpMarket(now);
    lastMarketUpdate = now;
  }

  // ── 2. Météo ───────────────────────────────────────────────
  if (now >= (store.market.weatherEndsAt ?? 0)) {
    const newWeather = pickWeatherForSeason(store.market.currentSeason);
    store.patchMarket({
      weather: newWeather,
      weatherEndsAt: now + WEATHER_DURATION_MS,
    });
  }

  // ── 3. Saison ──────────────────────────────────────────────
  if (now >= (store.market.seasonEndsAt ?? 0)) {
    const newSeason = nextSeason(store.market.currentSeason);
    store.patchMarket({
      currentSeason: newSeason,
      seasonStartedAt: now,
      seasonEndsAt: now + SEASON_DURATION_MS,
      weather: pickWeatherForSeason(newSeason),
      weatherEndsAt: now + WEATHER_DURATION_MS,
    });
  }

  // ── 4. Auto-vente des plantes matures dans TOUTES les serres débloquées
  for (const ghId of Object.keys(store.greenhouses)) {
    const gh = store.greenhouses[ghId];
    if (!gh.unlocked || !gh.plants.length) continue;
    for (const plant of gh.plants) {
      const { stage } = getPlantStage(plant, now, gh, store);
      if (stage === 'mature') {
        store.harvestPlant(plant.slotId, { manual: false, greenhouseId: ghId });
      }
    }
  }

  // ── 5. Recherche : finalisation auto quand le timer expire
  if (store.research.inProgress && now >= store.research.inProgress.endsAt) {
    store.completeResearch();
  }

  // ── 6. Lab (hybridation) : finalisation auto. Une découverte sera proposée
  //    automatiquement via currentDiscovery.
  for (const job of store.lab.active ?? []) {
    if (now >= job.endsAt) {
      store.completeHybridization(job.id);
      break; // une seule par tick — la modale s'affichera
    }
  }

  // ── 7. Quêtes : reset journalier des dailies
  store.refreshDailiesIfNeeded();

  // ── 8. Abeille dorée : spawn / auto-dismiss / expiration du boost
  //   · spawn aléatoire si l'instant prévu est arrivé et qu'aucune abeille
  //     n'est déjà à l'écran
  //   · auto-dismiss après beeLifetimeMs si le joueur n'a pas cliqué
  //   · reset du boost dès qu'il a expiré (sinon ×2 fantôme)
  if (!store.bee && now >= (store.nextBeeAt ?? 0)) {
    store.spawnBee();
  } else if (store.bee && now - store.bee.spawnedAt > GAME_CONFIG.beeLifetimeMs) {
    store.dismissBee();
  }
  if (store.activeBoost && store.activeBoost.endsAt <= now) {
    useGameStore.setState({ activeBoost: null });
  }

  // ── 9. Auto-arrosoir : 1 clic toutes les 5 s tant qu'il est possédé.
  // On stocke `_lastAutoWaterAt` directement sur l'objet store (champ
  // volatile, pas dans le state visible — ne sera pas re-render).
  if (store.autoWaterer) {
    const last = store._lastAutoWaterAt ?? 0;
    if (now - last >= 5000) {
      store.clickWater();
      store._lastAutoWaterAt = now;
    }
  }

  // ── 10. Expéditions : réclamées manuellement par le joueur (pas ici).
  // (Le tapis roulant tourne sur sa propre boucle dans la page sandbox,
  //  cf. src/sandbox/. Pas branché sur le jeu principal.)
  store.setLastTick(now);
}

function bumpMarket(now) {
  const store = useGameStore.getState();
  const result = marketTick(store.market, now);
  store.patchMarket(result);
}
