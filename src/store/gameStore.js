import { create } from 'zustand';
import { PLANTS } from '../config/plants.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { loadSave, applyOfflineProgress } from '../engine/save.js';

function makeInitialGreenhouseState(id) {
  const cfg = GREENHOUSES[id];
  return {
    unlocked: id === 'temperate',
    slots: cfg.initialSlots,
    plants: [],     // { slotId, speciesId, plantedAt }
    gardeners: [],
    upgrades: { lighting: 0, irrigation: 0, climate: 0, soil: 0 },
    prestige: { count: 0, tokens: 0, lifetimeEarned: 0 },
  };
}

function makeInitialState() {
  const greenhouses = {};
  for (const id of Object.keys(GREENHOUSES)) {
    greenhouses[id] = makeInitialGreenhouseState(id);
  }

  const species = {};
  for (const p of Object.values(PLANTS)) {
    species[p.id] = {
      discovered: !!p.unlockedFromStart,
      owned: 0,
      totalGrown: 0,
    };
  }

  return {
    version: GAME_CONFIG.version,
    lastTick: Date.now(),
    lastSave: Date.now(),
    totalTimePlayed: 0,

    currency: {
      euros: GAME_CONFIG.startingEuros,
      rareSeeds: 0,
      lifetimeEuros: 0,
    },

    activeGreenhouse: 'temperate',
    greenhouses,
    species,

    market: {
      currentSeason: 'spring',
      weather: 'sunny',
      prices: {},  // multiplicateur par espèce, calculé dans tick.js
    },

    expeditions: { active: [], completed: 0 },
    research: { unlocked: [], inProgress: null },
    quests: { story: {}, daily: { lastRefresh: null, active: [] }, weekly: { points: 0 } },
    stats: {
      totalPlantsGrown: 0,
      totalEarned: 0,
      firstGardenerAt: null,
      firstPrestigeAt: null,
      totalHybridsCreated: 0,
    },

    // Volatile — pas sauvegardé
    floatingNumbers: [],   // { id, slotId, amount, kind, createdAt }
    offlineGains: null,    // { duration, euros, plants, shownAt } ou null
    ready: false,
  };
}

export const useGameStore = create((set, get) => ({
  ...makeInitialState(),

  // ─── Initialisation ──────────────────────────────────────────────
  init: () => {
    const saved = loadSave();
    if (saved) {
      set({ ...saved, ready: false });
      const offline = applyOfflineProgress();
      set({ offlineGains: offline, ready: true });
    } else {
      set({ ready: true });
    }
  },

  // ─── Currency ────────────────────────────────────────────────────
  addEuros: (amount) => set((s) => ({
    currency: {
      ...s.currency,
      euros: s.currency.euros + amount,
      lifetimeEuros: s.currency.lifetimeEuros + Math.max(0, amount),
    },
    stats: {
      ...s.stats,
      totalEarned: s.stats.totalEarned + Math.max(0, amount),
    },
  })),

  spendEuros: (amount) => {
    const s = get();
    if (s.currency.euros < amount) return false;
    set({
      currency: { ...s.currency, euros: s.currency.euros - amount },
    });
    return true;
  },

  // ─── Plantation ──────────────────────────────────────────────────
  // Coût d'une graine : baseCost × 1.08^owned (GDD §06).
  getSeedCost: (speciesId) => {
    const plant = PLANTS[speciesId];
    const owned = get().species[speciesId]?.owned ?? 0;
    return Math.ceil(plant.seedCost * Math.pow(GAME_CONFIG.seedCostGrowth, owned));
  },

  isSpeciesUnlocked: (speciesId) => {
    const plant = PLANTS[speciesId];
    if (plant.unlockedFromStart) return true;
    const lifetime = get().currency.lifetimeEuros;
    return lifetime >= (plant.unlockCost ?? 0);
  },

  plantSeed: (slotId, speciesId) => {
    const s = get();
    const ghId = s.activeGreenhouse;
    const gh = s.greenhouses[ghId];
    if (!gh) return false;
    if (gh.plants.some((p) => p.slotId === slotId)) return false;

    if (!get().isSpeciesUnlocked(speciesId)) return false;

    const cost = get().getSeedCost(speciesId);
    if (!get().spendEuros(cost)) return false;

    const newPlant = {
      slotId,
      speciesId,
      plantedAt: Date.now(),
    };

    set((cur) => ({
      greenhouses: {
        ...cur.greenhouses,
        [ghId]: {
          ...cur.greenhouses[ghId],
          plants: [...cur.greenhouses[ghId].plants, newPlant],
        },
      },
      species: {
        ...cur.species,
        [speciesId]: {
          ...cur.species[speciesId],
          discovered: true,
          owned: cur.species[speciesId].owned + 1,
        },
      },
    }));
    return true;
  },

  // Récolte manuelle (clic sur plante mature) — bonus +25% vs. auto-vente
  harvestPlant: (slotId, opts = {}) => {
    const s = get();
    const ghId = s.activeGreenhouse;
    const gh = s.greenhouses[ghId];
    const plant = gh.plants.find((p) => p.slotId === slotId);
    if (!plant) return 0;

    const species = PLANTS[plant.speciesId];
    const elapsed = (Date.now() - plant.plantedAt) / 1000;
    if (elapsed < species.growTime) return 0;

    const market = s.market.prices[plant.speciesId] ?? 1.0;
    const manualBonus = opts.manual ? 1.25 : 1.0;
    const revenue = Math.floor(species.baseRevenue * market * manualBonus);

    set((cur) => ({
      greenhouses: {
        ...cur.greenhouses,
        [ghId]: {
          ...cur.greenhouses[ghId],
          plants: cur.greenhouses[ghId].plants.filter((p) => p.slotId !== slotId),
          prestige: {
            ...cur.greenhouses[ghId].prestige,
            lifetimeEarned: cur.greenhouses[ghId].prestige.lifetimeEarned + revenue,
          },
        },
      },
      species: {
        ...cur.species,
        [plant.speciesId]: {
          ...cur.species[plant.speciesId],
          totalGrown: cur.species[plant.speciesId].totalGrown + 1,
        },
      },
      stats: { ...cur.stats, totalPlantsGrown: cur.stats.totalPlantsGrown + 1 },
      currency: {
        ...cur.currency,
        euros: cur.currency.euros + revenue,
        lifetimeEuros: cur.currency.lifetimeEuros + revenue,
      },
      floatingNumbers: [
        ...cur.floatingNumbers,
        {
          id: `${slotId}-${Date.now()}`,
          slotId,
          amount: revenue,
          kind: opts.manual ? 'manual' : 'auto',
          createdAt: Date.now(),
        },
      ],
    }));
    return revenue;
  },

  // ─── Slots & Floating numbers ────────────────────────────────────
  removeFloatingNumber: (id) => set((s) => ({
    floatingNumbers: s.floatingNumbers.filter((f) => f.id !== id),
  })),

  setMarketPrices: (prices) => set((s) => ({
    market: { ...s.market, prices },
  })),

  setLastTick: (t) => set({ lastTick: t }),
  setLastSave: (t) => set({ lastSave: t }),

  dismissOfflineGains: () => set({ offlineGains: null }),

  // ─── Reset (debug) ───────────────────────────────────────────────
  hardReset: () => {
    try { localStorage.removeItem(GAME_CONFIG.saveKey); } catch (e) { /* noop */ }
    set({ ...makeInitialState(), ready: true });
  },
}));

// Expose utilitaire pour le moteur (tick.js, save.js) sans import circulaire
useGameStore.makeInitialState = makeInitialState;
