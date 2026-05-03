// Sauvegarde / chargement / progression offline.
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { computePlantRevenue, getPlantStage, getGrowTime } from './economy.js';
import { SEASON_DURATION_MS, WEATHER_DURATION_MS } from '../mechanics/weather.js';
import { computeChecksum, verifyChecksum } from '../utils/checksum.js';
import { migrateSave } from '../utils/migrate.js';

// La save est stockée en deux clés : un payload + un hash SHA-256.
// Si le hash ne matche pas → on suspecte une édition manuelle, on jette.
const HASH_KEY = GAME_CONFIG.saveKey + ':hash';

// Champs volatiles à exclure du save
const VOLATILE = ['floatingNumbers', 'offlineGains', 'ready'];

export async function saveGame() {
  try {
    const state = useGameStore.getState();
    const data = {};
    for (const k of Object.keys(state)) {
      if (typeof state[k] === 'function') continue;
      if (VOLATILE.includes(k)) continue;
      data[k] = state[k];
    }
    data.lastSave = Date.now();
    const json = JSON.stringify(data);
    localStorage.setItem(GAME_CONFIG.saveKey, json);

    // Checksum SHA-256 (anti-tamper basique). Échec silencieux si SubtleCrypto
    // n'est pas dispo (vieux navigateurs) — la save reste valide sans hash.
    const hash = await computeChecksum(json);
    if (hash) {
      try { localStorage.setItem(HASH_KEY, hash); } catch (e) {}
    }

    useGameStore.getState().setLastSave(data.lastSave);
    return true;
  } catch (e) {
    console.warn('[Jardin d\'Agnès] Impossible de sauvegarder :', e);
    return false;
  }
}

// Note : loadSave reste synchrone car appelé au boot. La vérification du
// checksum se fait *en arrière-plan* — le save invalide est juste signalé
// dans la console (on ne refuse pas la save, parce qu'un faux positif coûte
// la progression du joueur, ce qui est pire qu'un cheat).
export function loadSave() {
  try {
    const raw = localStorage.getItem(GAME_CONFIG.saveKey);
    if (!raw) return null;
    let data = JSON.parse(raw);
    if (!data) return null;

    // Migration éventuelle si le save est d'une ancienne version
    if (data.version !== GAME_CONFIG.version) {
      const migrated = migrateSave(data, GAME_CONFIG.version);
      if (!migrated) return null; // pas de chemin de migration → reset
      data = migrated;
    }

    // Patch léger : champs marché/saison ajoutés en Prompt 4
    const now = Date.now();
    data.market = data.market ?? {};
    if (!data.market.seasonEndsAt)    data.market.seasonEndsAt    = now + SEASON_DURATION_MS;
    if (!data.market.weatherEndsAt)   data.market.weatherEndsAt   = now + WEATHER_DURATION_MS;
    if (!data.market.seasonStartedAt) data.market.seasonStartedAt = now;
    if (!data.market.history)         data.market.history         = {};
    if (!data.market.salesSinceTick)  data.market.salesSinceTick  = {};
    if (!data.market.weather)         data.market.weather         = 'sunny';
    if (!data.market.currentSeason)   data.market.currentSeason   = 'spring';

    // Vérification checksum en arrière-plan (non-bloquante)
    const expected = localStorage.getItem(HASH_KEY);
    if (expected) {
      verifyChecksum(raw, expected).then((ok) => {
        if (!ok) console.warn('[Jardin d\'Agnès] Save modifiée hors du jeu — checksum invalide.');
      }).catch(() => {});
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

  // On simule le retour pour TOUTES les serres débloquées (Prompt 8).
  let totalEuros = 0;
  let totalPlants = 0;
  const newGreenhouses = { ...store.greenhouses };

  for (const ghId of Object.keys(store.greenhouses)) {
    const gh = store.greenhouses[ghId];
    if (!gh.unlocked || !gh.plants.length) continue;

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
        cycles += 1;
      }

      cycles += Math.floor(secondsLeft / cycleSeconds);
      secondsLeft -= Math.floor(secondsLeft / cycleSeconds) * cycleSeconds;

      totalEuros += cycles * revenuePerCycle;
      totalPlants += cycles;

      newPlants.push({ ...plant, plantedAt: now - secondsLeft * 1000 });
    }

    newGreenhouses[ghId] = { ...gh, plants: newPlants };
  }

  if (totalEuros === 0 && totalPlants === 0) {
    return { duration: elapsedMs, euros: 0, plants: 0, capped: elapsedMs >= GAME_CONFIG.offlineCapMs };
  }

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
    greenhouses: newGreenhouses,
  }));

  return {
    duration: elapsedMs,
    euros: totalEuros,
    plants: totalPlants,
    capped: elapsedMs >= GAME_CONFIG.offlineCapMs,
  };
}
