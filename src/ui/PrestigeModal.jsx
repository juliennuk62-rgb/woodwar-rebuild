import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';

// Bouton + modale de prestige pour la serre active.
// Visible dans le HUD quand le joueur peut faire au moins un prestige
// (preview.canPrestige).
export default function PrestigeModal() {
  const [open, setOpen] = useState(false);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const preview = useGameStore((s) => s.getPrestigePreview);
  const apply = useGameStore((s) => s.applyPrestige);
  const config = GREENHOUSES[ghId];

  const p = preview(ghId);
  if (!p) return null;

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
