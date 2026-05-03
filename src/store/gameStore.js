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
  getGrowTime,
  getSpeciesData,
} from '../engine/economy.js';
import { loadSave, applyOfflineProgress } from '../engine/save.js';
import { SEASONS, SEASON_DURATION_MS, WEATHER_DURATION_MS, pickWeatherForSeason } from '../mechanics/weather.js';
import { canStart, buildExpedition, generateReward, effectiveDurationMs } from '../mechanics/expeditions.js';
import { EXPEDITIONS } from '../config/expeditions.js';
import {
  TECHS,
  isUnlockable,
  getResearchBonuses,
} from '../mechanics/research.js';
import {
  buildHybrid,
  hybridizationCost,
  hybridizationDurationMs,
} from '../mechanics/hybridation.js';
import { getPrestigePreview, buildPrestigeReset } from '../engine/prestige.js';
import {
  STORY_QUESTS,
  ACHIEVEMENTS,
  dailyTitle,
  dailyDescription,
  dailyReward,
} from '../config/quests.js';
import {
  questStatus,
  storyList,
  achievementsList,
  dailyStatus,
  generateDailies,
  shouldRefreshDailies,
  todayISO,
  getAchievementBonus,
} from '../mechanics/quests.js';
import { Events as Analytics } from '../utils/analytics.js';
import { audioManager } from '../audio/audioManager.js';

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
    research: { unlocked: [], inProgress: null },  // inProgress: { techId, startedAt, endsAt }
    hybrids: {},                                    // { hyb_001: { ...speciesData, parent1, parent2, trait, createdAt } }
    hybridIndex: 0,                                 // incrémente pour générer les IDs
    lab: { active: [] },                            // { id, parent1, parent2, startedAt, endsAt, cost }
    quests: {
      claimed: {},          // { questId: true } — story + achievements + dailies
      daily: { lastRefresh: null, active: [] },
      weekly: { points: 0 },
    },

    // Bonus permanents accumulés par certaines récompenses (q_first_prestige
    // donne +10% revenu permanent par exemple). Stocké séparément des
    // achievements parce que ce ne sont pas des achievements.
    permanentBonuses: { revenueBonus: 0 },
    stats: {
      totalPlantsGrown: 0,
      totalEarned: 0,
      firstGardenerAt: null,
      firstPrestigeAt: null,
      totalHybridsCreated: 0,
    },

    // Réglages persistés (Prompt 5)
    settings: {
      reducedMotion: false,
      sfxVolume: 0.7,        // utilisé en Prompt 10
      musicVolume: 0.4,
      muted: false,
      lang: 'fr',
    },

    // Tutoriel guidé (Prompt 5). step va de 0 (pas commencé) à 6 (fini).
    onboarding: {
      step: 0,
      dismissed: false,
      lastSeenStep: 0,
    },

    // Tips contextuels — affichés une seule fois à la première rencontre
    // d'une feature avancée (saisons, pics de marché, etc.). Persisté.
    tipsSeen: {},

    // Milestone tips (lab, prestige) — séparés des `tipsSeen` pour éviter
    // tout conflit avec l'autre système de tips. Persisté.
    mtipsSeen: {},

    // Rush moments — milestones lifetime déjà franchis. Persisté pour ne
    // pas rejouer l'animation au reload. Clé = montant en € (string), val = true.
    seenMilestones: {},

    // Volatile — pas sauvegardé
    floatingNumbers: [],
    offlineGains: null,
    activePanel: null,
    upgradeFlash: null,    // { typeId, ts } — pour animer la carte qui vient d'être achetée
    currentDiscovery: null, // { speciesId, expeditionId } — modale de découverte
    saveError: null,       // 'quota' | 'unknown' — bannière visible si la sauvegarde échoue
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
    const s = get();
    const owned = s.species[speciesId]?.owned ?? 0;
    return computeCost(speciesId, owned, s);
  },

  getBulkCost: (speciesId, qty) => {
    const s = get();
    const owned = s.species[speciesId]?.owned ?? 0;
    return computeBulkCost(speciesId, owned, qty, s);
  },

  getMaxAffordable: (speciesId) => {
    const s = get();
    const owned = s.species[speciesId]?.owned ?? 0;
    return computeMaxAffordable(speciesId, owned, s.currency.euros, s);
  },

  isSpeciesUnlocked: (speciesId) => {
    const plant = getSpeciesData(speciesId, get());
    if (!plant) return false;
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
    audioManager.play('plant');
    Analytics.firstPlant();
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

  // ─── Navigation entre serres (Prompt 8) ──────────────────────────
  switchGreenhouse: (id) => {
    const s = get();
    if (!s.greenhouses[id]?.unlocked) return false;
    set({ activeGreenhouse: id });
    return true;
  },

  unlockGreenhouse: (id) => {
    const s = get();
    const gh = s.greenhouses[id];
    const config = GREENHOUSES[id];
    if (!gh || !config) return false;
    if (gh.unlocked) return false;
    if (s.currency.euros < config.unlockCost) return false;
    set((cur) => ({
      currency: { ...cur.currency, euros: cur.currency.euros - config.unlockCost },
      greenhouses: {
        ...cur.greenhouses,
        [id]: { ...cur.greenhouses[id], unlocked: true },
      },
      activeGreenhouse: id,
    }));
    audioManager.play('upgrade');
    Analytics.greenhouseUnlocked(id);
    return true;
  },

  // ─── Prestige ────────────────────────────────────────────────────
  getPrestigePreview: (greenhouseId) => getPrestigePreview(greenhouseId, get()),

  applyPrestige: (greenhouseId) => {
    const s = get();
    const reset = buildPrestigeReset(greenhouseId, s);
    if (!reset) return null;
    set((cur) => ({
      greenhouses: { ...cur.greenhouses, [greenhouseId]: reset.newGh },
      stats: {
        ...cur.stats,
        firstPrestigeAt: cur.stats.firstPrestigeAt ?? Date.now(),
      },
    }));
    audioManager.play('prestige');
    Analytics.firstPrestige();
    return reset.tokensGained;
  },

  // ─── Récolte ─────────────────────────────────────────────────────
  // GDD §07 : sans jardinier, le slot reste vide après vente. Avec jardinier,
  // la plante est replantée automatiquement (cycle continu).
  // `opts.greenhouseId` permet de récolter une plante d'une serre non-active
  // (utile pour le tick qui doit gérer toutes les serres débloquées).
  harvestPlant: (slotId, opts = {}) => {
    const s = get();
    const ghId = opts.greenhouseId ?? s.activeGreenhouse;
    const gh = s.greenhouses[ghId];
    const plant = gh?.plants?.find((p) => p.slotId === slotId);
    if (!plant) return 0;

    const species = getSpeciesData(plant.speciesId, s);
    if (!species) return 0;
    // On utilise le growTime effectif (lighting + recherche), pas le brut.
    const elapsed = (Date.now() - plant.plantedAt) / 1000;
    if (elapsed < getGrowTime(plant.speciesId, gh, s)) return 0;

    const floatId = `${ghId}-${slotId}-${Date.now()}`;

    const revenue = computePlantRevenue(plant, gh, s.market, { manual: !!opts.manual }, s);

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
          id: floatId,
          slotId,
          greenhouseId: ghId,
          amount: revenue,
          kind: opts.manual ? 'manual' : 'auto',
          createdAt: Date.now(),
        },
      ],
    }));
    // Cleanup côté store (le composant peut ne jamais monter pour une serre
    // inactive — sinon on aurait une fuite mémoire).
    setTimeout(() => {
      get().removeFloatingNumber(floatId);
    }, GAME_CONFIG.floatingNumberLifetimeMs);
    if (opts.manual) audioManager.play('harvest');
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
    audioManager.play('gardener');
    Analytics.firstGardener();
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
    get().flashUpgrade(typeId);
    audioManager.play('upgrade');
    return true;
  },

  // ─── Income forecast (somme sur toutes serres débloquées) ────────
  getIncomePerSecond: () => {
    const s = get();
    let total = 0;
    for (const id of Object.keys(s.greenhouses)) {
      const gh = s.greenhouses[id];
      if (!gh.unlocked) continue;
      total += computeIncomePerSecond(gh, s.market, s);
    }
    return total;
  },

  // ─── UI panel ────────────────────────────────────────────────────
  setActivePanel: (panel) => set({ activePanel: panel }),
  togglePanel: (panel) => set((s) => ({
    activePanel: s.activePanel === panel ? null : panel,
  })),

  // ─── Settings ────────────────────────────────────────────────────
  updateSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    // Propage immédiatement les volumes à l'audio manager
    audioManager.setSettings(get().settings);
  },

  // ─── Onboarding ──────────────────────────────────────────────────
  // Avance d'une étape uniquement si on est sur la précédente.
  // L'onboarding écoute les actions du joueur via Onboarding.jsx (subscribe).
  advanceOnboarding: (toStep) => set((s) => {
    if (s.onboarding.dismissed) return {};
    if (toStep <= s.onboarding.step) return {};
    return { onboarding: { ...s.onboarding, step: toStep, lastSeenStep: toStep } };
  }),
  dismissOnboarding: () => set((s) => ({
    onboarding: { ...s.onboarding, dismissed: true },
  })),

  // ─── Tips contextuels ────────────────────────────────────────────
  // Marque un tip comme vu pour qu'il ne réapparaisse plus jamais.
  // Idempotent : appeler plusieurs fois avec le même id n'a aucun effet.
  markTipSeen: (tipId) => set((s) => {
    if (!tipId || s.tipsSeen?.[tipId]) return {};
    return { tipsSeen: { ...(s.tipsSeen ?? {}), [tipId]: true } };
  }),

  // Variante pour les milestone tips (lab, prestige). Stockée séparément
  // pour ne pas interférer avec les tips existants.
  markMtipSeen: (tipId) => set((s) => {
    if (!tipId || s.mtipsSeen?.[tipId]) return {};
    return { mtipsSeen: { ...(s.mtipsSeen ?? {}), [tipId]: true } };
  }),

  // ─── Expéditions (Prompt 6) ──────────────────────────────────────
  canStartExpedition: (destinationId) => canStart(destinationId, get()),

  startExpedition: (destinationId) => {
    const s = get();
    const check = canStart(destinationId, s);
    if (!check.ok) return false;
    const dest = EXPEDITIONS[destinationId];
    if (!get().spendEuros(dest.cost)) return false;
    const exp = buildExpedition(destinationId, Date.now());
    set((cur) => ({
      expeditions: {
        ...cur.expeditions,
        active: [...(cur.expeditions.active ?? []), exp],
      },
    }));
    return true;
  },

  // Réclame le butin d'une expédition terminée. Crée la modale de découverte
  // si une nouvelle espèce est tombée.
  claimExpedition: (expeditionId) => {
    const s = get();
    const exp = (s.expeditions.active ?? []).find((e) => e.id === expeditionId);
    if (!exp) return null;
    if (Date.now() < exp.endsAt) return null;

    const reward = generateReward(exp.destinationId, s.species);

    set((cur) => {
      const newSpecies = { ...cur.species };
      if (reward.speciesId && !newSpecies[reward.speciesId]?.discovered) {
        newSpecies[reward.speciesId] = {
          ...(newSpecies[reward.speciesId] ?? {}),
          discovered: true,
          owned: 0,
          totalGrown: 0,
        };
      }
      return {
        currency: {
          ...cur.currency,
          rareSeeds: cur.currency.rareSeeds + reward.rareSeeds,
        },
        species: newSpecies,
        expeditions: {
          ...cur.expeditions,
          active: cur.expeditions.active.filter((e) => e.id !== expeditionId),
          completed: (cur.expeditions.completed ?? 0) + 1,
        },
        currentDiscovery: reward.speciesId
          ? { speciesId: reward.speciesId, expeditionId, rareSeeds: reward.rareSeeds }
          : cur.currentDiscovery,
      };
    });
    audioManager.play('expedition');
    Analytics.firstExpedition();
    return reward;
  },

  dismissDiscovery: () => set({ currentDiscovery: null }),

  // ─── Helpers d'accès aux espèces (natives + hybrides) ────────────
  getSpeciesData: (speciesId) => {
    return PLANTS[speciesId] ?? get().hybrids[speciesId] ?? null;
  },

  // ─── Recherche (Prompt 7) ────────────────────────────────────────
  canStartResearch: (techId) => {
    const s = get();
    const tech = TECHS[techId];
    if (!tech) return { ok: false, reason: 'unknown' };
    if (s.research.inProgress) return { ok: false, reason: 'busy' };
    if (s.research.unlocked.includes(techId)) return { ok: false, reason: 'done' };
    if (!isUnlockable(techId, s.research.unlocked)) return { ok: false, reason: 'prereq' };
    if (s.currency.rareSeeds < tech.cost) return { ok: false, reason: 'broke' };
    return { ok: true };
  },

  startResearch: (techId) => {
    const s = get();
    const check = get().canStartResearch(techId);
    if (!check.ok) return false;
    const tech = TECHS[techId];
    set((cur) => ({
      currency: { ...cur.currency, rareSeeds: cur.currency.rareSeeds - tech.cost },
      research: {
        ...cur.research,
        inProgress: { techId, startedAt: Date.now(), endsAt: Date.now() + tech.durationMs },
      },
    }));
    return true;
  },

  // Appelé par tick.js quand le timer arrive à 0
  completeResearch: () => {
    const s = get();
    const ip = s.research.inProgress;
    if (!ip) return false;
    if (Date.now() < ip.endsAt) return false;
    set((cur) => ({
      research: {
        unlocked: [...cur.research.unlocked, ip.techId],
        inProgress: null,
      },
    }));
    return true;
  },

  getResearchBonuses: () => getResearchBonuses(get().research.unlocked),

  // ─── Hybridation (Prompt 7) ─────────────────────────────────────
  // On peut hybrider deux espèces qu'on a au moins découvertes (owned >= 1).
  canHybridize: (parent1Id, parent2Id) => {
    const s = get();
    if (!parent1Id || !parent2Id) return { ok: false, reason: 'select' };
    if (parent1Id === parent2Id) return { ok: false, reason: 'same' };
    const cost = hybridizationCost(s.research.unlocked);
    if (s.currency.rareSeeds < cost) return { ok: false, reason: 'broke' };
    const max = s.research.unlocked.includes('lab_3') ? 2 : 1;
    if (s.lab.active.length >= max) return { ok: false, reason: 'busy' };
    if (!PLANTS[parent1Id] || !PLANTS[parent2Id]) return { ok: false, reason: 'unknown' };
    if (!s.species[parent1Id]?.discovered) return { ok: false, reason: 'undiscovered1' };
    if (!s.species[parent2Id]?.discovered) return { ok: false, reason: 'undiscovered2' };
    return { ok: true };
  },

  startHybridization: (parent1Id, parent2Id) => {
    const s = get();
    const check = get().canHybridize(parent1Id, parent2Id);
    if (!check.ok) return false;
    const cost = hybridizationCost(s.research.unlocked);
    const duration = hybridizationDurationMs(PLANTS[parent1Id], PLANTS[parent2Id], s.research.unlocked);

    set((cur) => ({
      currency: { ...cur.currency, rareSeeds: cur.currency.rareSeeds - cost },
      lab: {
        ...cur.lab,
        active: [
          ...cur.lab.active,
          {
            id: `lab-${Date.now()}`,
            parent1Id,
            parent2Id,
            startedAt: Date.now(),
            endsAt: Date.now() + duration,
            cost,
          },
        ],
      },
    }));
    return true;
  },

  // Appelé par tick.js OU par clic sur "Récupérer l'hybride".
  completeHybridization: (labId) => {
    const s = get();
    const job = s.lab.active.find((j) => j.id === labId);
    if (!job) return null;
    if (Date.now() < job.endsAt) return null;

    const newIndex = s.hybridIndex + 1;
    const hybrid = buildHybrid({
      parent1Id: job.parent1Id,
      parent2Id: job.parent2Id,
      hybridIndex: newIndex,
      researchUnlocked: s.research.unlocked,
    });
    if (!hybrid) return null;

    set((cur) => ({
      hybrids: { ...cur.hybrids, [hybrid.id]: hybrid },
      hybridIndex: newIndex,
      lab: { ...cur.lab, active: cur.lab.active.filter((j) => j.id !== labId) },
      species: {
        ...cur.species,
        [hybrid.id]: { discovered: true, owned: 0, totalGrown: 0 },
      },
      stats: { ...cur.stats, totalHybridsCreated: (cur.stats.totalHybridsCreated ?? 0) + 1 },
      currentDiscovery: { speciesId: hybrid.id, source: 'hybrid' },
    }));
    audioManager.play('quest');
    Analytics.firstHybrid();
    return hybrid;
  },

  // ─── Quêtes (Prompt 9) ───────────────────────────────────────────
  getStoryList: () => storyList(get(), get().quests.claimed),
  getAchievements: () => achievementsList(get(), get().quests.claimed),
  getDailies: () => {
    const s = get();
    return (s.quests.daily.active ?? []).map((d) => ({
      ...dailyStatus(d, s),
      title: dailyTitle(d.kind, d.target),
      description: dailyDescription(d.kind, d.target),
      reward: dailyReward(d.kind),
      isClaimed: !!s.quests.claimed[d.id],
    }));
  },

  // Vérifie si on doit régénérer les dailies + le fait
  refreshDailiesIfNeeded: () => {
    const s = get();
    if (!shouldRefreshDailies(s.quests)) return false;
    const today = todayISO();
    const dailies = generateDailies(s, today);
    set((cur) => ({
      quests: {
        ...cur.quests,
        daily: { lastRefresh: today, active: dailies },
      },
    }));
    return true;
  },

  // Réclame la récompense d'une quête (story / achievement / daily)
  claimQuest: (questId) => {
    const s = get();
    if (s.quests.claimed[questId]) return false;

    // Trouve la quête (story, achievement ou daily)
    let reward = null;
    let isStory = false;
    let isDaily = false;
    let kind = null;

    const story = STORY_QUESTS.find((q) => q.id === questId);
    if (story) {
      const status = questStatus(story, s, s.quests.claimed);
      if (!status.isComplete) return false;
      reward = story.reward;
      isStory = true;
      Analytics.questCompleted(questId);
    } else {
      const ach = ACHIEVEMENTS.find((a) => a.id === questId);
      if (ach) {
        const status = questStatus(ach, s, s.quests.claimed);
        if (!status.isComplete) return false;
        reward = ach.reward;
        Analytics.achievementUnlocked(questId);
      } else {
        const daily = (s.quests.daily.active ?? []).find((d) => d.id === questId);
        if (daily) {
          const status = dailyStatus(daily, s);
          if (!status.isComplete) return false;
          reward = dailyReward(daily.kind);
          isDaily = true;
          kind = daily.kind;
          Analytics.dailyQuestCompleted(daily.kind);
        }
      }
    }
    if (!reward) return false;

    // Applique la récompense
    set((cur) => {
      const next = {
        quests: { ...cur.quests, claimed: { ...cur.quests.claimed, [questId]: true } },
      };
      if (reward.euros) {
        next.currency = {
          ...cur.currency,
          euros: cur.currency.euros + reward.euros,
          lifetimeEuros: cur.currency.lifetimeEuros + reward.euros,
        };
      }
      if (reward.rareSeeds) {
        next.currency = {
          ...(next.currency ?? cur.currency),
          rareSeeds: cur.currency.rareSeeds + reward.rareSeeds,
        };
      }
      // Bonus permanents (story quest q_first_prestige notamment)
      const bonus = reward.achievementBonus?.revenueBonus;
      if (bonus) {
        next.permanentBonuses = {
          ...cur.permanentBonuses,
          revenueBonus: (cur.permanentBonuses?.revenueBonus ?? 0) + bonus,
        };
      }
      return next;
    });
    audioManager.play('quest');
    return true;
  },

  // Bonus revenu cumulé depuis les achievements claimed (utilisé par economy)
  getAchievementRevenueBonus: () => getAchievementBonus(get().quests.claimed),

  // ─── Save export / import ────────────────────────────────────────
  exportSave: () => {
    const s = get();
    const data = {};
    for (const k of Object.keys(s)) {
      if (typeof s[k] === 'function') continue;
      if (['floatingNumbers', 'offlineGains', 'upgradeFlash', 'ready'].includes(k)) continue;
      data[k] = s[k];
    }
    return JSON.stringify(data);
  },

  importSave: (json) => {
    try {
      const data = JSON.parse(json);
      if (!data || data.version !== GAME_CONFIG.version) {
        console.warn('Save d\'une version incompatible');
        return false;
      }
      // Sanity checks : on ne fait pas confiance au JSON importé
      sanitizeSave(data);
      try { localStorage.setItem(GAME_CONFIG.saveKey, json); } catch (e) {}
      set({ ...data, floatingNumbers: [], offlineGains: null, ready: true });
      return true;
    } catch (e) {
      console.warn('Import save échoué :', e);
      return false;
    }
  },

  // ─── Upgrade flash (visual feedback) ─────────────────────────────
  flashUpgrade: (typeId) => {
    set({ upgradeFlash: { typeId, ts: Date.now() } });
    setTimeout(() => set((s) => {
      if (s.upgradeFlash?.typeId === typeId) return { upgradeFlash: null };
      return {};
    }), 500);
  },

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
  setSaveError: (kind) => set({ saveError: kind }),

  dismissOfflineGains: () => set({ offlineGains: null }),

  // ─── Rush moments (milestones lifetime) ──────────────────────────
  // Marque un seuil comme déjà célébré pour ne pas rejouer la modale.
  // La clé est stockée en string pour rester stable à la sérialisation JSON.
  markMilestoneSeen: (amount) => set((s) => ({
    seenMilestones: { ...(s.seenMilestones ?? {}), [String(amount)]: true },
  })),

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

// Borne / nettoie les valeurs d'une save importée pour éviter les états
// incohérents (currency négative, hybrides mal formés, etc.).
function sanitizeSave(data) {
  if (data.currency) {
    data.currency.euros = Math.max(0, Number(data.currency.euros) || 0);
    data.currency.rareSeeds = Math.max(0, Math.floor(Number(data.currency.rareSeeds) || 0));
    data.currency.lifetimeEuros = Math.max(
      data.currency.euros,
      Number(data.currency.lifetimeEuros) || 0
    );
  }
  if (data.hybrids && typeof data.hybrids === 'object') {
    for (const id of Object.keys(data.hybrids)) {
      const h = data.hybrids[id];
      if (
        !h?.id ||
        !h?.name ||
        typeof h?.growTime !== 'number' ||
        typeof h?.baseRevenue !== 'number'
      ) {
        delete data.hybrids[id];
      }
    }
  }
  // Recherche en cours : si techId invalide, on annule
  if (data.research?.inProgress?.techId && !TECHS[data.research.inProgress.techId]) {
    data.research.inProgress = null;
  }
}
