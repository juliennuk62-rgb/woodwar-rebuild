// Boucle de jeu principale.
// Toutes les 100ms : check des plantes mûres, mise à jour du marché.
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { computeAllMarketPrices, getPlantStage } from './economy.js';

let intervalId = null;
let lastMarketUpdate = 0;

export function startGameLoop() {
  if (intervalId) return;
  // Init store si pas déjà fait
  const store = useGameStore.getState();
  if (!store.ready) {
    store.init();
  }
  // Premier prix de marché immédiat pour éviter l'écran "tout à 0"
  useGameStore.getState().setMarketPrices(computeAllMarketPrices(Date.now()));

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

  // 1) Rafraîchir les prix du marché (1×/sec)
  if (now - lastMarketUpdate >= GAME_CONFIG.marketUpdateMs) {
    store.setMarketPrices(computeAllMarketPrices(now));
    lastMarketUpdate = now;
  }

  // 2) Auto-vente des plantes matures. La logique replant/non-replant est
  //    gérée dans le store en fonction de la présence d'un jardinier.
  const ghId = store.activeGreenhouse;
  const gh = store.greenhouses[ghId];
  if (gh && gh.plants.length) {
    for (const plant of gh.plants) {
      const { stage } = getPlantStage(plant, now, gh);
      if (stage === 'mature') {
        store.harvestPlant(plant.slotId, { manual: false });
      }
    }
  }

  store.setLastTick(now);
}
