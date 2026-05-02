// Les 5 espèces de base de la Serre 1 (tempérée).
// Données issues du GDD §04 — Générateurs.
// growTime en secondes · baseRevenue et seedCost en €.
export const PLANTS = {
  daisy: {
    id: 'daisy',
    name: 'Marguerite commune',
    icon: '🌼',
    biome: 'temperate',
    rarity: 1,
    growTime: 120,        // 2 min
    baseRevenue: 5,
    seedCost: 1,
    color: '#f5e6a8',
    petalColor: '#ffffff',
    height: 0.5,
    description: 'Première plante débloquée. Pousse vite, vend peu. Le tutoriel en pratique.',
    unlockedFromStart: true,
  },
  tulip: {
    id: 'tulip',
    name: 'Tulipe hollandaise',
    icon: '🌷',
    biome: 'temperate',
    rarity: 2,
    growTime: 480,        // 8 min
    baseRevenue: 22,
    seedCost: 6,
    color: '#e07a92',
    petalColor: '#e85a82',
    height: 0.7,
    description: 'Classique du marché floral. Demande fluctuante selon la saison.',
    unlockCost: 50,
  },
  rose: {
    id: 'rose',
    name: 'Rose de Damas',
    icon: '🌹',
    biome: 'temperate',
    rarity: 3,
    growTime: 1500,       // 25 min
    baseRevenue: 85,
    seedCost: 22,
    color: '#c63950',
    petalColor: '#d63b5a',
    height: 0.9,
    description: 'Très prisée pour la parfumerie. Prix élevé, pousse lente.',
    unlockCost: 500,
  },
  lavender: {
    id: 'lavender',
    name: 'Lavande de Provence',
    icon: '🪻',
    biome: 'temperate',
    rarity: 2,
    growTime: 900,        // 15 min
    baseRevenue: 45,
    seedCost: 14,
    color: '#9d7ec8',
    petalColor: '#a87ec4',
    height: 0.8,
    description: 'Résistante, populaire. Bonus de rendement en été.',
    unlockCost: 200,
  },
  peony: {
    id: 'peony',
    name: 'Pivoine impériale',
    icon: '🌺',
    biome: 'temperate',
    rarity: 4,
    growTime: 3600,       // 60 min
    baseRevenue: 280,
    seedCost: 80,
    color: '#e8a4b8',
    petalColor: '#f0b4c4',
    height: 1.1,
    description: 'Fleur haut de gamme. Marché de luxe uniquement.',
    unlockCost: 5000,
  },
};

export const PLANT_LIST = Object.values(PLANTS);
