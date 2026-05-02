import { useGameStore } from '../store/gameStore.js';
import { UPGRADE_LIST, upgradeCost } from '../config/upgrades.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros } from '../utils/numberFormat.js';

export default function UpgradesPanel() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const euros = useGameStore((s) => s.currency.euros);
  const buy = useGameStore((s) => s.buyUpgrade);
  const close = useGameStore((s) => s.setActivePanel);
  const flash = useGameStore((s) => s.upgradeFlash);

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Améliorations</div>
            <div className="side-panel-sub">{config.icon} {config.name}</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>
        <div className="side-panel-body">
          <p className="panel-intro">
            Investis dans la serre pour booster les revenus, accélérer la croissance et
            améliorer tes récoltes manuelles. Chaque amélioration a 5 niveaux.
          </p>

          <div className="cards">
            {UPGRADE_LIST.map((u) => {
              const level = greenhouse.upgrades[u.id] ?? 0;
              const max = u.maxLevel;
              const cost = upgradeCost(u.id, level);
              const canAfford = euros >= cost && level < max;
              const isMax = level >= max;

              const flashing = flash?.typeId === u.id;
              return (
                <div
                  key={u.id}
                  className={`upgrade-card ${!canAfford && !isMax ? 'poor' : ''} ${isMax ? 'maxed' : ''} ${flashing ? 'flashing' : ''}`}
                >
                  <div className="upgrade-icon">{u.icon}</div>
                  <div className="upgrade-body">
                    <div className="upgrade-row">
                      <div>
                        <div className="upgrade-name">{u.name}</div>
                        <div className="upgrade-effect">
                          {u.effectLabel} : <strong>{formatEffect(u, level)}</strong>
                          {!isMax && <span className="next-effect"> → {formatEffect(u, level + 1)}</span>}
                        </div>
                      </div>
                      {isMax ? (
                        <span className="badge badge-max">MAX</span>
                      ) : (
                        <button
                          className="btn-upgrade"
                          disabled={!canAfford}
                          onClick={() => buy(u.id)}
                        >
                          {formatEuros(cost)}
                        </button>
                      )}
                    </div>
                    <div className="upgrade-desc">{u.description}</div>
                    <LevelBar level={level} max={max} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

function LevelBar({ level, max }) {
  const cells = [];
  for (let i = 0; i < max; i++) {
    cells.push(<span key={i} className={`level-cell ${i < level ? 'on' : ''}`} />);
  }
  return (
    <div className="level-bar">
      {cells}
      <span className="level-text">Niv {level} / {max}</span>
    </div>
  );
}

function formatEffect(u, level) {
  const v = u.effectPerLevel * level;
  switch (u.effectKind) {
    case 'growTimeReduction':
      return `−${Math.round(v * 100)}%`;
    case 'manualBonus':
      return `+${Math.round((0.25 + v) * 100)}%`;
    case 'revenueMultiplier':
      return `+${Math.round(v * 100)}%`;
    default:
      return `${level}`;
  }
}
