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

  // ── 4. Auto-vente des plantes matures ──────────────────────
  const ghId = store.activeGreenhouse;
  const gh = store.greenhouses[ghId];
  if (gh && gh.plants.length) {
    for (const plant of gh.plants) {
      const { stage } = getPlantStage(plant, now, gh, store);
      if (stage === 'mature') {
        store.harvestPlant(plant.slotId, { manual: false });
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

  // ── 7. Expéditions : réclamées manuellement par le joueur (pas ici).
  store.setLastTick(now);
}

function bumpMarket(now) {
  const store = useGameStore.getState();
  const result = marketTick(store.market, now);
  store.patchMarket(result);
}
