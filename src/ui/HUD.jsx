import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';

const SEASON_LABELS = {
  spring: '🌸 Printemps',
  summer: '☀️ Été',
  autumn: '🍂 Automne',
  winter: '❄️ Hiver',
};

export default function HUD() {
  const euros = useGameStore((s) => s.currency.euros);
  const rareSeeds = useGameStore((s) => s.currency.rareSeeds);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const season = useGameStore((s) => s.market.currentSeason);
  const lifetimeEarned = useGameStore((s) => s.currency.lifetimeEuros);
  const config = GREENHOUSES[ghId];

  const usedSlots = greenhouse.plants.length;

  return (
    <>
      <header className="hud-top">
        <div className="hud-brand">
          <div className="hud-brand-title">Le Jardin d'Agnès</div>
          <div className="hud-brand-sub">{config.icon} {config.name}</div>
        </div>

        <div className="hud-stats">
          <Stat icon="💶" label="Euros" value={formatEuros(euros)} accent="green" />
          <Stat icon="🌱" label="Graines rares" value={formatNumber(rareSeeds)} accent="gold" />
          <Stat icon="📊" label="Total gagné" value={formatEuros(lifetimeEarned)} />
        </div>

        <div className="hud-meta">
          <div className="hud-pill">{SEASON_LABELS[season] ?? '🌱 ...'}</div>
          <div className="hud-pill">Slots {usedSlots}/{greenhouse.slots}</div>
        </div>
      </header>

      <footer className="hud-bottom">
        <div className="hud-tip">
          Clique un pot vide pour planter · Clique une fleur mature pour récolter (+25 %)
        </div>
        <DebugMenu />
      </footer>
    </>
  );
}

function Stat({ icon, label, value, accent }) {
  return (
    <div className={`hud-stat ${accent ? `hud-stat--${accent}` : ''}`}>
      <span className="hud-stat-icon">{icon}</span>
      <div className="hud-stat-text">
        <div className="hud-stat-label">{label}</div>
        <div className="hud-stat-value">{value}</div>
      </div>
    </div>
  );
}

function DebugMenu() {
  const reset = useGameStore((s) => s.hardReset);
  const onReset = () => {
    if (confirm('Réinitialiser complètement la partie ? (action irréversible)')) {
      reset();
    }
  };
  return (
    <button className="hud-debug" onClick={onReset} title="Reset partie">
      ⟲ reset
    </button>
  );
}
