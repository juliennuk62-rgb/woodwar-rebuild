import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';
import { getAchievementBonus } from '../mechanics/quests.js';
import { getResearchBonuses } from '../mechanics/research.js';
import WeatherWidget from './WeatherWidget.jsx';

// Calcule le multiplicateur global "joueur" (les bonus qui s'appliquent
// partout, pas spécifiques à une serre). Stable pour l'affichage HUD.
function computeGlobalMultiplier(s) {
  const a = getAchievementBonus(s.quests?.claimed ?? {}).revenueBonus ?? 0;
  const r = getResearchBonuses(s.research?.unlocked ?? []).revenueBonus ?? 0;
  const p = s.permanentBonuses?.revenueBonus ?? 0;
  const now = Date.now();
  const water = (now < s.waterBoostEndsAt) ? 1 + (s.waterBoostStacks ?? 0) * 0.25 : 1;
  const bee = (s.activeBoost && s.activeBoost.endsAt > now) ? (s.activeBoost.multiplier ?? 1) : 1;
  return (1 + a) * (1 + r) * (1 + p) * water * bee;
}

// HUD façon Satisfactory : un seul chiffre central HUGE (€/s) avec couleur
// gradient, et le reste replié en pills discrètes autour. Le brand titre
// est minimal (juste l'icône de la serre active dans une pill).
export default function HUD() {
  const euros = useGameStore((s) => s.currency.euros);
  const rareSeeds = useGameStore((s) => s.currency.rareSeeds);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const setViewMode = useGameStore((s) => s.setViewMode);

  // €/s + multiplicateur global mis à jour 2×/s. Lecture via getState()
  // pour stabilité du timer.
  const [income, setIncome] = useState(0);
  const [multi, setMulti] = useState(1);
  useEffect(() => {
    const tick = () => {
      const s = useGameStore.getState();
      setIncome(s.getIncomePerSecond());
      setMulti(computeGlobalMultiplier(s));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, []);

  const usedSlots = greenhouse.plants.length;

  return (
    <header className="hud-top hud-top--hero">
      {/* Pile gauche : actions secondaires */}
      <div className="hud-side hud-side-left">
        <button
          className="hud-pill hud-pill-action"
          onClick={() => setViewMode('map')}
          title="Vue d'ensemble"
          aria-label="Ouvrir la vue d'ensemble"
        >
          🗺️ <span className="hud-pill-text">Vue</span>
        </button>
        <div className="hud-pill" title={config.name}>
          {config.icon} <span className="hud-pill-text">{config.name}</span>
        </div>
      </div>

      {/* Centre : un GROS chiffre €/s qui pulse */}
      <div className="hud-hero">
        <div className="hud-hero-value">
          + {formatNumber(income, { decimals: 1 })}
          <span className="hud-hero-unit"> €/s</span>
          {multi > 1.01 && (
            <span
              className={`hud-hero-multi ${multi >= 2 ? 'is-hot' : ''}`}
              title="Multiplicateur global — somme de tous tes bonus actifs (achievements, recherche, prestige, arrosoir, abeille)."
            >
              ✨ ×{multi.toFixed(2).replace('.', ',')}
            </span>
          )}
        </div>
        <div className="hud-hero-sub">
          <span className="hud-hero-stat">
            <span aria-hidden="true">💶</span> {formatEuros(euros)}
          </span>
          <span className="hud-hero-stat">
            <span aria-hidden="true">🌱</span> {formatNumber(rareSeeds)}
          </span>
        </div>
      </div>

      {/* Pile droite : météo + slots + settings */}
      <div className="hud-side hud-side-right">
        <WeatherWidget />
        <div className="hud-pill" title="Slots remplis">
          📦 {usedSlots}/{greenhouse.slots}
        </div>
        <a
          href="#sandbox"
          className="hud-pill hud-pill-action"
          title="Page expérimentale — prototype tapis roulant"
          aria-label="Ouvrir la sandbox du tapis roulant"
        >
          🧪 <span className="hud-pill-text">Sandbox</span>
        </a>
        <DebugMenu />
      </div>
    </header>
  );
}

function DebugMenu() {
  const open = useGameStore((s) => s.setActivePanel);
  return (
    <button
      className="hud-debug"
      onClick={() => open('settings')}
      title="Réglages"
      aria-label="Ouvrir les réglages"
    >
      ⚙️
    </button>
  );
}
