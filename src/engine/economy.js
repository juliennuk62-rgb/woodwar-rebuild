// Calculs économiques purs — pas d'effets de bord, testable.
import { PLANTS } from '../config/plants.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

// Multiplicateur de marché actuel — onde lente + bruit (GDD §06)
export function computeMarketMultiplier(time, seed = 0) {
  const wave = Math.sin(time * GAME_CONFIG.marketFrequency + seed) * GAME_CONFIG.marketAmplitude;
  // Bruit pseudo-déterministe pour que le marché soit stable d'un tick à l'autre
  const noiseSeed = Math.floor(time / 60000) + Math.floor(seed * 1000);
  const noise = (pseudoRandom(noiseSeed) - 0.5) * GAME_CONFIG.marketNoise;
  return Math.max(0.3, GAME_CONFIG.marketBase + wave + noise);
}

function pseudoRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function computeAllMarketPrices(time) {
  const prices = {};
  let i = 0;
  for (const id of Object.keys(PLANTS)) {
    prices[id] = computeMarketMultiplier(time, i * 1.7);
    i++;
  }
  return prices;
}

// État d'une plante en fonction du temps écoulé.
export function getPlantStage(plant, now = Date.now()) {
  const species = PLANTS[plant.speciesId];
  const elapsed = (now - plant.plantedAt) / 1000;
  const ratio = Math.min(1, elapsed / species.growTime);
  let stage = 'seed';
  if (ratio >= 1) stage = 'mature';
  else if (ratio >= 0.4) stage = 'growing';
  return { ratio, stage, elapsed, remaining: Math.max(0, species.growTime - elapsed) };
}

// Revenu prévisionnel d'une plante mature au prix de marché actuel.
export function computeRevenue(plant, marketPrices) {
  const species = PLANTS[plant.speciesId];
  const market = marketPrices[plant.speciesId] ?? 1.0;
  return Math.floor(species.baseRevenue * market);
}
