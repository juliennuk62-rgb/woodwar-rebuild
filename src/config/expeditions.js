// 4 destinations d'expédition — GDD §07 (mécanique 2) + Prompt 6.
// Chaque destination renvoie potentiellement une nouvelle espèce de son biome
// + des Graines Rares (devise premium).
//
// Coûts pensés pour s'enchaîner naturellement avec la progression :
//   France  : 200 €  (early game, source de graines rares)
//   Indonésie : 5 000 €  (préparation Serre Tropicale à 50 k)
//   Maroc   : 50 000 €  (préparation Serre Aride à 500 k)
//   Islande : 500 000 € (préparation Serre Polaire à 5 M)
export const EXPEDITIONS = {
  france: {
    id: 'france',
    name: 'France',
    icon: '🇫🇷',
    region: 'Locale (jardins du Sud)',
    description: 'Tour des botanistes locaux. Pas de découverte exotique, mais des graines rares à coup sûr.',
    cost: 200,
    durationMs: 2 * 60 * 1000,
    biome: 'temperate',
    discoveryChance: 0.0,
    rareSeedsRange: [2, 5],
    color: '#7ec87a',
    coords: { x: 50, y: 32 },     // pourcentage sur la mini-carte
    unlockCost: 0,
  },
  indonesia: {
    id: 'indonesia',
    name: 'Indonésie',
    icon: '🇮🇩',
    region: 'Sumatra & Bali',
    description: 'Forêts tropicales. Risque de croiser une orchidée légendaire ou un lotus sacré.',
    cost: 5000,
    durationMs: 5 * 60 * 1000,
    biome: 'tropical',
    discoveryChance: 0.65,
    rareSeedsRange: [3, 8],
    color: '#88c4d8',
    coords: { x: 80, y: 60 },
    unlockCost: 1000,
  },
  morocco: {
    id: 'morocco',
    name: 'Maroc',
    icon: '🇲🇦',
    region: 'Atlas & Sahara',
    description: 'Plateaux désertiques où poussent des espèces résistantes au soleil brûlant.',
    cost: 50000,
    durationMs: 8 * 60 * 1000,
    biome: 'arid',
    discoveryChance: 0.65,
    rareSeedsRange: [5, 12],
    color: '#d4a84b',
    coords: { x: 48, y: 50 },
    unlockCost: 20000,
  },
  iceland: {
    id: 'iceland',
    name: 'Islande',
    icon: '🇮🇸',
    region: 'Toundra & glaciers',
    description: 'Terres extrêmes. Peu d\'espèces survivent ici — celles qui réussissent valent une fortune.',
    cost: 500000,
    durationMs: 12 * 60 * 1000,
    biome: 'arctic',
    discoveryChance: 0.7,
    rareSeedsRange: [10, 25],
    color: '#a4c8e8',
    coords: { x: 42, y: 18 },
    unlockCost: 200000,
  },
};

export const EXPEDITION_LIST = Object.values(EXPEDITIONS);
export const MAX_CONCURRENT_EXPEDITIONS = 2;
