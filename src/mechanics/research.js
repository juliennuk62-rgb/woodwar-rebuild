// Arbre de recherche — GDD §07 (mécanique 6) + Prompt 7.
// 12 technologies en 4 branches (Croissance / Commerce / Serre / Hybridation).
// Chaque branche est linéaire : il faut le tier 1 pour débloquer le tier 2, etc.
// Coût en Graines Rares + durée réelle. Une seule recherche active à la fois.

export const TECH_BRANCHES = {
  growth: { id: 'growth', name: 'Croissance', icon: '🌿', color: '#7ec87a' },
  trade:  { id: 'trade',  name: 'Commerce',   icon: '📈', color: '#d4a84b' },
  slots:  { id: 'slots',  name: 'Serre',      icon: '🏡', color: '#e07a7a' },
  lab:    { id: 'lab',    name: 'Hybridation',icon: '🧬', color: '#b4a8d4' },
};

export const TECHS = {
  // ─── Croissance : réduit le grow time global ─────────────
  growth_1: {
    id: 'growth_1', branch: 'growth', tier: 1,
    name: 'Engrais artisanal',
    description: 'Réduit le temps de pousse de 10% sur toutes les plantes.',
    cost: 30, durationMs: 8 * 60 * 1000,
    prereq: null,
    effect: { growTimeReduction: 0.10 },
  },
  growth_2: {
    id: 'growth_2', branch: 'growth', tier: 2,
    name: 'Hormones de croissance',
    description: 'Réduit le temps de pousse de 25%.',
    cost: 150, durationMs: 30 * 60 * 1000,
    prereq: 'growth_1',
    effect: { growTimeReduction: 0.25 },
  },
  growth_3: {
    id: 'growth_3', branch: 'growth', tier: 3,
    name: 'Génétique avancée',
    description: 'Réduit le temps de pousse de 40%.',
    cost: 800, durationMs: 2 * 60 * 60 * 1000,
    prereq: 'growth_2',
    effect: { growTimeReduction: 0.40 },
  },

  // ─── Commerce : bonus revenu ─────────────────────────────
  trade_1: {
    id: 'trade_1', branch: 'trade', tier: 1,
    name: 'Réseau local',
    description: 'Bonus de revenu +15% sur toutes les ventes.',
    cost: 30, durationMs: 8 * 60 * 1000,
    prereq: null,
    effect: { revenueBonus: 0.15 },
  },
  trade_2: {
    id: 'trade_2', branch: 'trade', tier: 2,
    name: 'Galerie marchande',
    description: 'Bonus de revenu +30%.',
    cost: 200, durationMs: 45 * 60 * 1000,
    prereq: 'trade_1',
    effect: { revenueBonus: 0.30 },
  },
  trade_3: {
    id: 'trade_3', branch: 'trade', tier: 3,
    name: 'Marque internationale',
    description: 'Bonus de revenu +50%.',
    cost: 1000, durationMs: 2 * 60 * 60 * 1000,
    prereq: 'trade_2',
    effect: { revenueBonus: 0.50 },
  },

  // ─── Serre : slots supplémentaires ───────────────────────
  slots_1: {
    id: 'slots_1', branch: 'slots', tier: 1,
    name: 'Étagères supplémentaires',
    description: '+2 slots dans toutes les serres débloquées.',
    cost: 50, durationMs: 12 * 60 * 1000,
    prereq: null,
    effect: { extraSlots: 2 },
  },
  slots_2: {
    id: 'slots_2', branch: 'slots', tier: 2,
    name: 'Mezzanine',
    description: '+6 slots cumulés dans toutes les serres.',
    cost: 350, durationMs: 1 * 60 * 60 * 1000,
    prereq: 'slots_1',
    effect: { extraSlots: 6 },
  },
  slots_3: {
    id: 'slots_3', branch: 'slots', tier: 3,
    name: 'Aile entière',
    description: '+12 slots cumulés dans toutes les serres.',
    cost: 1800, durationMs: 4 * 60 * 60 * 1000,
    prereq: 'slots_2',
    effect: { extraSlots: 12 },
  },

  // ─── Hybridation : lab plus efficace ─────────────────────
  lab_1: {
    id: 'lab_1', branch: 'lab', tier: 1,
    name: 'Microscope optique',
    description: '−25% coût d\'hybridation, lab 15% plus rapide.',
    cost: 80, durationMs: 15 * 60 * 1000,
    prereq: null,
    effect: { hybridDiscount: 0.25, hybridSpeedup: 0.15 },
  },
  lab_2: {
    id: 'lab_2', branch: 'lab', tier: 2,
    name: 'Manipulation génétique',
    description: '+15% chance d\'obtenir un trait unique sur un hybride.',
    cost: 400, durationMs: 1 * 60 * 60 * 1000,
    prereq: 'lab_1',
    effect: { traitChanceBonus: 0.15 },
  },
  lab_3: {
    id: 'lab_3', branch: 'lab', tier: 3,
    name: 'Lab parallèle',
    description: 'Permet de mener 2 hybridations simultanément.',
    cost: 2000, durationMs: 4 * 60 * 60 * 1000,
    prereq: 'lab_2',
    effect: { parallelLab: true },
  },
};

export const TECH_LIST = Object.values(TECHS);

// Y a-t-il un prérequis non rempli ?
export function isUnlockable(techId, unlocked = []) {
  const t = TECHS[techId];
  if (!t) return false;
  if (unlocked.includes(techId)) return false;
  if (!t.prereq) return true;
  return unlocked.includes(t.prereq);
}

// ─── Helpers d'agrégation des bonus ──────────────────────────────
// Pour les branches "remplaçantes" (growth_2 remplace growth_1) on prend
// l'effet du tech le plus avancé débloqué dans la branche.
export function getResearchBonuses(unlocked = []) {
  const bonus = {
    growTimeReduction: 0,
    revenueBonus: 0,
    extraSlots: 0,
    hybridDiscount: 0,
    hybridSpeedup: 0,
    traitChanceBonus: 0,
    parallelLab: false,
  };
  for (const tid of unlocked) {
    const t = TECHS[tid];
    if (!t) continue;
    const e = t.effect ?? {};
    // Pour growth/trade/slots : on prend le max (tech remplace prédécesseur)
    if (e.growTimeReduction != null) bonus.growTimeReduction = Math.max(bonus.growTimeReduction, e.growTimeReduction);
    if (e.revenueBonus != null)      bonus.revenueBonus      = Math.max(bonus.revenueBonus, e.revenueBonus);
    if (e.extraSlots != null)        bonus.extraSlots        = Math.max(bonus.extraSlots, e.extraSlots);
    if (e.hybridDiscount != null)    bonus.hybridDiscount    = Math.max(bonus.hybridDiscount, e.hybridDiscount);
    if (e.hybridSpeedup != null)     bonus.hybridSpeedup     = Math.max(bonus.hybridSpeedup, e.hybridSpeedup);
    if (e.traitChanceBonus != null)  bonus.traitChanceBonus  = Math.max(bonus.traitChanceBonus, e.traitChanceBonus);
    if (e.parallelLab)               bonus.parallelLab = true;
  }
  return bonus;
}
