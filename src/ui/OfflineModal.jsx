import { useGameStore } from '../store/gameStore.js';
import { formatEuros, formatDuration } from '../utils/numberFormat.js';

export default function OfflineModal() {
  const gains = useGameStore((s) => s.offlineGains);
  const dismiss = useGameStore((s) => s.dismissOfflineGains);
  if (!gains) return null;
  if (gains.euros <= 0 && gains.plants <= 0) return null;

  return (
    <div className="offline-backdrop" onClick={dismiss}>
      <div className="offline-modal" onClick={(e) => e.stopPropagation()}>
        <div className="offline-icon">🌿</div>
        <h2>Bon retour, Agnès</h2>
        <p className="offline-sub">
          Pendant ton absence ({formatDuration(gains.duration / 1000)}{gains.capped ? ', capé à 12 h' : ''}),
          la serre a continué de tourner.
        </p>

        <div className="offline-rows">
          <div className="offline-row">
            <div className="offline-row-label">Plantes récoltées</div>
            <div className="offline-row-value">{gains.plants}</div>
          </div>
          <div className="offline-row">
            <div className="offline-row-label">Gains accumulés</div>
            <div className="offline-row-value good">+ {formatEuros(gains.euros)}</div>
          </div>
        </div>

        <button className="offline-btn" onClick={dismiss}>
          Reprendre le jardin
        </button>
      </div>
    </div>
  );
}
