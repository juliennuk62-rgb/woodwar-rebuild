// Calculs économiques purs — sans effet de bord, testables.
// GDD §06 (Devises & Économie) + §07 (Mécaniques) + Prompt 3, 4, 7.
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
import { getResearchBonuses } from '../mechanics/research.js';
import { TRAITS } from '../mechanics/hybridation.js';
import { getAchievementBonus } from '../mechanics/quests.js';

// Helper unifié : récupère les données d'une espèce (native PLANTS ou hybride).
// `state` est optionnel : si non fourni, on ne regarde que PLANTS.
export function getSpeciesData(speciesId, state) {
  return PLANTS[speciesId] ?? state?.hybrids?.[speciesId] ?? null;
}

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
// `greenhouse` et `state` sont optionnels : si fournis, on applique
// les upgrades + bonus de recherche pour réduire le temps de pousse.
export function getPlantStage(plant, now = Date.now(), greenhouse = null, state = null) {
  const sp = getSpeciesData(plant.speciesId, state);
  const baseGrow = sp?.growTime ?? 60;
  const growTime = greenhouse
    ? getGrowTime(plant.speciesId, greenhouse, state)
    : baseGrow;
  const elapsed = (now - plant.plantedAt) / 1000;
  const ratio = Math.min(1, elapsed / growTime);
  let stage = 'seed';
  if (ratio >= 1) stage = 'mature';
  else if (ratio >= 0.4) stage = 'growing';
  return { ratio, stage, elapsed, remaining: Math.max(0, growTime - elapsed) };
}

