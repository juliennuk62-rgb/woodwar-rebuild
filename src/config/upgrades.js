// 4 upgrades par serre × 5 niveaux. GDD §05 (Upgrades par serre) + §07.
// Chaque type a un effet additif par niveau et un coût qui croît exponentiellement.

export const UPGRADE_TYPES = {
  lighting: {
    id: 'lighting',
    name: 'Éclairage',
    icon: '💡',
    description: 'Lampes LED, spectre complet, UV. Réduit le temps de pousse.',
    effectLabel: 'Temps de pousse',
    effectPerLevel: 0.10,        // -10% growTime par niveau
    effectKind: 'growTimeReduction',
    baseCost: 80,
    costGrowth: 4.0,
    maxLevel: 5,
  },
  irrigation: {
    id: 'irrigation',
    name: 'Irrigation',
    icon: '💧',
    description: 'Système d\'arrosage automatique. Améliore la récolte manuelle.',
    effectLabel: 'Bonus récolte manuelle',
    effectPerLevel: 0.05,        // +5% bonus manuel par niveau
    effectKind: 'manualBonus',
    baseCost: 250,
    costGrowth: 4.5,
    maxLevel: 5,
  },
  climate: {
    id: 'climate',
    name: 'Climatisation',
    icon: '🌡️',
    description: 'Contrôle de température et humidité. Augmente le revenu.',
    effectLabel: 'Revenu',
    effectPerLevel: 0.15,        // +15% revenu par niveau
    effectKind: 'revenueMultiplier',
    baseCost: 600,
    costGrowth: 5.0,
    maxLevel: 5,
  },
  soil: {
    id: 'soil',
    name: 'Sol enrichi',
    icon: '🧪',
    description: 'Engrais premium, microbiome optimisé. Boost massif sur tout.',
    effectLabel: 'Revenu (multiplicateur)',
    effectPerLevel: 0.20,        // +20% revenu par niveau
    effectKind: 'revenueMultiplier',
    baseCost: 2000,
    costGrowth: 6.0,
    maxLevel: 5,
  },
};

export const UPGRADE_LIST = Object.values(UPGRADE_TYPES);

// Coût pour passer du niveau N → N+1
export function upgradeCost(typeId, currentLevel) {
  const t = UPGRADE_TYPES[typeId];
  if (!t || currentLevel >= t.maxLevel) return Infinity;
  return Math.round(t.baseCost * Math.pow(t.costGrowth, currentLevel));
}

// Coût total pour acheter `count` niveaux successifs à partir de currentLevel.
// Plafonné par maxLevel : si on demande plus que ce qui reste, on s'arrête.
// Retourne { totalCost, levels } où levels est le nombre de niveaux pris en
// compte (peut être < count si on heurte le maxLevel).
export function bulkUpgradeCost(typeId, currentLevel, count) {
  const t = UPGRADE_TYPES[typeId];
  if (!t) return { totalCost: 0, levels: 0 };
  const remaining = Math.max(0, t.maxLevel - currentLevel);
  const levels = Math.min(remaining, Math.max(0, count));
  let totalCost = 0;
  for (let i = 0; i < levels; i++) {
    totalCost += upgradeCost(typeId, currentLevel + i);
  }
  return { totalCost, levels };
}

// Combien de niveaux on peut s'offrir (plafonné par maxLevel ET par budget).
// Retourne { totalCost, levels }.
export function maxAffordableUpgrade(typeId, currentLevel, budget) {
  const t = UPGRADE_TYPES[typeId];
  if (!t) return { totalCost: 0, levels: 0 };
  const remaining = Math.max(0, t.maxLevel - currentLevel);
  let totalCost = 0;
  let levels = 0;
  for (let i = 0; i < remaining; i++) {
    const c = upgradeCost(typeId, currentLevel + i);
    if (totalCost + c > budget) break;
    totalCost += c;
    levels++;
  }
  return { totalCost, levels };
}
