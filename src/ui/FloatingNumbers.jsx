import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { formatEuros } from '../utils/numberFormat.js';

// Affiche les "+X €" qui flottent au-dessus de la fenêtre.
// Pour Prompt 1 on les positionne en bas-droite — Prompt 2 les ancrera
// au-dessus du slot 3D via `useThree().camera.project()`.
export default function FloatingNumbers() {
  const numbers = useGameStore((s) => s.floatingNumbers);
  const remove = useGameStore((s) => s.removeFloatingNumber);

  useEffect(() => {
    if (!numbers.length) return;
    const timers = numbers.map((n) =>
      setTimeout(() => remove(n.id), GAME_CONFIG.floatingNumberLifetimeMs)
    );
    return () => timers.forEach(clearTimeout);
  }, [numbers, remove]);

  return (
    <div className="floating-stack">
      {numbers.map((n) => (
        <div
          key={n.id}
          className={`floating-number ${n.kind === 'manual' ? 'manual' : ''}`}
        >
          + {formatEuros(n.amount)}
          {n.kind === 'manual' && <span className="floating-bonus"> bonus</span>}
        </div>
      ))}
    </div>
  );
}
