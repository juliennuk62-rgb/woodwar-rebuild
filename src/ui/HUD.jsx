import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';
import WeatherWidget from './WeatherWidget.jsx';

export default function HUD() {
  const euros = useGameStore((s) => s.currency.euros);
  const rareSeeds = useGameStore((s) => s.currency.rareSeeds);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  // On lit la fonction directement depuis le store via getState() — sinon
  // le sélecteur retournerait potentiellement une nouvelle référence à
  // chaque tick, recréant l'interval et fuyant des timers.
  const getIncome = () => useGameStore.getState().getIncomePerSecond();

  // €/s mis à jour 2× par seconde — pas la peine de re-render React à chaque tick
  const [income, setIncome] = useState(0);
  useEffect(() => {
    setIncome(getIncome());
    const id = setInterval(() => setIncome(getIncome()), 500);
    return () => clearInterval(id);
  }, []);

  const usedSlots = greenhouse.plants.length;

  return (
    <header className="hud-top">
      <div className="hud-brand">
        <div className="hud-brand-title">Le Jardin d'Agnès</div>
        <div className="hud-brand-sub">{config.icon} {config.name}</div>
      </div>

      <div className="hud-stats">
        <Stat icon="💶" label="Euros" value={formatEuros(euros)} accent="green" />
        <Stat icon="📈" label="€ / s" value={formatNumber(income, { decimals: 1 })} accent="gold" subtle />
        <Stat icon="🌱" label="Graines rares" value={formatNumber(rareSeeds)} subtle />
      </div>

      <div className="hud-meta">
        <WeatherWidget />
        <div className="hud-pill">Slots {usedSlots}/{greenhouse.slots}</div>
        <DebugMenu />
      </div>
    </header>
  );
}

function Stat({ icon, label, value, accent, subtle }) {
  return (
    <div className={`hud-stat ${accent ? `hud-stat--${accent}` : ''} ${subtle ? 'hud-stat--subtle' : ''}`}>
      <span className="hud-stat-icon">{icon}</span>
      <div className="hud-stat-text">
        <div className="hud-stat-label">{label}</div>
        <div className="hud-stat-value">{value}</div>
      </div>
    </div>
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
