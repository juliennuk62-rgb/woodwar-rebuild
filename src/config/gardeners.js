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

  // ─── Serre Tropicale (Indonésie) ─────────────────────────
  kira: {
    id: 'kira',
    greenhouseId: 'tropical',
    name: 'Kira la Jungliste',
    icon: '🧕',
    specialty: 'Plantes humides',
    speciesBonus: { orchid: 0.30, lotus: 0.25, hibiscus: 0.15 },
    description: 'A passé dix ans dans les forêts de Sumatra. Sait écouter pousser une orchidée.',
    cost: 4000,
  },
  rama: {
    id: 'rama',
    greenhouseId: 'tropical',
    name: 'Rama de l\'Archipel',
    icon: '🧑‍🌾',
    specialty: 'Parfumerie tropicale',
    speciesBonus: { ylang: 0.40, hibiscus: 0.20 },
    description: 'Maître parfumeur indonésien. L\'ylang n\'a aucun secret pour lui.',
    cost: 30000,
  },
  maya: {
    id: 'maya',
    greenhouseId: 'tropical',
    name: 'Maya la Patiente',
    icon: '🧘‍♀️',
    specialty: 'Polyvalente tropicale',
    speciesBonus: { orchid: 0.10, hibiscus: 0.10, lotus: 0.15, ylang: 0.10 },
    description: 'Botaniste senior, sereine. Booste tout ce qui pousse sous les tropiques.',
    cost: 200000,
  },

  // ─── Serre Aride (Maroc) ─────────────────────────────────
  hassan: {
    id: 'hassan',
    greenhouseId: 'arid',
    name: 'Hassan le Sourcier',
    icon: '🧔',
    specialty: 'Eau & survie',
    speciesBonus: { desert_rose: 0.30, cactus: 0.25 },
    description: 'Sait toucher une plante du désert sans la blesser. Vingt ans d\'oasis.',
    cost: 50000,
  },
  layla: {
    id: 'layla',
    greenhouseId: 'arid',
    name: 'Layla la Rocailleuse',
    icon: '👩',
    specialty: 'Épices précieuses',
    speciesBonus: { saffron: 0.50, cactus: 0.10 },
    description: 'Cultive le safran depuis l\'enfance. Récolte ses fleurs pétale par pétale.',
    cost: 300000,
  },
  tariq: {
    id: 'tariq',
    greenhouseId: 'arid',
    name: 'Tariq le Caravanier',
    icon: '🧑',
    specialty: 'Polyvalente aride',
    speciesBonus: { desert_rose: 0.15, cactus: 0.15, saffron: 0.10 },
    description: 'Connaît tous les marchés du sud. Booste toute la serre aride.',
    cost: 2000000,
  },

  // ─── Serre Polaire (Islande) ─────────────────────────────
  ingrid: {
    id: 'ingrid',
    greenhouseId: 'arctic',
    name: 'Ingrid des Fjords',
    icon: '👩‍🦳',
    specialty: 'Espèces alpines',
    speciesBonus: { edelweiss: 0.40, glow_moss: 0.20 },
    description: 'Née sur un glacier. Parle aux edelweiss avant l\'aube polaire.',
    cost: 500000,
  },
  tor: {
    id: 'tor',
    greenhouseId: 'arctic',
    name: 'Tor de la Toundra',
    icon: '🧔‍♂️',
    specialty: 'Plantes lumineuses',
    speciesBonus: { glow_moss: 0.40, aurora_lily: 0.30 },
    description: 'Étudie la bioluminescence depuis trente ans. La nuit est son atelier.',
    cost: 3000000,
  },
  sigrid: {
    id: 'sigrid',
    greenhouseId: 'arctic',
    name: 'Sigrid la Glacière',
    icon: '🧝‍♀️',
    specialty: 'Polyvalente polaire',
    speciesBonus: { edelweiss: 0.15, glow_moss: 0.15, aurora_lily: 0.20 },
    description: 'Cheffe d\'expédition légendaire. Booste toute la serre polaire.',
    cost: 20000000,
  },
};

export const GARDENERS_BY_GREENHOUSE = Object.values(GARDENERS).reduce((acc, g) => {
  if (!acc[g.greenhouseId]) acc[g.greenhouseId] = [];
  acc[g.greenhouseId].push(g);
  return acc;
}, {});
