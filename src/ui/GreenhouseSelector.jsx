import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSE_LIST } from '../config/greenhouses.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';

// Barre horizontale d'onglets pour basculer entre serres + déverrouiller
// la suivante quand on en a les moyens.
export default function GreenhouseSelector() {
  const active = useGameStore((s) => s.activeGreenhouse);
  const greenhouses = useGameStore((s) => s.greenhouses);
  const euros = useGameStore((s) => s.currency.euros);
  const switchGh = useGameStore((s) => s.switchGreenhouse);
  const unlock = useGameStore((s) => s.unlockGreenhouse);
  const getIncomeFor = useGameStore((s) => s.getIncomePerSecondForGreenhouse);

  // €/s par serre, rafraîchi 2× par seconde — même cadence que le HUD,
  // pas la peine de re-render à chaque tick du moteur.
  const [incomes, setIncomes] = useState({});
  useEffect(() => {
    const compute = () => {
      const next = {};
      for (const cfg of GREENHOUSE_LIST) {
        next[cfg.id] = getIncomeFor(cfg.id);
      }
      setIncomes(next);
    };
    compute();
    const id = setInterval(compute, 500);
    return () => clearInterval(id);
  }, [getIncomeFor]);

  return (
    <nav className="greenhouse-selector" aria-label="Sélecteur de serre">
      {GREENHOUSE_LIST.map((cfg) => {
        const state = greenhouses[cfg.id];
        const unlocked = state?.unlocked;
        const canAfford = euros >= cfg.unlockCost;
        const isActive = active === cfg.id;
        const tokens = state?.prestige?.tokens ?? 0;
        const income = incomes[cfg.id] ?? 0;

        if (unlocked) {
          return (
            <button
              key={cfg.id}
              className={`gh-tab ${isActive ? 'active' : ''}`}
              onClick={() => switchGh(cfg.id)}
              aria-pressed={isActive}
              aria-label={`Activer la ${cfg.name}`}
              style={isActive ? { borderColor: cfg.accentColor, color: cfg.accentColor } : undefined}
            >
              <span className="gh-tab-icon">{cfg.icon}</span>
              <span className="gh-tab-text">
                <span className="gh-tab-label">{cfg.name}</span>
                <span className={`gh-tab-income ${isActive ? 'active' : ''}`}>
                  + {formatNumber(income, { decimals: 1 })} €/s
                </span>
              </span>
              {tokens > 0 && (
                <span className="gh-tab-tokens" title={`${tokens} ${cfg.prestigeToken.name}`}>
                  {cfg.prestigeToken.icon} {tokens}
                </span>
              )}
            </button>
          );
        }

        return (
          <button
            key={cfg.id}
            className={`gh-tab gh-tab--locked ${canAfford ? 'available' : ''}`}
            onClick={() => canAfford && unlock(cfg.id)}
            disabled={!canAfford}
            aria-label={canAfford ? `Construire la ${cfg.name} pour ${formatEuros(cfg.unlockCost)}` : `${cfg.name} : il faut ${formatEuros(cfg.unlockCost)}`}
          >
            <span className="gh-tab-icon">🔒</span>
            <span className="gh-tab-label">{cfg.name}</span>
            <span className="gh-tab-cost">{formatEuros(cfg.unlockCost)}</span>
          </button>
        );
      })}
    </nav>
  );
}