// ─── Multiplicateurs ─────────────────────────────────────────
// growTime appliqué : lighting (-10% par niveau) × recherche × saison × météo.
// Le trait "fast_grower" d'un hybride est déjà appliqué directement dans son
// hybrid.growTime quand il est créé.
export function getGrowTime(speciesId, greenhouse, state) {
  const species = getSpeciesData(speciesId, state);
  if (!species) return 60;
  const lightLevel = greenhouse?.upgrades?.lighting ?? 0;
  const lightReduction = lightLevel * UPGRADE_TYPES.lighting.effectPerLevel;
  const research = state?.research?.unlocked ?? [];
  const researchReduction = getResearchBonuses(research).growTimeReduction;
  // Saison & météo : printemps +10% pousse → growTime / 1.10 ; hiver -20% → ×1.25
  const season = state?.market?.currentSeason ?? 'spring';
  const weather = state?.market?.weather ?? 'sunny';
  const seasonGrowth = getSeasonGrowthMultiplier(season);
  const weatherGrowth = 1 + (getWeatherEffect(weather).growthBonus ?? 0);
  const growthMul = Math.max(0.4, seasonGrowth * weatherGrowth);
  const factor = (1 - lightReduction) * (1 - researchReduction) / growthMul;
  return species.growTime * Math.max(0.15, factor);
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

// `state` (optionnel) permet d'appliquer le boost achievements
// (a_prestige_*) au multiplicateur prestige effectif.
export function getPrestigeMultiplier(greenhouse, state = null) {
  const tokens = greenhouse?.prestige?.tokens ?? 0;
  const base = 1 + tokens * 0.02; // +2% par token (GDD §06)
  if (!state) return base;
  const boost = 1 + (getAchievementBonus(state?.quests?.claimed ?? {}).prestigeMultiplierBonus ?? 0);
  return base * boost;
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
// aussi pour la rétro-compat. Le revenu prend en compte saison + météo + recherche.
// `state` est optionnel : permet d'accéder aux hybrides + bonus recherche.
export function computePlantRevenue(plant, greenhouse, marketState, opts = {}, state = null) {
  const species = getSpeciesData(plant.speciesId, state);
  if (!species) return 0;

  const prices = marketState?.prices ?? marketState ?? {};
  const season = marketState?.currentSeason ?? 'spring';
  const weather = marketState?.weather ?? 'sunny';

  let market = prices[plant.speciesId] ?? 1.0;
  // Trait "fragrant" : marché jamais < 1.0
  const traitId = species.trait;
  if (traitId && TRAITS[traitId]?.marketFloor) {
    market = Math.max(market, TRAITS[traitId].marketFloor);
  }

  const upgrade = getUpgradeMultiplier(greenhouse);
  const prestige = getPrestigeMultiplier(greenhouse, state);
  const gardener = 1 + getGardenerBonus(greenhouse, plant.speciesId);
  const manual = opts.manual ? 1 + getManualBonus(greenhouse) : 1;
  const seasonGlobal = getSeasonRevenueMultiplier(season);
  const seasonSpecies = 1 + getSeasonMultiplier(plant.speciesId, season);
  const weatherBonus = 1 + getWeatherEffect(weather).revenueBonus;
  const research = state?.research?.unlocked ?? [];
  const researchBonus = 1 + getResearchBonuses(research).revenueBonus;
  const achievementBonus = 1 + (getAchievementBonus(state?.quests?.claimed ?? {}).revenueBonus ?? 0);
  const permanentBonus = 1 + (state?.permanentBonuses?.revenueBonus ?? 0);

  return Math.floor(
    species.baseRevenue *
    market *
    upgrade *
    prestige *
    gardener *
    manual *
    seasonGlobal *
    seasonSpecies *
    weatherBonus *
    researchBonus *
    achievementBonus *
    permanentBonus
  );
}

// ─── Revenu prévisionnel par seconde ─────────────────────────
export function computeIncomePerSecond(greenhouse, marketState, state = null) {
  if (!greenhouse?.plants?.length) return 0;
  let total = 0;
  for (const plant of greenhouse.plants) {
    const grow = getGrowTime(plant.speciesId, greenhouse, state);
    const revenue = computePlantRevenue(plant, greenhouse, marketState, { manual: false }, state);
    total += revenue / grow;
  }
  return total;
}

// Slots effectifs : base + bonus recherche (slots_1/2/3 cumulent +2/+6/+12)
export function getEffectiveSlots(greenhouse, state = null) {
  if (!greenhouse) return 0;
  const base = greenhouse.slots ?? 0;
  const research = state?.research?.unlocked ?? [];
  const extra = getResearchBonuses(research).extraSlots;
  return base + extra;
}

// ─── Coûts (graines, jardiniers, upgrades) ────────────────────
// cost(n) = baseCost × 1.08^owned (GDD §06).
// Pour les hybrides (state.hybrids), on a besoin de `state` pour résoudre
// l'espèce — le call site est responsable de le fournir.
export function computeCost(speciesId, owned, state) {
  const plant = getSpeciesData(speciesId, state);
  if (!plant) return Infinity;
  // Trait "eternal" sur un hybride : coût fixe, jamais d'inflation.
  if (plant.trait === 'eternal') return Math.ceil(plant.seedCost);
  return Math.ceil(plant.seedCost * Math.pow(GAME_CONFIG.seedCostGrowth, owned));
}

// Coût pour acheter `quantity` graines d'un coup (formule fermée).
export function computeBulkCost(speciesId, owned, quantity, state) {
  const plant = getSpeciesData(speciesId, state);
  if (!plant || quantity <= 0) return 0;
  if (plant.trait === 'eternal') return Math.ceil(plant.seedCost * quantity);
  const r = GAME_CONFIG.seedCostGrowth;
  if (r === 1) return Math.ceil(plant.seedCost * quantity);
  const sum = (Math.pow(r, quantity) - 1) / (r - 1);
  return Math.ceil(plant.seedCost * Math.pow(r, owned) * sum);
}

// Combien de graines on peut s'offrir avec `budget` euros, partant de `owned`.
export function computeMaxAffordable(speciesId, owned, budget, state) {
  const plant = getSpeciesData(speciesId, state);
  if (!plant) return 0;
  if (plant.trait === 'eternal') {
    return Math.max(0, Math.floor(budget / plant.seedCost));
  }
  const r = GAME_CONFIG.seedCostGrowth;
  const c0 = plant.seedCost * Math.pow(r, owned);
  if (budget < c0) return 0;
  const q = Math.floor(Math.log(1 + (budget * (r - 1)) / c0) / Math.log(r));
  return Math.max(0, q);
}

// ─── Prestige ────────────────────────────────────────────────
export function computePrestigeTokens(lifetimeEarned) {
  return Math.floor(Math.sqrt(Math.max(0, lifetimeEarned)));
}
