// Logique des expéditions — pure et testable.
// GDD §07 (mécanique 2) + Prompt 6.
import { EXPEDITIONS, MAX_CONCURRENT_EXPEDITIONS } from '../config/expeditions.js';
import { PLANT_LIST } from '../config/plants.js';

// Vérifie si on peut lancer une expédition donnée — sans modifier d'état.
export function canStart(destinationId, state) {
  const dest = EXPEDITIONS[destinationId];
  if (!dest) return { ok: false, reason: 'unknown' };
  if (state.currency.euros < dest.cost) return { ok: false, reason: 'broke' };
  const active = state.expeditions?.active ?? [];
  if (active.length >= MAX_CONCURRENT_EXPEDITIONS) return { ok: false, reason: 'busy' };
  if (active.some((e) => e.destinationId === destinationId)) return { ok: false, reason: 'duplicate' };
  if (state.currency.lifetimeEuros < (dest.unlockCost ?? 0)) return { ok: false, reason: 'locked' };
  return { ok: true };
}

// Durée effective d'une expédition après application des bonus achievements.
// `achievementBonuses` est l'objet retourné par getAchievementBonus()
// (ou un nombre direct pour le bonus de vitesse, pour faciliter les tests).
// Plancher à 20% de la durée de base pour éviter les expéditions instantanées.
export function effectiveDurationMs(destination, achievementBonuses = {}) {
  if (!destination) return 0;
  const base = destination.durationMs;
  const speedBonus = typeof achievementBonuses === 'number'
    ? achievementBonuses
    : (achievementBonuses?.expeditionSpeedBonus ?? 0);
  const factor = Math.max(0.2, 1 - speedBonus);
  return Math.round(base * factor);
}

// Génère une instance d'expédition (à pousser dans state.expeditions.active).
// `achievementBonuses` (optionnel) : pour appliquer le bonus de vitesse.
export function buildExpedition(destinationId, now, achievementBonuses = {}) {
  const dest = EXPEDITIONS[destinationId];
  const duration = effectiveDurationMs(dest, achievementBonuses);
  return {
    id: `${destinationId}-${now}`,
    destinationId,
    startedAt: now,
    endsAt: now + duration,
  };
}

// Appelé dans le tick : retourne les expéditions terminées (sans modifier state).
export function findCompleted(active, now) {
  return (active ?? []).filter((e) => now >= e.endsAt);
}

// Génère une récompense lors du retour.
// On évite de re-découvrir une espèce déjà connue : on choisit dans le pool
// des espèces non encore découvertes du biome de la destination.
export function generateReward(destinationId, knownSpecies = {}) {
  const dest = EXPEDITIONS[destinationId];
  const [low, high] = dest.rareSeedsRange;
  const rareSeeds = Math.floor(low + Math.random() * (high - low + 1));

  let speciesId = null;
  if (Math.random() < dest.discoveryChance) {
    const candidates = PLANT_LIST.filter(
      (p) => p.biome === dest.biome && !knownSpecies[p.id]?.discovered
    );
    if (candidates.length > 0) {
      speciesId = candidates[Math.floor(Math.random() * candidates.length)].id;
    }
  }

  return {
    destinationId,
    rareSeeds,
    speciesId,   // null si aucune nouvelle espèce ce coup-ci
  };
}
