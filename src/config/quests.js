// Quêtes — GDD Prompt 9.
// 3 types : story (chaîne linéaire de 10), achievements (12 milestones
// perpétuels), dailies (3 par jour scalées sur le revenu actuel).

// ─── STORY (chaîne linéaire) ──────────────────────────────────────
// `check(state) → ratio ∈ [0,1]` (1 = complété)
export const STORY_QUESTS = [
  {
    id: 'q_first_seed',
    title: 'Première graine',
    description: 'Plante ta première marguerite.',
    target: 1,
    progress: (s) => s.species.daisy?.owned ?? 0,
    reward: { euros: 10 },
    prereq: null,
  },
  {
    id: 'q_first_euros',
    title: 'Premiers euros',
    description: 'Gagne 100 € en lifetime.',
    target: 100,
    progress: (s) => s.currency.lifetimeEuros,
    reward: { euros: 50 },
    prereq: 'q_first_seed',
  },
  {
    id: 'q_first_gardener',
    title: "Agnès n'est plus seule",
    description: 'Embauche ton premier jardinier.',
    target: 1,
    progress: (s) => Math.max(0, ...Object.values(s.greenhouses).map((g) => g.gardeners?.length ?? 0)),
    reward: { euros: 200 },
    prereq: 'q_first_euros',
  },
  {
    id: 'q_full_house',
    title: 'La serre tourne',
    description: 'Aie 6 slots remplis simultanément dans une serre.',
    target: 6,
    progress: (s) => Math.max(0, ...Object.values(s.greenhouses).map((g) => g.plants?.length ?? 0)),
    reward: { euros: 500, rareSeeds: 2 },
    prereq: 'q_first_gardener',
  },
  {
    id: 'q_botanist',
    title: 'Botaniste en herbe',
    description: 'Découvre 5 espèces différentes.',
    target: 5,
    progress: (s) => Object.values(s.species).filter((sp) => sp?.discovered).length,
    reward: { rareSeeds: 8 },
    prereq: 'q_full_house',
  },
  {
    id: 'q_first_journey',
    title: 'Premier voyage',
    description: 'Termine 1 expédition.',
    target: 1,
    progress: (s) => s.expeditions.completed ?? 0,
    reward: { rareSeeds: 12 },
    prereq: 'q_botanist',
  },
  {
    id: 'q_research',
    title: 'Sciences florales',
    description: 'Débloque 1 recherche au laboratoire.',
    target: 1,
    progress: (s) => s.research?.unlocked?.length ?? 0,
    reward: { rareSeeds: 25 },
    prereq: 'q_first_journey',
  },
  {
    id: 'q_first_hybrid',
    title: "Naissance d'un hybride",
    description: 'Crée ton premier hybride.',
    target: 1,
    progress: (s) => s.stats?.totalHybridsCreated ?? 0,
    reward: { rareSeeds: 50 },
    prereq: 'q_research',
  },
  {
    id: 'q_tropical_expansion',
    title: 'Expansion tropicale',
    description: 'Construis la Serre Tropicale.',
    target: 1,
    progress: (s) => s.greenhouses.tropical?.unlocked ? 1 : 0,
    reward: { rareSeeds: 100 },
    prereq: 'q_first_hybrid',
  },
  {
    id: 'q_first_prestige',
    title: "Prestige d'Agnès",
    description: 'Réinitialise une serre via prestige.',
    target: 1,
    progress: (s) => s.stats?.firstPrestigeAt ? 1 : 0,
    reward: { rareSeeds: 250, achievementBonus: { revenueBonus: 0.10 } },
    prereq: 'q_tropical_expansion',
  },
];

