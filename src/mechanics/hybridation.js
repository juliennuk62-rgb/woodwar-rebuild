// Hybridation — GDD §07 (mécanique 3) + Prompt 7.
// Croiser deux espèces pour en créer une nouvelle aux propriétés aléatoires.
// L'hybride hérite des stats moyennes des parents avec une variance.
// Si les deux biomes diffèrent : rareté boostée + chance de trait unique.
import { PLANTS } from '../config/plants.js';

export const HYBRID_BASE_COST = 5;          // graines rares
export const HYBRID_BASE_DURATION_MS = 5 * 60 * 1000;
export const HYBRID_DURATION_PER_RARITY = 90 * 1000; // +90s par point de rareté max parent
export const TRAIT_CHANCE_SAME_BIOME = 0.05;
export const TRAIT_CHANCE_CROSS_BIOME = 0.30;
// Tech lab_3 : chance d'un 2ᵉ trait sur l'hybride.
export const SECOND_TRAIT_CHANCE = 0.08;

// Traits uniques possibles — GDD §07
// `weight` (optionnel, défaut 1) module la pondération de la pioche aléatoire :
// les traits puissants (monarch) sont volontairement rarissimes.
export const TRAITS = {
  bioluminescent: {
    id: 'bioluminescent',
    name: 'Bioluminescent',
    icon: '✨',
    description: 'Brille dans l\'obscurité. Revenu ×2.',
    revenueMul: 2.0,
    growMul: 1.0,
    weight: 1,
  },
  fast_grower: {
    id: 'fast_grower',
    name: 'Pousse fulgurante',
    icon: '⚡',
    description: 'Pousse 2× plus vite que prévu.',
    revenueMul: 1.0,
    growMul: 0.5,
    weight: 1,
  },
  fragrant: {
    id: 'fragrant',
    name: 'Parfumé',
    icon: '🌸',
    description: 'Marché stable : prix toujours ≥ 1.0×.',
    revenueMul: 1.15,
    growMul: 1.0,
    marketFloor: 1.0,
    weight: 1,
  },
  eternal: {
    id: 'eternal',
    name: 'Éternel',
    icon: '♾️',
    description: 'Le coût de graine n\'augmente pas avec les achats.',
    revenueMul: 1.0,
    growMul: 1.0,
    flatSeedCost: true,
    weight: 1,
  },
  royal: {
    id: 'royal',
    name: 'Royal',
    icon: '👑',
    description: 'Lignée noble. Revenu ×1.5 et rareté boostée.',
    revenueMul: 1.5,
    growMul: 1.0,
    rarityBonus: 1,
    weight: 1,
  },
  hardy: {
    id: 'hardy',
    name: 'Robuste',
    icon: '🛡️',
    description: 'Résiste aux saisons. Revenu ×1.15 et marché ≥ 1.0×.',
    revenueMul: 1.15,
    growMul: 1.0,
    marketFloor: 1.0,
    weight: 1,
  },
  prolific: {
    id: 'prolific',
    name: 'Prolifique',
    icon: '🌾',
    description: 'Coût de graine divisé par deux à la création.',
    revenueMul: 1.0,
    growMul: 1.0,
    seedCostHalf: true,
    weight: 1,
  },
  monarch: {
    id: 'monarch',
    name: 'Monarque',
    icon: '🦋',
    description: 'Trait légendaire. Revenu ×1.8 et pousse 0.6×.',
    revenueMul: 1.8,
    growMul: 0.6,
    weight: 0.15, // TRÈS rare
  },
};

const TRAIT_KEYS = Object.keys(TRAITS);

// Pioche pondérée d'un trait. Évite les doublons via `excludeIds`.
function pickWeightedTrait(excludeIds = []) {
  const pool = TRAIT_KEYS.filter((id) => !excludeIds.includes(id));
  if (pool.length === 0) return null;
  let total = 0;
  for (const id of pool) total += TRAITS[id].weight ?? 1;
  let r = Math.random() * total;
  for (const id of pool) {
    r -= TRAITS[id].weight ?? 1;
    if (r <= 0) return id;
  }
  return pool[pool.length - 1];
}

// Coût d'une hybridation, modulé par les recherches débloquées.
export function hybridizationCost(researchUnlocked = []) {
  let discount = 0;
  if (researchUnlocked.includes('lab_1')) discount = 0.25;
  return Math.max(1, Math.round(HYBRID_BASE_COST * (1 - discount)));
}

// Durée du processus en lab, fonction de la rareté max des parents.
export function hybridizationDurationMs(parent1, parent2, researchUnlocked = []) {
  const maxRarity = Math.max(parent1.rarity, parent2.rarity);
  let duration = HYBRID_BASE_DURATION_MS + maxRarity * HYBRID_DURATION_PER_RARITY;
  if (researchUnlocked.includes('lab_1')) duration *= 0.85;
  return Math.round(duration);
}

