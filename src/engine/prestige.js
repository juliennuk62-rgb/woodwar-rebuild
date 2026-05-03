// Système de prestige par serre — GDD §08 + Prompt 8.
// Chaque serre peut être réinitialisée pour gagner des tokens permanents
// qui boostent toutes les serres via un multiplicateur.
//
// Formule (GDD §06) :
//   tokens = floor(sqrt(lifetimeEarnedInThisGreenhouse))
//   multiplier = 1 + (tokens × 0.02)   // +2% par token

import { GREENHOUSES } from '../config/greenhouses.js';
import { computeIncomePerSecond } from './economy.js';
import { getAchievementBonus } from '../mechanics/quests.js';

// Tokens potentiels qu'on gagnerait en faisant prestige maintenant
export function computeTokensFromEarnings(lifetimeEarned) {
  return Math.floor(Math.sqrt(Math.max(0, lifetimeEarned)));
}

// Aperçu du prestige : ce que le joueur gagnerait.
// Les achievements de prestige (a_prestige_*) appliquent un boost
// multiplicatif au multiplicateur prestige (et donc au revenu post-prestige).
export function getPrestigePreview(greenhouseId, state) {
  const gh = state.greenhouses[greenhouseId];
  if (!gh) return null;
  const lifetimeEarned = gh.prestige?.lifetimeEarned ?? 0;
  const tokensGained = computeTokensFromEarnings(lifetimeEarned);
  const currentTokens = gh.prestige?.tokens ?? 0;
  const newTokens = currentTokens + tokensGained;
  const achievementBoost = 1 + (getAchievementBonus(state?.quests?.claimed ?? {}).prestigeMultiplierBonus ?? 0);
  const currentMultiplier = (1 + currentTokens * 0.02) * achievementBoost;
  const newMultiplier = (1 + newTokens * 0.02) * achievementBoost;
  return {
    greenhouseId,
    tokensGained,
    currentTokens,
    newTokens,
    currentMultiplier,
    newMultiplier,
    achievementBoost,
    lifetimeEarned,
    canPrestige: tokensGained > 0,
  };
}

// Prochain palier intéressant pour le joueur.
// - factorWanted = null  → simplement "+1 token" (utile quand on ne peut pas
//   encore prestige, pour montrer dans combien de temps le 1er token tombe).
// - factorWanted = 1.5   → combien de temps avant de pouvoir multiplier le
//   multiplicateur actuel par 1.5 (50 % de revenu en plus après prestige).
// - factorWanted = 2     → idem pour ×2.
//
// Renvoie { tokensNeeded, secondsNeeded, factorWanted } ou null si la serre
// n'existe pas. `secondsNeeded` peut être Infinity si incomePerSecond <= 0
// (à charge du composant d'afficher "—" dans ce cas).
export function getNextMilestone(greenhouseId, state, factorWanted = 1.5) {
  const gh = state?.greenhouses?.[greenhouseId];
  if (!gh) return null;
  const lifetimeEarned = gh.prestige?.lifetimeEarned ?? 0;
  const currentTokens = gh.prestige?.tokens ?? 0;
  const tokensGained = computeTokensFromEarnings(lifetimeEarned);

  // Combien de tokens il nous faut côté "à gagner ce run" pour atteindre
  // l'objectif. On raisonne sur le multiplicateur résultant après prestige
  // (currentTokens + tokensTarget).
  let tokensTarget; // nombre de tokens qu'on doit avoir gagnés ce run
  if (factorWanted == null) {
    // Prochain token tout court.
    tokensTarget = tokensGained + 1;
  } else {
    const currentMultiplier = 1 + currentTokens * 0.02;
    const wantedMultiplier = currentMultiplier * factorWanted;
    // newMultiplier = 1 + (currentTokens + tokensTarget) × 0.02 ≥ wantedMultiplier
    const minTotal = Math.ceil((wantedMultiplier - 1) / 0.02);
    tokensTarget = Math.max(minTotal - currentTokens, tokensGained + 1);
  }

  const lifetimeNeeded = tokensTarget * tokensTarget;
  const delta = Math.max(0, lifetimeNeeded - lifetimeEarned);

  // Revenu/s de cette serre uniquement (le multiplicateur prestige actuel
  // est déjà pris en compte par computeIncomePerSecond).
  const ips = computeIncomePerSecond(gh, state.market, state);
  const secondsNeeded = ips > 0 ? delta / ips : Infinity;

  return {
    tokensNeeded: tokensTarget - tokensGained, // tokens supplémentaires vs maintenant
    tokensTarget,                              // tokens totaux gagnés ce run requis
    lifetimeNeeded,
    deltaLifetime: delta,
    factorWanted,
    incomePerSecond: ips,
    secondsNeeded,
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
    gardeners: {},  // F8 : objet { [id]: level }
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
