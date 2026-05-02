// Météo & Saisons — GDD §07 (mécanique 5) et Prompt 4.
// Le cycle : printemps → été → automne → hiver, durée configurable.
// Chaque saison a ses propres effets : multiplicateurs de revenu par espèce
// + bonus de croissance global. La météo se rafraîchit plus souvent.

export const SEASON_DURATION_MS = 10 * 60 * 1000; // 10 min réelles par saison
export const WEATHER_DURATION_MS = 90 * 1000;     // 90 sec par épisode météo

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_INFO = {
  spring: {
    id: 'spring',
    name: 'Printemps',
    icon: '🌸',
    color: '#e8a4b8',
    particleColor: '#f5d050',
    description: 'Toutes les plantes poussent +10 %. Tulipes, roses et pivoines triomphent.',
    growthBonus: 0.10,
    revenueBonus: 0.0,
  },
  summer: {
    id: 'summer',
    name: 'Été',
    icon: '☀️',
    color: '#d4a84b',
    particleColor: '#fff5d8',
    description: 'Saison des mariages : marché floral ×1.5. Lavande de Provence à son pic.',
    growthBonus: 0.0,
    revenueBonus: 0.50,
  },
  autumn: {
    id: 'autumn',
    name: 'Automne',
    icon: '🍂',
    color: '#c87a3a',
    particleColor: '#d4731f',
    description: 'Marché des bulbes en hausse. Les plantes tropicales souffrent un peu.',
    growthBonus: -0.05,
    revenueBonus: 0.10,
  },
  winter: {
    id: 'winter',
    name: 'Hiver',
    icon: '❄️',
    color: '#88c4d8',
    particleColor: '#f0f8ff',
    description: 'Marché de Noël ×2 (éphémère). Beaucoup de fleurs souffrent.',
    growthBonus: -0.20,
    revenueBonus: 1.00,
  },
};

// Multiplicateurs de revenu par espèce et par saison (additif au revenueBonus
// global). 0 = aucun effet, 0.30 = +30 %, -0.20 = -20 %.
// Source : GDD §07 — Mécanique 5.
export const SEASON_SPECIES_MULTIPLIERS = {
  daisy: { spring: 0.10, summer: 0.0, autumn: -0.05, winter: -0.20 },
  tulip: { spring: 0.30, summer: 0.0, autumn: -0.10, winter: -0.20 },
  rose:  { spring: 0.30, summer: 0.50, autumn: 0.0, winter: -0.10 },
  lavender: { spring: 0.05, summer: 0.40, autumn: 0.10, winter: -0.20 },
  peony: { spring: 0.30, summer: 0.40, autumn: 0.0, winter: -0.30 },
};

// ─── Météo (changement plus fréquent que la saison) ──────────────
export const WEATHER_BY_SEASON = {
  spring: ['sunny', 'cloudy', 'rain', 'rain'],
  summer: ['sunny', 'sunny', 'sunny', 'cloudy', 'storm'],
  autumn: ['cloudy', 'cloudy', 'rain', 'rain', 'storm'],
  winter: ['snow', 'snow', 'cloudy', 'sunny'],
};

export const WEATHER_INFO = {
  sunny:  { id: 'sunny',  name: 'Ensoleillé', icon: '☀️', growthBonus: 0.05, revenueBonus: 0.0 },
  cloudy: { id: 'cloudy', name: 'Nuageux',    icon: '☁️', growthBonus: 0.0,  revenueBonus: 0.0 },
  rain:   { id: 'rain',   name: 'Pluie',      icon: '🌧️', growthBonus: 0.10, revenueBonus: -0.05 },
  storm:  { id: 'storm',  name: 'Tempête',    icon: '⛈️', growthBonus: -0.10, revenueBonus: -0.10 },
  snow:   { id: 'snow',   name: 'Neige',      icon: '🌨️', growthBonus: -0.10, revenueBonus: 0.05 },
};

// ─── Helpers ─────────────────────────────────────────────────────
export function getSeasonMultiplier(speciesId, season) {
  const sp = SEASON_SPECIES_MULTIPLIERS[speciesId];
  if (!sp) return 0;
  return sp[season] ?? 0;
}

export function getSeasonRevenueMultiplier(season) {
  return 1 + (SEASON_INFO[season]?.revenueBonus ?? 0);
}

export function getSeasonGrowthMultiplier(season) {
  return 1 + (SEASON_INFO[season]?.growthBonus ?? 0);
}

export function getWeatherEffect(weatherId) {
  const w = WEATHER_INFO[weatherId] ?? WEATHER_INFO.cloudy;
  return {
    growthBonus: w.growthBonus,
    revenueBonus: w.revenueBonus,
    description: w.name,
  };
}

// Saison suivante dans le cycle
export function nextSeason(current) {
  const idx = SEASONS.indexOf(current);
  return SEASONS[(idx + 1) % SEASONS.length];
}

// Tirage déterministe d'une météo en fonction de la saison + d'un seed
export function pickWeatherForSeason(season, seed = Math.random()) {
  const choices = WEATHER_BY_SEASON[season] ?? ['sunny'];
  const idx = Math.floor(seed * choices.length);
  return choices[idx];
}
