// Marché dynamique — GDD §07 (mécanique 4) + Prompt 4.
//
// Modèle :
//   1. Une onde lente sin(t × freq) + bruit  → variation "naturelle" entre 0.5×–1.7×
//   2. Une pression d'offre par espèce       → -0.05 par "vague" de ventes
//   3. Une récupération vers la moyenne      → +0.01 par marketTick
//
// Les prix résultants sont stockés dans store.market.prices et un historique
// court (7 valeurs) dans store.market.history pour les mini-graphiques.

import { PLANTS } from '../config/plants.js';

export const MARKET_TICK_MS = 5000;          // mise à jour toutes les 5s
export const HISTORY_LENGTH = 12;            // 12 dernières valeurs pour le graphique
export const SUPPLY_PRESSURE_PER_SALE = 0.012;
export const SUPPLY_RECOVERY_PER_TICK = 0.015;
export const PRICE_MIN = 0.40;
export const PRICE_MAX = 1.80;
export const HOT_THRESHOLD = 1.40;           // au-dessus = badge "BON MOMENT"

// Onde de fond — la même que dans economy.js, factorisée ici.
function pseudoRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function computeNaturalPrice(speciesId, time, seedIndex) {
  const wave = Math.sin(time * 0.0002 + seedIndex * 1.7) * 0.4;
  const noiseSeed = Math.floor(time / 60000) + seedIndex * 1000;
  const noise = (pseudoRandom(noiseSeed) - 0.5) * 0.15;
  return clamp(0.9 + wave + noise, PRICE_MIN, PRICE_MAX);
}

// Applique la pression d'offre + récupération à un prix existant.
// Renvoie le nouveau prix.
export function adjustPrice(currentPrice, naturalPrice, salesSinceLastTick = 0) {
  const supplyPressure = salesSinceLastTick * SUPPLY_PRESSURE_PER_SALE;
  // On retombe doucement vers le naturel
  const drift = (naturalPrice - currentPrice) * 0.15;
  const recovery = SUPPLY_RECOVERY_PER_TICK;
  return clamp(currentPrice + drift + recovery - supplyPressure, PRICE_MIN, PRICE_MAX);
}

// Tick principal : recalcule chaque prix, met à jour l'historique, vide le compteur de ventes.
export function marketTick(market, time) {
  const newPrices = {};
  const newHistory = { ...(market.history ?? {}) };
  const sales = market.salesSinceTick ?? {};
  let i = 0;
  for (const id of Object.keys(PLANTS)) {
    const natural = computeNaturalPrice(id, time, i);
    const previous = market.prices?.[id] ?? natural;
    const adjusted = adjustPrice(previous, natural, sales[id] ?? 0);
    newPrices[id] = adjusted;

    const hist = (newHistory[id] ?? []).slice(-(HISTORY_LENGTH - 1));
    hist.push(adjusted);
    newHistory[id] = hist;
    i++;
  }
  return { prices: newPrices, history: newHistory, salesSinceTick: {} };
}

export function isHotPrice(price) {
  return price >= HOT_THRESHOLD;
}

export function priceTrend(history) {
  if (!history || history.length < 2) return 'flat';
  const first = history[Math.max(0, history.length - 4)];
  const last = history[history.length - 1];
  const diff = last - first;
  if (diff > 0.04) return 'up';
  if (diff < -0.04) return 'down';
  return 'flat';
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
