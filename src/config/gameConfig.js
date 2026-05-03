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

  // Abeille dorée (événement type "golden cookie") — spawn aléatoire
  // entre 5 et 15 min, reste 30 s à l'écran. Si cliquée :
  //   · 50% → +60 s de revenu (équivalent en € directement)
  //   · 50% → boost ×2 €/s pendant 60 s
  beeMinIntervalMs: 5 * 60 * 1000,
  beeMaxIntervalMs: 15 * 60 * 1000,
  beeLifetimeMs: 30 * 1000,
  beeBoostDurationMs: 60 * 1000,
  beeBoostMultiplier: 2,
  beeRewardSeconds: 60,
  beeToastLifetimeMs: 4000,
};
