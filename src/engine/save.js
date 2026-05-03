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

// Champs volatiles à exclure du save : ils sont propres à une session et
// ne doivent pas être restaurés au reload (sinon une modale ouverte
// réapparaîtrait, un flash visuel persisterait, etc.).
const VOLATILE = ['floatingNumbers', 'offlineGains', 'upgradeFlash', 'currentDiscovery', 'saveError', 'ready'];

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
    try {
      localStorage.setItem(GAME_CONFIG.saveKey, json);
    } catch (e) {
      // Détection spécifique du quota dépassé (5 MB) — message identifié à
      // l'utilisateur via le store pour qu'on affiche une bannière visible.
      const isQuota =
        e?.name === 'QuotaExceededError' ||
        e?.code === 22 ||
        e?.code === 1014 ||
        /quota/i.test(e?.message ?? '');
      useGameStore.getState().setSaveError(isQuota ? 'quota' : 'unknown');
      console.warn('[Jardin d\'Agnès] Impossible de sauvegarder :', e);
      return false;
    }

    // Checksum SHA-256 (anti-tamper basique). Échec silencieux si SubtleCrypto
    // n'est pas dispo (vieux navigateurs) — la save reste valide sans hash.
    const hash = await computeChecksum(json);
    if (hash) {
      try { localStorage.setItem(HASH_KEY, hash); } catch (e) {}
    }

    // La save a réussi : on efface une éventuelle alerte précédente.
    if (useGameStore.getState().saveError) {
      useGameStore.getState().setSaveError(null);
    }
    useGameStore.getState().setLastSave(data.lastSave);
    return true;
  } catch (e) {
    useGameStore.getState().setSaveError('unknown');
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

    // Patch léger : champs ajoutés au fil des Prompts.
    // On préfère ce mécanisme à une migration explicite tant qu'on reste sur
    // la même version majeure, parce qu'il est non-destructif et simple.
    const now = Date.now();

    // Prompt 4 — marché/saisons
    data.market = data.market ?? {};
    if (!data.market.seasonEndsAt)    data.market.seasonEndsAt    = now + SEASON_DURATION_MS;
    if (!data.market.weatherEndsAt)   data.market.weatherEndsAt   = now + WEATHER_DURATION_MS;
    if (!data.market.seasonStartedAt) data.market.seasonStartedAt = now;
    if (!data.market.history)         data.market.history         = {};
    if (!data.market.salesSinceTick)  data.market.salesSinceTick  = {};
    if (!data.market.weather)         data.market.weather         = 'sunny';
    if (!data.market.currentSeason)   data.market.currentSeason   = 'spring';

    // Prompts 5, 7, 9 — onboarding, hybrides, recherche, quêtes
    data.settings = data.settings ?? {
      reducedMotion: false, sfxVolume: 0.7, musicVolume: 0.4, muted: false, lang: 'fr',
    };
    data.onboarding = data.onboarding ?? { step: 0, dismissed: false, lastSeenStep: 0 };
    data.research = data.research ?? { unlocked: [], inProgress: null };
    data.hybrids = data.hybrids ?? {};
    if (data.hybridIndex == null) data.hybridIndex = 0;
    data.lab = data.lab ?? { active: [] };
    data.quests = data.quests ?? {};
    if (!data.quests.claimed) data.quests.claimed = {};
    if (!data.quests.daily)   data.quests.daily   = { lastRefresh: null, active: [] };
    if (!data.quests.weekly)  data.quests.weekly  = { points: 0 };
    if (!data.expeditions)    data.expeditions    = { active: [], completed: 0 };
    data.permanentBonuses = data.permanentBonuses ?? { revenueBonus: 0 };

    // Champs volatiles : on les nettoie même s'ils sont présents (vieilles
    // saves committées avant l'audit qui les a ajoutés à VOLATILE).
    delete data.currentDiscovery;
    delete data.upgradeFlash;
    delete data.floatingNumbers;
    delete data.offlineGains;

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

// `saveGame` est `async` (à cause du checksum SHA-256). On consomme les
// promesses ici pour éviter les warnings "unhandled promise rejection" et
// pour ne jamais propager une erreur de sauvegarde.
function fireSave() {
  saveGame().catch((e) => console.warn('[Jardin d\'Agnès] saveGame threw :', e));
}

export function setupAutosave() {
  const id = setInterval(fireSave, GAME_CONFIG.autosaveIntervalMs);
  const onUnload = () => fireSave();
  window.addEventListener('beforeunload', onUnload);
  return () => {
    clearInterval(id);
    window.removeEventListener('beforeunload', onUnload);
    fireSave();
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
