import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { UPGRADE_LIST, upgradeCost, bulkUpgradeCost } from '../config/upgrades.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros, formatDuration } from '../utils/numberFormat.js';

// F2 — TTNB ("Time To Next Buy") : combien de temps avant que le joueur
// ait assez d'euros pour s'offrir cet achat, à revenu passif constant.
function formatTtnb(cost, euros, incomePerSecond) {
  if (euros >= cost) return '✓ disponible';
  if (!incomePerSecond || incomePerSecond <= 0) return '—';
  const seconds = (cost - euros) / incomePerSecond;
  if (!isFinite(seconds) || seconds <= 0) return '✓ disponible';
  return `≈ ${formatDuration(seconds)}`;
}

export default function UpgradesPanel() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const euros = useGameStore((s) => s.currency.euros);
  const buy = useGameStore((s) => s.buyUpgrade);
  const close = useGameStore((s) => s.setActivePanel);
  const flash = useGameStore((s) => s.upgradeFlash);
  const getIncomePerSecond = useGameStore((s) => s.getIncomePerSecond);
  const incomePerSecond = getIncomePerSecond();

  // Re-render chaque seconde pour rafraîchir l'estimation TTNB
  // même quand euros ne bouge pas d'assez pour déclencher un re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

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
              const remaining = max - level;
              const isMax = level >= max;

              // Coût du prochain niveau (bouton +1)
              const cost1 = upgradeCost(u.id, level);
              const canAfford1 = euros >= cost1 && !isMax;

              // Coût pour +5 (ou moins si on est près du max). On affiche
              // toujours le prix du paquet "voulu" (jusqu'à 5), même si on
              // n'a pas tout le budget — le bouton est juste désactivé.
              const want5 = Math.min(5, remaining);
              const bulk5 = bulkUpgradeCost(u.id, level, want5);
              const canAfford5 = !isMax && want5 > 0 && euros >= cost1; // au moins 1 niveau payable

              // Coût "Max" : tout ce qui reste, plafonné par le budget.
              const bulkMaxAll = bulkUpgradeCost(u.id, level, remaining);
              // Combien de niveaux on peut réellement s'offrir sur les
              // niveaux restants. Sert à afficher le coût exact sur le bouton.
              let maxAffordableLevels = 0;
              let maxAffordableCost = 0;
              for (let i = 0; i < remaining; i++) {
                const c = upgradeCost(u.id, level + i);
                if (maxAffordableCost + c > euros) break;
                maxAffordableCost += c;
                maxAffordableLevels++;
              }
              const maxLabelCost =
                maxAffordableLevels > 0 ? maxAffordableCost : bulkMaxAll.totalCost;
              const canAffordMax = !isMax && maxAffordableLevels > 0;

              const flashing = flash?.typeId === u.id;
              return (
                <div
                  key={u.id}
                  className={`upgrade-card ${!canAfford1 && !isMax ? 'poor' : ''} ${isMax ? 'maxed' : ''} ${flashing ? 'flashing' : ''}`}
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
                      {isMax && <span className="badge badge-max">MAX</span>}
                    </div>
                    <div className="upgrade-desc">{u.description}</div>
                    <LevelBar level={level} max={max} />
                    {!isMax && (
                      <div className="upgrade-actions">
                        <div className="upgrade-buy">
                          <button
                            className="btn-upgrade"
                            disabled={!canAfford1}
                            onClick={() => buy(u.id, 1)}
                            title={`Acheter 1 niveau · ${formatEuros(cost1)}`}
                          >
                            +1 · {formatEuros(cost1)}
                          </button>
                          <span className="upgrade-ttnb">
                            {formatTtnb(cost1, euros, incomePerSecond)}
                          </span>
                        </div>
                        <div className="upgrade-buy">
                          <button
                            className="btn-upgrade-mini"
                            disabled={!canAfford5}
                            onClick={() => buy(u.id, 5)}
                            title={`Acheter jusqu'à ${want5} niveaux · ${formatEuros(bulk5.totalCost)}`}
                          >
                            +{want5} · {formatEuros(bulk5.totalCost)}
                          </button>
                          <span className="upgrade-ttnb">
                            {formatTtnb(bulk5.totalCost, euros, incomePerSecond)}
                          </span>
                        </div>
                        <div className="upgrade-buy">
                          <button
                            className="btn-upgrade-mini"
                            disabled={!canAffordMax}
                            onClick={() => buy(u.id, 'max')}
                            title={
                              canAffordMax
                                ? `Acheter ${maxAffordableLevels} niveau(x) · ${formatEuros(maxAffordableCost)}`
                                : `Coût pour tout débloquer : ${formatEuros(bulkMaxAll.totalCost)}`
                            }
                          >
                            Max · {formatEuros(maxLabelCost)}
                          </button>
                          <span className="upgrade-ttnb">
                            {formatTtnb(bulkMaxAll.totalCost, euros, incomePerSecond)}
                          </span>
                        </div>
                      </div>
                    )}
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
