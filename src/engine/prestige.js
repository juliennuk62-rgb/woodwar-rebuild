// Système de prestige par serre — GDD §08 + Prompt 8.
// Chaque serre peut être réinitialisée pour gagner des tokens permanents
// qui boostent toutes les serres via un multiplicateur.
//
// Formule (GDD §06) :
//   tokens = floor(sqrt(lifetimeEarnedInThisGreenhouse))
//   multiplier = 1 + (tokens × 0.02)   // +2% par token

import { GREENHOUSES } from '../config/greenhouses.js';

// Tokens potentiels qu'on gagnerait en faisant prestige maintenant
export function computeTokensFromEarnings(lifetimeEarned) {
  return Math.floor(Math.sqrt(Math.max(0, lifetimeEarned)));
}

// Aperçu du prestige : ce que le joueur gagnerait
export function getPrestigePreview(greenhouseId, state) {
  const gh = state.greenhouses[greenhouseId];
  if (!gh) return null;
  const lifetimeEarned = gh.prestige?.lifetimeEarned ?? 0;
  const tokensGained = computeTokensFromEarnings(lifetimeEarned);
  const currentTokens = gh.prestige?.tokens ?? 0;
  const newTokens = currentTokens + tokensGained;
  const currentMultiplier = 1 + currentTokens * 0.02;
  const newMultiplier = 1 + newTokens * 0.02;
  return {
    greenhouseId,
    tokensGained,
    currentTokens,
    newTokens,
    currentMultiplier,
    newMultiplier,
    lifetimeEarned,
    canPrestige: tokensGained > 0,
  };
}

// Renvoie le state mis à jour après un prestige (sans set, à passer au store).
export function buildPrestigeReset(greenhouseId, state) {
  const gh = state.greenhouses[greenhouseId];
  if (!gh) return null;
  const tokensGained = computeTokensFromEarnings(gh.prestige?.lifetimeEarned ?? 0);
  if (tokensGained <= 0) return null;

  const config = GREENHOUSES[greenhouseId];
  const newGh = {
    ...gh,
    plants: [],
    gardeners: [],
    upgrades: { lighting: 0, irrigation: 0, climate: 0, soil: 0 },
    slots: config.initialSlots, // les bonus slots de recherche s'appliquent ailleurs
    prestige: {
      count: (gh.prestige?.count ?? 0) + 1,
      tokens: (gh.prestige?.tokens ?? 0) + tokensGained,
      lifetimeEarned: 0,
    },
  };
  return { newGh, tokensGained };
}
