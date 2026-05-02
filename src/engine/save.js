// Sauvegarde / chargement / progression offline.
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { PLANTS } from '../config/plants.js';
import { computeAllMarketPrices, getPlantStage } from './economy.js';

// Champs volatiles à exclure du save
const VOLATILE = ['floatingNumbers', 'offlineGains', 'ready'];

export function saveGame() {
  try {
    const state = useGameStore.getState();
    const data = {};
    for (const k of Object.keys(state)) {
      if (typeof state[k] === 'function') continue;
      if (VOLATILE.includes(k)) continue;
      data[k] = state[k];
    }
    data.lastSave = Date.now();
    localStorage.setItem(GAME_CONFIG.saveKey, JSON.stringify(data));
    useGameStore.getState().setLastSave(data.lastSave);
    return true;
  } catch (e) {
    console.warn('[Jardin d\'Agnès] Impossible de sauvegarder :', e);
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(GAME_CONFIG.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== GAME_CONFIG.version) {
      // Pas encore de migration en Prompt 1 — on ignore les saves d'autres versions.
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[Jardin d\'Agnès] Save corrompue, on repart à zéro :', e);
    return null;
  }
}

export function setupAutosave() {
  const id = setInterval(saveGame, GAME_CONFIG.autosaveIntervalMs);
  const onUnload = () => saveGame();
  window.addEventListener('beforeunload', onUnload);
  return () => {
    clearInterval(id);
    window.removeEventListener('beforeunload', onUnload);
    saveGame();
  };
}

// Calcule les gains accumulés pendant l'absence du joueur (GDD étape 5 du loop).
// On simule pour chaque plante combien de cycles ont eu lieu pendant la pause,
// avec un cap (12h) et une efficacité (50%) pour ne pas trivialiser le jeu.
export function applyOfflineProgress() {
  const store = useGameStore.getState();
  const now = Date.now();
  const lastSave = store.lastSave ?? now;
  let elapsedMs = now - lastSave;

  if (elapsedMs <= 0) return null;
  if (elapsedMs < 60_000) {
    // Moins d'une minute : pas la peine de montrer une modale
    return null;
  }

  elapsedMs = Math.min(elapsedMs, GAME_CONFIG.offlineCapMs);
  const eff = GAME_CONFIG.offlineEfficiency;

  const ghId = store.activeGreenhouse;
  const gh = store.greenhouses[ghId];
  if (!gh || !gh.plants.length) return { duration: elapsedMs, euros: 0, plants: 0, capped: false };

  const marketPrices = computeAllMarketPrices(now);
  let totalEuros = 0;
  let totalPlants = 0;
  const newPlants = [];

  for (const plant of gh.plants) {
    const species = PLANTS[plant.speciesId];
    const market = marketPrices[plant.speciesId] ?? 1.0;
    const revenuePerCycle = Math.floor(species.baseRevenue * market * eff);
    const cycleSeconds = species.growTime;

    // Combien de cycles ont eu le temps de se compléter ?
    const elapsedSec = Math.min(elapsedMs / 1000, GAME_CONFIG.offlineCapMs / 1000);
    const { remaining } = getPlantStage(plant, lastSave);

    // Premier cycle : il faut finir le temps restant
    let secondsLeft = elapsedSec;
    let cycles = 0;

    if (remaining > 0) {
      if (secondsLeft >= remaining) {
        cycles += 1;
        secondsLeft -= remaining;
      } else {
        // Plante toujours en croissance — on garde son plantedAt original
        newPlants.push(plant);
        continue;
      }
    } else {
      cycles += 1;  // déjà mature au moment du retour
    }

    cycles += Math.floor(secondsLeft / cycleSeconds);
    secondsLeft -= Math.floor(secondsLeft / cycleSeconds) * cycleSeconds;

    totalEuros += cycles * revenuePerCycle;
    totalPlants += cycles;

    // On replante un nouveau cycle — décalé du temps déjà écoulé sur le cycle suivant
    newPlants.push({
      ...plant,
      plantedAt: now - secondsLeft * 1000,
    });
  }

  // Applique les gains
  useGameStore.setState((s) => ({
    currency: {
      ...s.currency,
      euros: s.currency.euros + totalEuros,
      lifetimeEuros: s.currency.lifetimeEuros + totalEuros,
    },
    stats: {
      ...s.stats,
      totalPlantsGrown: s.stats.totalPlantsGrown + totalPlants,
      totalEarned: s.stats.totalEarned + totalEuros,
    },
    greenhouses: {
      ...s.greenhouses,
      [ghId]: { ...s.greenhouses[ghId], plants: newPlants },
    },
  }));

  return {
    duration: elapsedMs,
    euros: totalEuros,
    plants: totalPlants,
    capped: elapsedMs >= GAME_CONFIG.offlineCapMs,
  };
}
