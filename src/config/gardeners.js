// 3 jardiniers par serre — chacun a une spécialité qui boost certaines espèces.
// Coût exponentiel : on en achète plus, le suivant coûte plus cher.
// Source : GDD §07 (Mécaniques détaillées — Jardiniers).
//
// Effets :
//  · Le slot reste vide après la vente, sauf si au moins 1 jardinier est embauché
//    dans la serre — auquel cas la même espèce est replantée automatiquement.
//  · Bonus de revenu sur les espèces de la spécialité (additif entre jardiniers).
export const GARDENERS = {
  // ── Serre tempérée ────────────────────────────────────────
  marie: {
    id: 'marie',
    greenhouseId: 'temperate',
    name: 'Marie la Florale',
    icon: '👩‍🌾',
    specialty: 'Fleurs classiques',
    speciesBonus: { tulip: 0.20, rose: 0.20, peony: 0.25 },
    description: 'Ancienne fleuriste à Lyon. Sait reconnaître une rose au parfum.',
    cost: 200,
  },
  paul: {
    id: 'paul',
    greenhouseId: 'temperate',
    name: 'Paul l\'Aromatique',
    icon: '🧑‍🌾',
    specialty: 'Plantes aromatiques',
    speciesBonus: { lavender: 0.40, daisy: 0.10 },
    description: 'A grandi en Provence dans les champs de lavande.',
    cost: 1500,
  },
  agnes2: {
    id: 'agnes2',
    greenhouseId: 'temperate',
    name: 'Agnès Junior',
    icon: '👧',
    specialty: 'Polyvalente',
    speciesBonus: { daisy: 0.10, tulip: 0.10, rose: 0.10, lavender: 0.10, peony: 0.15 },
    description: 'Stagiaire enthousiaste. Boost modeste mais sur toutes les espèces.',
    cost: 12000,
  },
};

export const GARDENERS_BY_GREENHOUSE = Object.values(GARDENERS).reduce((acc, g) => {
  if (!acc[g.greenhouseId]) acc[g.greenhouseId] = [];
  acc[g.greenhouseId].push(g);
  return acc;
}, {});
