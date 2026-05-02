import { create } from 'zustand';
import { PLANTS } from '../config/plants.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { GARDENERS } from '../config/gardeners.js';
import { UPGRADE_TYPES, upgradeCost } from '../config/upgrades.js';
import {
  computePlantRevenue,
  computeIncomePerSecond,
  computeCost,
  computeBulkCost,
  computeMaxAffordable,
  hasAnyGardener,
} from '../engine/economy.js';
import { loadSave, applyOfflineProgress } from '../engine/save.js';
import { SEASONS, SEASON_DURATION_MS, WEATHER_DURATION_MS, pickWeatherForSeason } from '../mechanics/weather.js';

function makeInitialGreenhouseState(id) {
  const cfg = GREENHOUSES[id];
  return {
    unlocked: id === 'temperate',
    slots: cfg.initialSlots,
    plants: [],     // { slotId, speciesId, plantedAt }
    gardeners: [],  // tableau d'IDs (string)
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
      seasonStartedAt: Date.now(),
      seasonEndsAt: Date.now() + SEASON_DURATION_MS,
      weather: 'sunny',
      weatherEndsAt: Date.now() + WEATHER_DURATION_MS,
      prices: {},
      history: {},          // { speciesId: [last 12 prices] }
      salesSinceTick: {},   // { speciesId: count } — reset à chaque marketTick
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
    floatingNumbers: [],
    offlineGains: null,
    activePanel: null,   // 'shop' | 'gardeners' | 'upgrades' | null
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
    set({ currency: { ...s.currency, euros: s.currency.euros - amount } });
    return true;
  },

  // ─── Plantation ──────────────────────────────────────────────────
  getSeedCost: (speciesId) => {
    const owned = get().species[speciesId]?.owned ?? 0;
    return computeCost(speciesId, owned);
  },

  getBulkCost: (speciesId, qty) => {
    const owned = get().species[speciesId]?.owned ?? 0;
    return computeBulkCost(speciesId, owned, qty);
  },

  getMaxAffordable: (speciesId) => {
    const owned = get().species[speciesId]?.owned ?? 0;
    const budget = get().currency.euros;
    return computeMaxAffordable(speciesId, owned, budget);
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

    set((cur) => ({
      greenhouses: {
        ...cur.greenhouses,
        [ghId]: {
          ...cur.greenhouses[ghId],
          plants: [
            ...cur.greenhouses[ghId].plants,
            { slotId, speciesId, plantedAt: Date.now() },
          ],
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

  // Plante autant de graines que possible sur les slots vides — utilisé par
  // le bouton "Max" du shop quand on choisit une espèce à planter en masse.
  plantSeedBulk: (speciesId, quantity) => {
    let planted = 0;
    for (let i = 0; i < quantity; i++) {
      const ghId = get().activeGreenhouse;
      const gh = get().greenhouses[ghId];
      const freeSlot = findFreeSlot(gh);
      if (freeSlot === -1) break;
      if (!get().plantSeed(freeSlot, speciesId)) break;
      planted++;
    }
    return planted;
  },

  // ─── Récolte ─────────────────────────────────────────────────────
  // GDD §07 : sans jardinier, le slot reste vide après vente. Avec jardinier,
  // la plante est replantée automatiquement (cycle continu).
  harvestPlant: (slotId, opts = {}) => {
    const s = get();
    const ghId = s.activeGreenhouse;
    const gh = s.greenhouses[ghId];
    const plant = gh.plants.find((p) => p.slotId === slotId);
    if (!plant) return 0;

    const species = PLANTS[plant.speciesId];
    const elapsed = (Date.now() - plant.plantedAt) / 1000;
    if (elapsed < species.growTime) return 0;

    const revenue = computePlantRevenue(plant, gh, s.market, { manual: !!opts.manual });

    // Replantation auto si au moins 1 jardinier embauché dans cette serre.
    let newPlants;
    if (hasAnyGardener(gh)) {
      newPlants = gh.plants.map((p) =>
        p.slotId === slotId ? { ...p, plantedAt: Date.now() } : p
      );
    } else {
      newPlants = gh.plants.filter((p) => p.slotId !== slotId);
    }

    set((cur) => ({
      greenhouses: {
        ...cur.greenhouses,
        [ghId]: {
          ...cur.greenhouses[ghId],
          plants: newPlants,
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
      market: {
        ...cur.market,
        salesSinceTick: {
          ...cur.market.salesSinceTick,
          [plant.speciesId]: (cur.market.salesSinceTick?.[plant.speciesId] ?? 0) + 1,
        },
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

  // ─── Jardiniers ──────────────────────────────────────────────────
  hireGardener: (gardenerId) => {
    const s = get();
    const g = GARDENERS[gardenerId];
    if (!g) return false;
    const ghId = g.greenhouseId;
    const gh = s.greenhouses[ghId];
    if (!gh) return false;
    if (gh.gardeners.includes(gardenerId)) return false;

    if (!get().spendEuros(g.cost)) return false;

    set((cur) => ({
      greenhouses: {
        ...cur.greenhouses,
        [ghId]: {
          ...cur.greenhouses[ghId],
          gardeners: [...cur.greenhouses[ghId].gardeners, gardenerId],
        },
      },
      stats: {
        ...cur.stats,
        firstGardenerAt: cur.stats.firstGardenerAt ?? Date.now(),
      },
    }));
    return true;
  },

  // ─── Upgrades de serre ───────────────────────────────────────────
  getUpgradeCost: (typeId) => {
    const ghId = get().activeGreenhouse;
    const level = get().greenhouses[ghId].upgrades[typeId] ?? 0;
    return upgradeCost(typeId, level);
  },

  buyUpgrade: (typeId) => {
    const s = get();
    const ghId = s.activeGreenhouse;
    const gh = s.greenhouses[ghId];
    const upgrade = UPGRADE_TYPES[typeId];
    if (!upgrade) return false;
    const level = gh.upgrades[typeId] ?? 0;
    if (level >= upgrade.maxLevel) return false;

    const cost = upgradeCost(typeId, level);
    if (!get().spendEuros(cost)) return false;

    set((cur) => ({
      greenhouses: {
        ...cur.greenhouses,
        [ghId]: {
          ...cur.greenhouses[ghId],
          upgrades: {
            ...cur.greenhouses[ghId].upgrades,
            [typeId]: level + 1,
          },
        },
      },
    }));
    return true;
  },

  // ─── Income forecast ─────────────────────────────────────────────
  getIncomePerSecond: () => {
    const s = get();
    const gh = s.greenhouses[s.activeGreenhouse];
    return computeIncomePerSecond(gh, s.market);
  },

  // ─── UI panel ────────────────────────────────────────────────────
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) => set((s) => ({
    activePanel: s.activePanel === panel ? null : panel,
  })),

  // ─── Floating numbers & ticks ────────────────────────────────────
  removeFloatingNumber: (id) => set((s) => ({
    floatingNumbers: s.floatingNumbers.filter((f) => f.id !== id),
  })),

  setMarketPrices: (prices) => set((s) => ({
    market: { ...s.market, prices },
  })),

  // Patch arbitraire de l'objet market — utilisé par marketTick et le cycle saison/météo
  patchMarket: (patch) => set((s) => ({
    market: { ...s.market, ...patch },
  })),

  // Incrémente le compteur de ventes pour pousser le prix à la baisse
  recordSale: (speciesId) => set((s) => ({
    market: {
      ...s.market,
      salesSinceTick: {
        ...s.market.salesSinceTick,
        [speciesId]: (s.market.salesSinceTick?.[speciesId] ?? 0) + 1,
      },
    },
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

useGameStore.makeInitialState = makeInitialState;

function findFreeSlot(gh) {
  if (!gh) return -1;
  const used = new Set(gh.plants.map((p) => p.slotId));
  for (let i = 0; i < gh.slots; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}