// ─── ACHIEVEMENTS (12 milestones perpétuels) ──────────────────────
// Les rewards sont diversifiés (GDD §13 prompt 9) :
//   - plantes        → revenueBonus (+ % revenu global)
//   - hybrides       → traitChanceBonus (+ % chance de trait unique)
//   - prestiges      → prestigeMultiplierBonus (+ % du multiplicateur prestige)
//   - expéditions    → expeditionSpeedBonus (− % durée des expéditions)
export const ACHIEVEMENTS = [
  { id: 'a_grow_10',   title: '10 plantes cultivées',   icon: '🌱', target: 10,    progress: (s) => s.stats.totalPlantsGrown,    reward: { revenueBonus: 0.05 } },
  { id: 'a_grow_50',   title: '50 plantes cultivées',   icon: '🌿', target: 50,    progress: (s) => s.stats.totalPlantsGrown,    reward: { revenueBonus: 0.10 } },
  { id: 'a_grow_100',  title: '100 plantes cultivées',  icon: '🌷', target: 100,   progress: (s) => s.stats.totalPlantsGrown,    reward: { revenueBonus: 0.15 } },
  { id: 'a_grow_500',  title: '500 plantes cultivées',  icon: '🌹', target: 500,   progress: (s) => s.stats.totalPlantsGrown,    reward: { revenueBonus: 0.25 } },
  { id: 'a_grow_2000', title: '2 000 plantes cultivées', icon: '🏆', target: 2000, progress: (s) => s.stats.totalPlantsGrown,    reward: { revenueBonus: 0.50 } },

  { id: 'a_hyb_1',  title: '1 hybride créé',    icon: '🧬', target: 1,  progress: (s) => s.stats.totalHybridsCreated ?? 0,  reward: { traitChanceBonus: 0.05 } },
  { id: 'a_hyb_5',  title: '5 hybrides créés',  icon: '✨', target: 5,  progress: (s) => s.stats.totalHybridsCreated ?? 0,  reward: { traitChanceBonus: 0.10 } },
  { id: 'a_hyb_20', title: '20 hybrides créés', icon: '⚗️', target: 20, progress: (s) => s.stats.totalHybridsCreated ?? 0,  reward: { traitChanceBonus: 0.20 } },

  { id: 'a_prestige_1', title: '1er prestige',  icon: '🌟', target: 1, progress: countPrestiges, reward: { prestigeMultiplierBonus: 0.05 } },
  { id: 'a_prestige_3', title: '3 prestiges',   icon: '💫', target: 3, progress: countPrestiges, reward: { prestigeMultiplierBonus: 0.15 } },

  { id: 'a_exp_5',  title: '5 expéditions',  icon: '🗺️', target: 5,  progress: (s) => s.expeditions.completed ?? 0, reward: { expeditionSpeedBonus: 0.05 } },
  { id: 'a_exp_20', title: '20 expéditions', icon: '🧭', target: 20, progress: (s) => s.expeditions.completed ?? 0, reward: { expeditionSpeedBonus: 0.15 } },
];

// ─── DAILY (générateurs de quêtes journalières) ───────────────────
export const DAILY_QUEST_KINDS = ['earn', 'plant', 'expedition'];

// Calcule la cible d'un kind en fonction du state actuel
export function targetForDaily(kind, state) {
  // Pour scaler la difficulté, on s'appuie sur les revenus récents.
  const totalSeedsPlanted = Object.values(state.species ?? {})
    .reduce((sum, sp) => sum + (sp?.owned ?? 0), 0);
  switch (kind) {
    case 'earn': {
      // 30 min de production estimée — au moins 50 €
      const ips = estimateIps(state);
      return Math.max(50, Math.round(ips * 30 * 60));
    }
    case 'plant': {
      // 10 à 50 plantations selon le total déjà planté
      return Math.max(10, Math.min(50, Math.round(5 + totalSeedsPlanted * 0.05)));
    }
    case 'expedition':
      return 1;
    default:
      return 1;
  }
}

export function dailyTitle(kind, target) {
  switch (kind) {
    case 'earn':       return `Vendre pour ${target.toLocaleString('fr-FR')} €`;
    case 'plant':      return `Planter ${target} graines`;
    case 'expedition': return `Réussir 1 expédition`;
    default:           return `Quête journalière`;
  }
}

export function dailyDescription(kind, target) {
  switch (kind) {
    case 'earn':       return `Gagne ${target.toLocaleString('fr-FR')} € avant minuit.`;
    case 'plant':      return `Plante ${target} graines avant minuit.`;
    case 'expedition': return `Termine au moins 1 expédition aujourd'hui.`;
    default:           return ``;
  }
}

export function dailyReward(kind) {
  switch (kind) {
    case 'earn':       return { rareSeeds: 5 };
    case 'plant':      return { rareSeeds: 8 };
    case 'expedition': return { rareSeeds: 12 };
    default:           return { rareSeeds: 5 };
  }
}

// Source courante du progress pour un daily — comparée au snapshot startValue
export function dailyProgressValue(kind, state) {
  switch (kind) {
    case 'earn':       return state.currency.lifetimeEuros;
    case 'plant':      return Object.values(state.species ?? {}).reduce((sum, sp) => sum + (sp?.owned ?? 0), 0);
    case 'expedition': return state.expeditions.completed ?? 0;
    default:           return 0;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────
function countPrestiges(s) {
  let total = 0;
  for (const id of Object.keys(s.greenhouses ?? {})) {
    total += s.greenhouses[id].prestige?.count ?? 0;
  }
  return total;
}

function estimateIps(state) {
  // Proxy simple : € totaux / temps écoulé
  const elapsed = Math.max(60, Math.floor((Date.now() - (state.lastSave ?? Date.now())) / 1000));
  return Math.max(0.1, (state.currency?.lifetimeEuros ?? 0) / elapsed);
}