// Génère un hybride à partir de deux parents — appelé à la fin du timer de lab.
// `traitChanceBonus` (optionnel) : bonus additif issu des achievements (a_hyb_*).
export function buildHybrid({ parent1Id, parent2Id, hybridIndex, researchUnlocked = [], traitChanceBonus = 0 }) {
  const p1 = PLANTS[parent1Id];
  const p2 = PLANTS[parent2Id];
  if (!p1 || !p2) return null;

  const sameBiome = p1.biome === p2.biome;
  const traitChance = sameBiome
    ? TRAIT_CHANCE_SAME_BIOME
    : TRAIT_CHANCE_CROSS_BIOME;
  // Tech lab_2 : +15% chance trait rare ; achievements : +N% supplémentaires.
  const labBonus = researchUnlocked.includes('lab_2') ? 0.15 : 0;
  const finalTraitChance = Math.min(1, traitChance + labBonus + (traitChanceBonus ?? 0));

  // Stats héritées avec variance aléatoire
  const growVariance = 0.7 + Math.random() * 0.6;          // 0.7 - 1.3
  const revenueVariance = 0.8 + Math.random() * 1.2;       // 0.8 - 2.0
  let growTime = ((p1.growTime + p2.growTime) / 2) * growVariance;
  let baseRevenue = ((p1.baseRevenue + p2.baseRevenue) / 2) * revenueVariance;
  let rarity = Math.max(p1.rarity, p2.rarity) + 1;
  if (!sameBiome) rarity += 2;
  let seedCost = Math.max(20, Math.round((p1.seedCost + p2.seedCost) * 1.5));

  // Trait(s) unique(s) possible(s)
  const traits = [];
  if (Math.random() < finalTraitChance) {
    const first = pickWeightedTrait();
    if (first) traits.push(first);
    // Tech lab_3 : 8% de chance d'un 2ᵉ trait (différent du premier).
    if (researchUnlocked.includes('lab_3') && Math.random() < SECOND_TRAIT_CHANCE) {
      const second = pickWeightedTrait(traits);
      if (second) traits.push(second);
    }
  }

  // Application multiplicative de tous les traits sélectionnés.
  for (const tid of traits) {
    const t = TRAITS[tid];
    growTime *= t.growMul ?? 1;
    baseRevenue *= t.revenueMul ?? 1;
    if (t.flatSeedCost || t.marketFloor) rarity += 1;
    if (t.rarityBonus) rarity += t.rarityBonus;
    if (t.seedCostHalf) seedCost = Math.max(1, Math.floor(seedCost / 2));
  }

  const primaryTrait = traits[0] ?? null;
  const id = `hyb_${String(hybridIndex).padStart(3, '0')}`;
  const name = generateName(p1, p2, hybridIndex, primaryTrait);
  const biome = sameBiome ? p1.biome : 'hybrid';

  return {
    id,
    name,
    scientificName: `${p1.id} × ${p2.id}`,
    icon: primaryTrait === 'bioluminescent' ? '🌟'
      : primaryTrait === 'eternal' ? '♾️'
      : primaryTrait === 'monarch' ? '🦋'
      : primaryTrait === 'royal' ? '👑'
      : '🌷',
    biome,
    rarity,
    growTime: Math.round(growTime),
    baseRevenue: Math.round(baseRevenue),
    seedCost,
    color: blendColor(p1.color, p2.color),
    petalColor: blendColor(p1.petalColor, p2.petalColor),
    height: (p1.height + p2.height) / 2,
    description: traits.length
      ? `Hybride aux propriétés uniques — ${traits.map((t) => TRAITS[t].description).join(' ')}`
      : `Croisement réussi entre ${p1.name} et ${p2.name}.`,
    poetic: traits.length
      ? `${traits.map((t) => `${TRAITS[t].icon} ${TRAITS[t].name}`).join(' + ')} — l\'inattendu surgit du laboratoire.`
      : `Né du croisement patient de deux lignées.`,
    // Métadonnées hybride
    isHybrid: true,
    parent1: parent1Id,
    parent2: parent2Id,
    // Nouveau format : liste des traits. `trait` reste exposé pour la
    // rétro-compatibilité avec d'éventuels call sites legacy.
    traits,
    trait: primaryTrait,
    createdAt: Date.now(),
  };
}

function generateName(p1, p2, index, trait) {
  const traitPrefix = {
    bioluminescent: 'Étoile',
    fast_grower: 'Flèche',
    fragrant: 'Aubépine',
    eternal: 'Vivace',
    royal: 'Couronne',
    hardy: 'Rempart',
    prolific: 'Gerbe',
    monarch: 'Monarque',
  };
  if (trait && traitPrefix[trait]) {
    return `${traitPrefix[trait]} de ${p1.name.split(' ').slice(-1)[0]}`;
  }
  // Sinon : nom simple "Croisement de X et Y n°N"
  const a = p1.name.split(' ').slice(-1)[0];
  const b = p2.name.split(' ').slice(-1)[0];
  return `${a}-${b} #${index}`;
}

// Mélange simple de deux couleurs hex
function blendColor(c1, c2) {
  const hex = (c) => parseInt(c.replace('#', ''), 16);
  const r = (h) => (h >> 16) & 0xff;
  const g = (h) => (h >> 8) & 0xff;
  const b = (h) => h & 0xff;
  const h1 = hex(c1);
  const h2 = hex(c2);
  const mr = Math.round((r(h1) + r(h2)) / 2);
  const mg = Math.round((g(h1) + g(h2)) / 2);
  const mb = Math.round((b(h1) + b(h2)) / 2);
  return `#${[mr, mg, mb].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
