import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSE_LIST } from '../config/greenhouses.js';
import { formatEuros } from '../utils/numberFormat.js';

// Barre horizontale d'onglets pour basculer entre serres + déverrouiller
// la suivante quand on en a les moyens.
export default function GreenhouseSelector() {
  const active = useGameStore((s) => s.activeGreenhouse);
  const greenhouses = useGameStore((s) => s.greenhouses);
  const euros = useGameStore((s) => s.currency.euros);
  const switchGh = useGameStore((s) => s.switchGreenhouse);
  const unlock = useGameStore((s) => s.unlockGreenhouse);

  return (
    <nav className="greenhouse-selector" aria-label="Sélecteur de serre">
      {GREENHOUSE_LIST.map((cfg) => {
        const state = greenhouses[cfg.id];
        const unlocked = state?.unlocked;
        const canAfford = euros >= cfg.unlockCost;
        const isActive = active === cfg.id;
        const tokens = state?.prestige?.tokens ?? 0;

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
              <span className="gh-tab-label">{cfg.name}</span>
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
