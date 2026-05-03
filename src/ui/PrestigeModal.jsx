import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';
import { getNextMilestone } from '../engine/prestige.js';

// Formatte un nombre de secondes en "8s", "2 min", "1 h 12 min" lisible.
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remMin = Math.round(minutes - hours * 60);
  return remMin > 0 ? `${hours} h ${remMin} min` : `${hours} h`;
}

// Bouton + modale de prestige pour la serre active.
// Visible dans le HUD quand le joueur peut faire au moins un prestige
// (preview.canPrestige).
export default function PrestigeModal() {
  const [open, setOpen] = useState(false);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const preview = useGameStore((s) => s.getPrestigePreview);
  const apply = useGameStore((s) => s.applyPrestige);
  const config = GREENHOUSES[ghId];

  // Force un re-render 1×/s pour rafraîchir le compteur "prestige dans ≈ Xs"
  // (l'incomePerSecond bouge au gré des récoltes, météo, etc.).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1000000), 1000);
    return () => clearInterval(id);
  }, []);

  const p = preview(ghId);
  if (!p) return null;

  // Prochain palier intéressant : si on ne peut pas prestige, on vise le
  // 1er token ; sinon, on vise un x1.5 du multiplicateur courant.
  const milestone = getNextMilestone(
    ghId,
    useGameStore.getState(),
    p.canPrestige ? 1.5 : null,
  );
  const showMilestone = milestone && milestone.tokensNeeded > 0;
  const milestoneLabel = p.canPrestige
    ? `Prestige ×1,5 dans ≈ ${formatDuration(milestone?.secondsNeeded)}`
    : `+1 token dans ≈ ${formatDuration(milestone?.secondsNeeded)}`;

  return (
    <>
      {p.canPrestige && (
        <button
          className="prestige-trigger"
          onClick={() => setOpen(true)}
          aria-label={`Prestige : gagner ${p.tokensGained} ${config.prestigeToken.name}`}
        >
          <span>{config.prestigeToken.icon}</span>
          <span>Prestige · +{p.tokensGained}</span>
        </button>
      )}

      {showMilestone && (
        <div
          className={`prestige-next ${p.canPrestige ? 'prestige-next--has-button' : ''}`}
          aria-live="polite"
        >
          <span aria-hidden="true">🌟</span>
          <span>{milestoneLabel}</span>
        </div>
      )}

      {open && (
        <div className="prestige-backdrop" onClick={() => setOpen(false)}>
          <div className="prestige-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="prestige-icon" style={{ color: config.accentColor }}>{config.prestigeToken.icon}</div>
            <div className="prestige-tag">Réinitialisation prestige</div>
            <h2>{config.icon} {config.name}</h2>

            <p className="prestige-desc">
              Tu vas réinitialiser cette serre pour gagner des tokens permanents
              qui boostent ses futurs revenus. Le multiplicateur s'applique à
              toutes les ventes de la serre.
            </p>

            <div className="prestige-math">
              <div className="prestige-math-row">
                <span>Lifetime de la serre</span>
                <strong>{formatEuros(p.lifetimeEarned)}</strong>
              </div>
              <div className="prestige-math-row big">
                <span>Tokens gagnés</span>
                <strong className="good">+{p.tokensGained} {config.prestigeToken.icon}</strong>
              </div>
              <div className="prestige-math-row">
                <span>Tokens actuels</span>
                <strong>{p.currentTokens}</strong>
              </div>
              <div className="prestige-math-row">
                <span>Multiplicateur</span>
                <strong>×{p.currentMultiplier.toFixed(2).replace('.', ',')} → ×{p.newMultiplier.toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>

            <div className="prestige-cols">
              <div className="prestige-col">
                <div className="prestige-col-title">🔥 Perdu</div>
                <ul>
                  <li>Toutes les plantes en cours</li>
                  <li>Tous les jardiniers de cette serre</li>
                  <li>Toutes les améliorations de cette serre</li>
                  <li>Le total lifetime de cette serre</li>
                </ul>
              </div>
              <div className="prestige-col">
                <div className="prestige-col-title">💎 Conservé</div>
                <ul>
                  <li>Tokens de prestige (cumulatifs)</li>
                  <li>Toutes tes espèces découvertes</li>
                  <li>Tous tes hybrides + recherche</li>
                  <li>Les autres serres et leurs progrès</li>
                  <li>Les graines rares + euros globaux</li>
                </ul>
              </div>
            </div>

            <div className="prestige-actions">
              <button className="btn-secondary" onClick={() => setOpen(false)} style={{ flex: 1 }}>
                Annuler
              </button>
              <button
                className="btn-plant"
                onClick={() => { apply(ghId); setOpen(false); }}
                style={{ flex: 1 }}
              >
                {config.prestigeToken.icon} Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
