import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import {
  SEASON_INFO,
  WEATHER_INFO,
  SEASONS,
  nextSeason,
  SEASON_SPECIES_MULTIPLIERS,
} from '../mechanics/weather.js';
import { PLANTS } from '../config/plants.js';
import { formatDuration } from '../utils/numberFormat.js';

// Petit widget en haut du HUD : icône saison + météo + compte à rebours.
// Au clic, ouvre un mini-tooltip listant tous les effets.
export default function WeatherWidget() {
  const season = useGameStore((s) => s.market.currentSeason);
  const weather = useGameStore((s) => s.market.weather);
  const seasonEndsAt = useGameStore((s) => s.market.seasonEndsAt);

  const [tooltip, setTooltip] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const seasonInfo = SEASON_INFO[season];
  const weatherInfo = WEATHER_INFO[weather] ?? WEATHER_INFO.cloudy;
  const remainingSec = Math.max(0, Math.floor((seasonEndsAt - now) / 1000));
  const next = SEASON_INFO[nextSeason(season)];

  return (
    <div className="weather-widget">
      <button
        className="weather-btn"
        onClick={() => setTooltip((t) => !t)}
        style={{ borderColor: seasonInfo.color }}
        title="Voir les effets de la saison"
      >
        <span className="weather-season">{seasonInfo.icon}</span>
        <span className="weather-cur">{weatherInfo.icon}</span>
        <span className="weather-time">{formatDuration(remainingSec)}</span>
      </button>

      {tooltip && (
        <div className="weather-tooltip" onClick={() => setTooltip(false)}>
          <div className="wt-row wt-row-head">
            <strong>{seasonInfo.icon} {seasonInfo.name}</strong>
            <span className="wt-meta">→ {next.icon} {next.name} dans {formatDuration(remainingSec)}</span>
          </div>
          <p className="wt-desc">{seasonInfo.description}</p>

          <div className="wt-row">
            <span>Météo : {weatherInfo.icon} {weatherInfo.name}</span>
            <span className="wt-meta">{describeWeather(weatherInfo)}</span>
          </div>

          <div className="wt-section-title">Effets sur les espèces</div>
          <div className="wt-effects">
            {Object.entries(SEASON_SPECIES_MULTIPLIERS).map(([speciesId, mults]) => {
              const value = mults[season] ?? 0;
              const sp = PLANTS[speciesId];
              if (!sp || value === 0) return null;
              return (
                <div key={speciesId} className={`wt-eff ${value > 0 ? 'good' : 'bad'}`}>
                  <span>{sp.icon} {sp.name}</span>
                  <strong>{value > 0 ? '+' : ''}{Math.round(value * 100)}%</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function describeWeather(w) {
  const parts = [];
  if (w.growthBonus) parts.push(`Croissance ${w.growthBonus > 0 ? '+' : ''}${Math.round(w.growthBonus * 100)}%`);
  if (w.revenueBonus) parts.push(`Revenu ${w.revenueBonus > 0 ? '+' : ''}${Math.round(w.revenueBonus * 100)}%`);
  if (parts.length === 0) return 'Pas d\'effet';
  return parts.join(' · ');
}
