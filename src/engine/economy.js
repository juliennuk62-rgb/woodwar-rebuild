// Calculs économiques purs — sans effet de bord, testables.
// GDD §06 (Devises & Économie) + §07 (Mécaniques) + Prompt 3 + Prompt 4.
import { PLANTS } from '../config/plants.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { GARDENERS } from '../config/gardeners.js';
import { UPGRADE_TYPES } from '../config/upgrades.js';
import {
  getSeasonMultiplier,
  getSeasonRevenueMultiplier,
  getSeasonGrowthMultiplier,
  getWeatherEffect,
} from '../mechanics/weather.js';

// ─── Marché ───────────────────────────────────────────────────
export function computeMarketMultiplier(time, seed = 0) {
  const wave = Math.sin(time * GAME_CONFIG.marketFrequency + seed) * GAME_CONFIG.marketAmplitude;
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

// ─── État d'une plante en croissance ─────────────────────────
// `greenhouse` est optionnel : si fourni, on applique l'upgrade lighting
// pour réduire le temps de pousse (sinon on prend le growTime de base).
export function getPlantStage(plant, now = Date.now(), greenhouse = null) {
  const growTime = greenhouse
    ? getGrowTime(plant.speciesId, greenhouse)
    : PLANTS[plant.speciesId].growTime;
  const elapsed = (now - plant.plantedAt) / 1000;
  const ratio = Math.min(1, elapsed / growTime);
  let stage = 'seed';
  if (ratio >= 1) stage = 'mature';
  else if (ratio >= 0.4) stage = 'growing';
  return { ratio, stage, elapsed, remaining: Math.max(0, growTime - elapsed) };
}

// ─── Multiplicateurs ─────────────────────────────────────────
// Lighting : réduit growTime
export function getGrowTime(speciesId, greenhouse) {
  const species = PLANTS[speciesId];
  if (!greenhouse) return species.growTime;
  const lightLevel = greenhouse.upgrades?.lighting ?? 0;
  const reduction = lightLevel * UPGRADE_TYPES.lighting.effectPerLevel;
  return species.growTime * Math.max(0.4, 1 - reduction);
}

// Bonus manuel : +25% de base + bonus irrigation
export function getManualBonus(greenhouse) {
  const irrigationLevel = greenhouse?.upgrades?.irrigation ?? 0;
  return 0.25 + irrigationLevel * UPGRADE_TYPES.irrigation.effectPerLevel;
}

// Revenu : climate × soil × prestige
export function getUpgradeMultiplier(greenhouse) {
  const climateLevel = greenhouse?.upgrades?.climate ?? 0;
  const soilLevel = greenhouse?.upgrades?.soil ?? 0;
  const climate = 1 + climateLevel * UPGRADE_TYPES.climate.effectPerLevel;
  const soil = 1 + soilLevel * UPGRADE_TYPES.soil.effectPerLevel;
  return climate * soil;
}

export function getPrestigeMultiplier(greenhouse) {
  const tokens = greenhouse?.prestige?.tokens ?? 0;
  return 1 + tokens * 0.02; // +2% par token (GDD §06)
}

// Bonus jardiniers pour une espèce donnée — somme additive
export function getGardenerBonus(greenhouse, speciesId) {
  if (!greenhouse?.gardeners?.length) return 0;
  let bonus = 0;
  for (const gid of greenhouse.gardeners) {
    const g = GARDENERS[gid];
    if (g?.speciesBonus?.[speciesId]) bonus += g.speciesBonus[speciesId];
  }
  return bonus;
}

// Y a-t-il au moins un jardinier embauché dans cette serre ?
// Sert à savoir si le slot est replanté automatiquement après vente.
export function hasAnyGardener(greenhouse) {
  return (greenhouse?.gardeners?.length ?? 0) > 0;
}

// ─── Revenu d'une vente ──────────────────────────────────────
// `marketState` = { prices, currentSeason, weather } — `marketPrices` accepté
// aussi pour la rétro-compat. Le revenu prend en compte saison + météo.
export function computePlantRevenue(plant, greenhouse, marketState, opts = {}) {
  const species = PLANTS[plant.speciesId];
  const prices = marketState?.prices ?? marketState ?? {};
  const season = marketState?.currentSeason ?? 'spring';
  const weather = marketState?.weather ?? 'sunny';

  const market = prices[plant.speciesId] ?? 1.0;
  const upgrade = getUpgradeMultiplier(greenhouse);
  const prestige = getPrestigeMultiplier(greenhouse);
  const gardener = 1 + getGardenerBonus(greenhouse, plant.speciesId);
  const manual = opts.manual ? 1 + getManualBonus(greenhouse) : 1;
  const seasonGlobal = getSeasonRevenueMultiplier(season);
  const seasonSpecies = 1 + getSeasonMultiplier(plant.speciesId, season);
  const weatherBonus = 1 + getWeatherEffect(weather).revenueBonus;

  return Math.floor(
    species.baseRevenue *
    market *
    upgrade *
    prestige *
    gardener *
    manual *
    seasonGlobal *
    seasonSpecies *
    weatherBonus
  );
}

// ─── Revenu prévisionnel par seconde ─────────────────────────
// Pour afficher un €/s dans le HUD : on simule le revenu horaire de chaque plante
// et on divise par son cycle complet.
export function computeIncomePerSecond(greenhouse, marketState) {
  if (!greenhouse?.plants?.length) return 0;
  let total = 0;
  for (const plant of greenhouse.plants) {
    const grow = getGrowTime(plant.speciesId, greenhouse);
    const revenue = computePlantRevenue(plant, greenhouse, marketState, { manual: false });
    // Sans jardinier : la plante ne se replante pas, donc le revenu n'est pas continu.
    // On l'inclut quand même comme estimation "par cycle moyen" — c'est l'idée d'un
    // tycoon : "potentiellement ce que tu peux faire en €/s si tu replantes".
    total += revenue / grow;
  }
  return total;
}

// ─── Coûts (graines, jardiniers, upgrades) ────────────────────
// cost(n) = baseCost × 1.08^owned (GDD §06)
export function computeCost(speciesId, owned) {
  const plant = PLANTS[speciesId];
  return Math.ceil(plant.seedCost * Math.pow(GAME_CONFIG.seedCostGrowth, owned));
}

// Coût pour acheter `quantity` graines d'un coup, formule fermée :
// somme géométrique : baseCost × r^owned × (r^q - 1) / (r - 1)
export function computeBulkCost(speciesId, owned, quantity) {
  const plant = PLANTS[speciesId];
  const r = GAME_CONFIG.seedCostGrowth;
  if (quantity <= 0) return 0;
  if (r === 1) return Math.ceil(plant.seedCost * quantity);
  const sum = (Math.pow(r, quantity) - 1) / (r - 1);
  return Math.ceil(plant.seedCost * Math.pow(r, owned) * sum);
}

// Combien de graines on peut s'offrir avec `budget` euros, partant de `owned`.
// Inversion de la formule géométrique. Renvoie 0 si rien d'achetable.
export function computeMaxAffordable(speciesId, owned, budget) {
  const plant = PLANTS[speciesId];
  const r = GAME_CONFIG.seedCostGrowth;
  const c0 = plant.seedCost * Math.pow(r, owned);
  if (budget < c0) return 0;
  // budget >= c0 × (r^q - 1) / (r - 1)  →  q <= log_r(1 + budget × (r-1)/c0)
  const q = Math.floor(Math.log(1 + (budget * (r - 1)) / c0) / Math.log(r));
  return Math.max(0, q);
}

// ─── Prestige ────────────────────────────────────────────────
export function computePrestigeTokens(lifetimeEarned) {
  return Math.floor(Math.sqrt(Math.max(0, lifetimeEarned)));
}
