// Tapis roulant — cartes qui défilent en bas de l'écran et que le joueur
// peut "saisir" en cliquant avant qu'elles sortent. Inspiré des tycoons
// Fortnite (counter de droïdes) : chaque carte est un mini-investissement
// avec un coût et un effet, et la rareté détermine la magnitude + le ROI.
//
// Le coût est exprimé en *multiples du €/s actuel* — ça scale tout au long
// de la partie sans avoir à toucher la config.

export const CONVEYOR = {
  // Cadence de spawn (ms entre 2 cartes). Légèrement randomisée à chaque
  // spawn pour ne pas être trop métronomique.
  spawnIntervalMs: 3200,
  spawnJitterMs: 800,

  // Durée d'une carte sur le tapis (ms). Au-delà, elle disparaît sans
  // effet — c'est ce qui crée la pression de décision.
  lifetimeMs: 7500,

  // Nombre max de cartes affichées en simultané (le surplus n'est pas spawn).
  maxOnBelt: 4,

  // Seuil de déblocage (lifetimeEuros). On laisse le joueur découvrir les
  // bases avant d'introduire ce nouveau loop.
  unlockAt: 1500,

  // Probabilités par rareté. Doivent sommer à 1.
  // À fort multiplicateur global (×3+), on tirera un peu plus de rares
  // pour récompenser le boost (cf. pickRarity ci-dessous).
  rarityWeights: {
    common: 0.55,
    rare: 0.28,
    epic: 0.13,
    legendary: 0.04,
  },
};

// Couleurs et libellés par rareté (utilisés dans le CSS via class .rarity-X)
export const RARITY_META = {
  common:    { label: 'Commun',    color: '#9ca3af', glow: 'rgba(156,163,175,.4)' },
  rare:      { label: 'Rare',      color: '#60a5fa', glow: 'rgba(96,165,250,.5)'  },
  epic:      { label: 'Épique',    color: '#c084fc', glow: 'rgba(192,132,252,.55)' },
  legendary: { label: 'Légendaire',color: '#fbbf24', glow: 'rgba(251,191,36,.65)' },
};

// Tirage pondéré d'une rareté. Le multiplicateur global déplace légèrement
// la distribution vers le haut (récompense les joueurs qui boostent activement).
export function pickRarity(globalMulti = 1) {
  const w = { ...CONVEYOR.rarityWeights };
  if (globalMulti >= 3) {
    // Décale 5% du commun vers le rare et 2% du rare vers l'épique
    w.common -= 0.05;
    w.rare += 0.05;
    w.rare -= 0.02;
    w.epic += 0.02;
  }
  const r = Math.random();
  let acc = 0;
  for (const [rarity, weight] of Object.entries(w)) {
    acc += weight;
    if (r <= acc) return rarity;
  }
  return 'common';
}

// Catalogue des effets possibles. Chaque carte = { type, payload }.
// Le coût et la magnitude sont calculés au spawn (pas hardcodés ici)
// pour rester proportionnels au revenu actuel du joueur.
//
// type 'cash'  → +N € instantanés
// type 'boost' → ×M revenu pendant Ds secondes
// type 'seed'  → +N graines rares
const TYPES_BY_RARITY = {
  common:    ['cash', 'cash', 'boost', 'seed'],     // 50% cash, 25% boost, 25% seed
  rare:      ['cash', 'boost', 'boost', 'seed'],    // booste un peu le boost
  epic:      ['boost', 'boost', 'cash', 'seed'],
  legendary: ['boost', 'cash', 'seed'],
};

// Génère une carte concrète à partir de la rareté + revenu actuel.
// `incomePerSecond` sert d'unité de référence pour rester scaling-proof.
export function rollCard(rarity, incomePerSecond) {
  const types = TYPES_BY_RARITY[rarity] ?? TYPES_BY_RARITY.common;
  const type = types[Math.floor(Math.random() * types.length)];
  // Plancher de référence : on n'utilise jamais < 1 €/s pour éviter
  // les cartes "0 €" en début de partie.
  const ips = Math.max(1, incomePerSecond);

  if (type === 'cash') {
    // Multiplicateurs (gain, coût) par rareté. Toutes les cartes cash sont
    // ROI positif (gain > coût) — la "tension" vient du timing/budget.
    const M = {
      common:    { gain: 12,  cost: 5   },
      rare:      { gain: 45,  cost: 18  },
      epic:      { gain: 180, cost: 70  },
      legendary: { gain: 800, cost: 280 },
    }[rarity];
    return {
      type: 'cash',
      icon: '💸',
      label: 'Récolte éclair',
      gain: Math.round(ips * M.gain),
      cost: Math.round(ips * M.cost),
    };
  }

  if (type === 'boost') {
    const M = {
      common:    { mult: 1.3, dur: 15, cost: 4  },
      rare:      { mult: 1.6, dur: 25, cost: 18 },
      epic:      { mult: 2.2, dur: 40, cost: 70 },
      legendary: { mult: 3.5, dur: 60, cost: 250 },
    }[rarity];
    return {
      type: 'boost',
      icon: '⚡',
      label: 'Sève boostée',
      multiplier: M.mult,
      durationMs: M.dur * 1000,
      cost: Math.round(ips * M.cost),
    };
  }

  // type === 'seed'
  const M = {
    common:    { qty: 1,  cost: 6   },
    rare:      { qty: 3,  cost: 18  },
    epic:      { qty: 8,  cost: 60  },
    legendary: { qty: 25, cost: 220 },
  }[rarity];
  return {
    type: 'seed',
    icon: '🌟',
    label: 'Graines rares',
    quantity: M.qty,
    cost: Math.round(ips * M.cost),
  };
}
