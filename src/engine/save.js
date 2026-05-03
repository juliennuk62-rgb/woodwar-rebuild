// Sauvegarde / chargement / progression offline.
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { computePlantRevenue, getPlantStage, getGrowTime } from './economy.js';
import { SEASON_DURATION_MS, WEATHER_DURATION_MS } from '../mechanics/weather.js';

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
      // Pas encore de migration entre majeures — on ignore les saves d'autres versions.
      return null;
    }
    // Patch léger : ajoute les champs marché/saison s'ils manquent (saves Prompt 1-3)
    const now = Date.now();
    data.market = data.market ?? {};
    if (!data.market.seasonEndsAt)  data.market.seasonEndsAt  = now + SEASON_DURATION_MS;
    if (!data.market.weatherEndsAt) data.market.weatherEndsAt = now + WEATHER_DURATION_MS;
    if (!data.market.seasonStartedAt) data.market.seasonStartedAt = now;
    if (!data.market.history)        data.market.history        = {};
    if (!data.market.salesSinceTick) data.market.salesSinceTick = {};
    if (!data.market.weather)        data.market.weather        = 'sunny';
    if (!data.market.currentSeason)  data.market.currentSeason  = 'spring';
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

  // On utilise l'état marché courant (saison/météo) pour estimer le revenu offline.
  // Calculer l'évolution exacte sur N heures serait disproportionné — c'est un MVP.
  let totalEuros = 0;
  let totalPlants = 0;
  const newPlants = [];

  for (const plant of gh.plants) {
    const cycleSeconds = getGrowTime(plant.speciesId, gh, store);
    const revenuePerCycle = Math.floor(
      computePlantRevenue(plant, gh, store.market, { manual: false }, store) * eff
    );

    const elapsedSec = Math.min(elapsedMs / 1000, GAME_CONFIG.offlineCapMs / 1000);
    const { remaining } = getPlantStage(plant, lastSave, gh, store);

    let secondsLeft = elapsedSec;
    let cycles = 0;

    if (remaining > 0) {
      if (secondsLeft >= remaining) {
        cycles += 1;
        secondsLeft -= remaining;
      } else {
        newPlants.push(plant);
        continue;
      }
    } else {
      cycles += 1; // déjà mature au moment du retour
    }

    cycles += Math.floor(secondsLeft / cycleSeconds);
    secondsLeft -= Math.floor(secondsLeft / cycleSeconds) * cycleSeconds;

    totalEuros += cycles * revenuePerCycle;
    totalPlants += cycles;

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
