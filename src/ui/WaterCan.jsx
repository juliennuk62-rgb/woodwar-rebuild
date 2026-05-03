import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { formatEuros } from '../utils/numberFormat.js';

// Bouton "Arroser" flottant style Cookie Clicker.
// - Click → +25% revenu pendant 5s, jusqu'à ×2 si on enchaîne.
// - Auto-arrosoir débloquable à 50 000 € (clique tout seul).
// - Affiche l'état de boost en temps réel (timer + multiplicateur).
export default function WaterCan() {
  const stacks = useGameStore((s) => s.waterBoostStacks);
  const endsAt = useGameStore((s) => s.waterBoostEndsAt);
  const click = useGameStore((s) => s.clickWater);
  const autoOwned = useGameStore((s) => s.autoWaterer);
  const autoCost = useGameStore((s) => s.autoWaterCost);
  const buyAuto = useGameStore((s) => s.buyAutoWaterer);
  const euros = useGameStore((s) => s.currency.euros);
  const lifetime = useGameStore((s) => s.currency.lifetimeEuros);
  const viewMode = useGameStore((s) => s.viewMode);

  // Timer pour rafraîchir l'affichage du compte à rebours
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  // Le bouton n'apparaît qu'après les premiers euros gagnés (sinon il
  // intercepte le tutoriel) — caché aussi en vue Map.
  if (lifetime < 5 || viewMode === 'map') return null;

  const now = Date.now();
  const active = now < endsAt;
  const remaining = active ? Math.max(0, endsAt - now) : 0;
  const multiplier = active ? 1 + stacks * 0.25 : 1;

  const showBuyAuto = !autoOwned && lifetime >= 1000;
  const canAffordAuto = euros >= autoCost;

  return (
    <div className="watercan-stack">
      {/* Bouton principal "Arroser" */}
      <button
        className={`watercan-btn ${active ? 'is-active' : ''} ${stacks >= 4 ? 'is-max' : ''}`}
        onClick={click}
        aria-label="Arroser — boost de revenu temporaire"
        title={
          active
            ? `Boost ×${multiplier.toFixed(2)} pendant ${(remaining / 1000).toFixed(1)} s`
            : 'Cliquer pour booster ×1.25 pendant 5 s (cumulable jusqu\'à ×2)'
        }
      >
        <span className="watercan-icon" aria-hidden="true">💧</span>
        {active && (
          <span className="watercan-badge">
            ×{multiplier.toFixed(2).replace('.', ',')}
          </span>
        )}
        {active && (
          <svg className="watercan-ring" viewBox="0 0 64 64" aria-hidden="true">
            <circle
              cx="32" cy="32" r="29"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(remaining / 5000) * 182} 182`}
              transform="rotate(-90 32 32)"
            />
          </svg>
        )}
      </button>

      {/* Bouton auto-arrosoir (si pas encore acheté) */}
      {showBuyAuto && (
        <button
          className={`watercan-auto-btn ${!canAffordAuto ? 'is-poor' : ''}`}
          onClick={buyAuto}
          disabled={!canAffordAuto}
          aria-label={`Acheter l'auto-arrosoir pour ${formatEuros(autoCost)}`}
          title="L'auto-arrosoir clique tout seul toutes les 5 s — boost permanent."
        >
          <span aria-hidden="true">🤖</span>
          <span className="watercan-auto-cost">{formatEuros(autoCost)}</span>
        </button>
      )}

      {/* Indicateur passif quand l'auto-arrosoir est actif */}
      {autoOwned && (
        <div className="watercan-auto-on" aria-label="Auto-arrosoir actif">
          🤖 AUTO
        </div>
      )}
    </div>
  );
}
