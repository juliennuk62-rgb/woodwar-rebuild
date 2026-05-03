import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSE_LIST } from '../config/greenhouses.js';
import { formatEuros, formatNumber, formatDuration } from '../utils/numberFormat.js';
import { SEASON_INFO } from '../mechanics/weather.js';

// Vue d'ensemble façon Satisfactory : on quitte la scène 3D et on affiche
// une carte HTML pleine page avec les 5 serres côte à côte. Chaque serre
// affiche en live : icône, nom, état (verrouillée / active / passive), €/s,
// nombre de plantes, tokens prestige, bouton "activer" / "construire".
export default function WorldMap() {
  const viewMode = useGameStore((s) => s.viewMode);
  const setViewMode = useGameStore((s) => s.setViewMode);
  const switchGh = useGameStore((s) => s.switchGreenhouse);
  const unlock = useGameStore((s) => s.unlockGreenhouse);
  const greenhouses = useGameStore((s) => s.greenhouses);
  const activeGhId = useGameStore((s) => s.activeGreenhouse);
  const euros = useGameStore((s) => s.currency.euros);
  const lifetimeEuros = useGameStore((s) => s.currency.lifetimeEuros);
  const rareSeeds = useGameStore((s) => s.currency.rareSeeds);
  const season = useGameStore((s) => s.market.currentSeason);

  // Income per greenhouse, rafraîchi 1×/s
  const [incomes, setIncomes] = useState({});
  const [, setTick] = useState(0);
  useEffect(() => {
    if (viewMode !== 'map') return;
    const compute = () => {
      const s = useGameStore.getState();
      const next = {};
      for (const cfg of GREENHOUSE_LIST) {
        next[cfg.id] = s.getIncomePerSecondForGreenhouse(cfg.id);
      }
      setIncomes(next);
      setTick((t) => t + 1);
    };
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [viewMode]);

  if (viewMode !== 'map') return null;

  const totalIncome = Object.values(incomes).reduce((a, b) => a + b, 0);
  const totalPlants = Object.values(greenhouses).reduce(
    (sum, gh) => sum + (gh.plants?.length ?? 0),
    0
  );
  const totalTokens = Object.values(greenhouses).reduce(
    (sum, gh) => sum + (gh.prestige?.tokens ?? 0),
    0
  );
  const seasonInfo = SEASON_INFO[season];

  const handleEnter = (ghId, unlocked) => {
    if (unlocked) {
      switchGh(ghId);
    } else {
      const ok = unlock(ghId);
      if (!ok) return;
    }
    setViewMode('greenhouse');
  };

  return (
    <div className="worldmap-overlay">
      <header className="worldmap-header">
        <button
          className="worldmap-back"
          onClick={() => setViewMode('greenhouse')}
          aria-label="Retour à la serre"
        >
          ← Retour
        </button>
        <div className="worldmap-title">
          <span className="worldmap-title-eyebrow">Vue d'ensemble</span>
          <h1>Empire d'Agnès</h1>
        </div>
        <div className="worldmap-season" title={seasonInfo?.description}>
          <span className="worldmap-season-icon">{seasonInfo?.icon}</span>
          <span className="worldmap-season-label">{seasonInfo?.name}</span>
        </div>
      </header>

      <div className="worldmap-summary">
        <SummaryStat label="Production totale" value={`+ ${formatNumber(totalIncome, { decimals: 1 })} €/s`} accent="green" big />
        <SummaryStat label="Plantes en culture" value={formatNumber(totalPlants)} />
        <SummaryStat label="Tokens prestige" value={formatNumber(totalTokens)} accent="gold" />
        <SummaryStat label="Graines rares" value={formatNumber(rareSeeds)} accent="seed" />
      </div>

      <div className="worldmap-grid">
        {GREENHOUSE_LIST.map((cfg) => {
          const state = greenhouses[cfg.id];
          const unlocked = state?.unlocked;
          const canAfford = euros >= cfg.unlockCost;
          const lifetimeEnough = lifetimeEuros >= cfg.unlockCost;
          const isActive = activeGhId === cfg.id;
          const income = incomes[cfg.id] ?? 0;
          const plants = state?.plants?.length ?? 0;
          const tokens = state?.prestige?.tokens ?? 0;
          const slots = state?.slots ?? cfg.initialSlots;

          return (
            <article
              key={cfg.id}
              className={`worldmap-card ${unlocked ? 'is-unlocked' : 'is-locked'} ${isActive ? 'is-active' : ''}`}
              style={{ '--accent': cfg.accentColor }}
            >
              <div className="worldmap-card-banner" style={{ background: `linear-gradient(135deg, ${cfg.accentColor}33, ${cfg.accentColor}08)` }}>
                <div className="worldmap-card-icon">{cfg.icon}</div>
                {isActive && <span className="worldmap-card-badge">EN COURS</span>}
                {unlocked && !isActive && tokens > 0 && (
                  <span className="worldmap-card-tokens">
                    {cfg.prestigeToken.icon} {tokens}
                  </span>
                )}
              </div>

              <div className="worldmap-card-body">
                <h2 className="worldmap-card-title">{cfg.name}</h2>
                <div className="worldmap-card-biome">{cfg.biome}</div>

                {unlocked ? (
                  <>
                    <div className="worldmap-card-stats">
                      <div className="worldmap-card-stat">
                        <span className="worldmap-card-stat-label">Production</span>
                        <span className="worldmap-card-stat-value good">
                          + {formatNumber(income, { decimals: 1 })} €/s
                        </span>
                      </div>
                      <div className="worldmap-card-stat">
                        <span className="worldmap-card-stat-label">Plantes</span>
                        <span className="worldmap-card-stat-value">{plants} / {slots}</span>
                      </div>
                    </div>
                    <button
                      className="worldmap-card-cta"
                      onClick={() => handleEnter(cfg.id, true)}
                    >
                      {isActive ? 'Continuer' : 'Entrer'} →
                    </button>
                  </>
                ) : (
                  <>
                    <div className="worldmap-card-stats">
                      <div className="worldmap-card-stat">
                        <span className="worldmap-card-stat-label">Coût</span>
                        <span className="worldmap-card-stat-value">
                          {formatEuros(cfg.unlockCost)}
                        </span>
                      </div>
                      <div className="worldmap-card-stat">
                        <span className="worldmap-card-stat-label">Slots de base</span>
                        <span className="worldmap-card-stat-value">{cfg.initialSlots}</span>
                      </div>
                    </div>
                    <button
                      className="worldmap-card-cta worldmap-card-cta--unlock"
                      onClick={() => handleEnter(cfg.id, false)}
                      disabled={!canAfford}
                    >
                      {canAfford
                        ? `🔓 Construire · ${formatEuros(cfg.unlockCost)}`
                        : `🔒 ${formatEuros(cfg.unlockCost - euros)} manquants`}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, accent, big }) {
  return (
    <div className={`worldmap-summary-stat ${accent ? `is-${accent}` : ''} ${big ? 'is-big' : ''}`}>
      <div className="worldmap-summary-label">{label}</div>
      <div className="worldmap-summary-value">{value}</div>
    </div>
  );
}
