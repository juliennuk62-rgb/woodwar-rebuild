// Constantes économiques et de gameplay — GDD §06.
export const GAME_CONFIG = {
  version: 1,
  saveKey: 'jardin-agnes:save:v1',

  // Tick principal du moteur
  tickIntervalMs: 100,         // 10 fps logique — visuel à 60fps via R3F
  autosaveIntervalMs: 5000,

  // Économie
  startingEuros: 10,           // De quoi planter 2 marguerites
  seedCostGrowth: 1.08,        // cost(n) = baseCost × 1.08^owned

  // Marché — § Formules économiques
  marketBase: 1.0,
  marketAmplitude: 0.5,
  marketFrequency: 0.001,
  marketNoise: 0.2,
  marketUpdateMs: 1000,

  // Offline gains : on cape à 12h pour éviter les abus.
  offlineCapMs: 12 * 60 * 60 * 1000,
  offlineEfficiency: 0.5,      // 50% du rendement effectif en offline

  // Animation
  floatingNumberLifetimeMs: 1400,
};
