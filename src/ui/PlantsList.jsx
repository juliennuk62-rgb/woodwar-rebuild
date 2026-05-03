import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import {
  getPlantStage,
  getSpeciesData,
  computePlantRevenue,
  getGrowTime,
} from '../engine/economy.js';
import { formatDuration, formatNumber } from '../utils/numberFormat.js';

// Sidebar gauche (desktop) — V2 « néon-glassmorphism ».
// Chaque plante est une mini-card data-viz : grand emoji avec halo radial de
// la couleur de l'espèce, donut SVG pour la croissance, et 3 mini-stats
// (revenu/sec, multi marché, temps restant). Les plantes matures pulsent en
// doré. `settings.reducedMotion` est respecté via la classe globale
// `.reduced-motion` (déjà gérée dans globals.css ligne 64).
//
// Re-rendu interne tous les 250 ms pour garder l'UI fluide sans surcharger
// React (les ratios changent en continu).
export default function PlantsList() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  if (!greenhouse.plants.length) {
    return (
      <aside className="plants-list plants-list--empty">
        <div className="plants-list-title">Plantes en culture</div>
        <div className="plants-list-empty-text">
          Aucune plante. Tape un pot vide pour planter ta première graine.
        </div>
      </aside>
    );
  }

  const state = useGameStore.getState();
  const market = state.market;

  // Tri : matures d'abord, puis par % de croissance descendant.
  const enriched = greenhouse.plants
    .map((p) => {
      const species = getSpeciesData(p.speciesId, state);
      if (!species) return null;
      const stage = getPlantStage(p, undefined, greenhouse, state);
      const grow = getGrowTime(p.speciesId, greenhouse, state);
      const revenue = computePlantRevenue(p, greenhouse, market, {}, state);
      const perSec = grow > 0 ? revenue / grow : 0;
      const marketMul = market?.prices?.[p.speciesId] ?? 1;
      return { plant: p, species, ...stage, perSec, marketMul };
    })
    .filter(Boolean)
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <aside className="plants-list">
      <div className="plants-list-title">
        Plantes en culture · {greenhouse.plants.length}/{greenhouse.slots}
      </div>
      <div className="plants-list-rows">
        {enriched.map((row) => (
          <PlantCard key={row.plant.slotId} row={row} />
        ))}
      </div>
    </aside>
  );
}

// ─── Carte plante (V2) ────────────────────────────────────────
function PlantCard({ row }) {
  const { plant, species, ratio, remaining, stage, perSec, marketMul } = row;
  const accent = species.petalColor || species.color || '#7ec87a';
  const isMature = stage === 'mature';
  const pct = Math.round(ratio * 100);

  // Donut SVG : circonférence = 2πr (r=18 → ~113.1).
  const R = 18;
  const C = 2 * Math.PI * R;
  const dash = C * Math.min(1, Math.max(0, ratio));

  // Multi marché : >1 = vert, <1 = rouge ; visuel "🔥".
  const hot = marketMul >= 1.15;
  const cold = marketMul <= 0.85;

  return (
    <div
      className={`plants-row-v2 ${isMature ? 'plants-row-v2--mature' : ''}`}
      style={{
        // Couleur d'accent injectée → utilisée par les box-shadow / gradients.
        '--accent': accent,
      }}
    >
      {/* Halo radial autour de l'emoji */}
      <div className="plants-row-v2-icon-wrap">
        <div className="plants-row-v2-halo" />
        <svg
          className="plants-row-v2-donut"
          viewBox="0 0 44 44"
          aria-hidden="true"
        >
          <circle
            className="plants-row-v2-donut-track"
            cx="22"
            cy="22"
            r={R}
          />
          <circle
            className="plants-row-v2-donut-fill"
            cx="22"
            cy="22"
            r={R}
            strokeDasharray={`${dash} ${C}`}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <div className="plants-row-v2-icon">{species.icon}</div>
        {isMature && <div className="plants-row-v2-check">✓</div>}
      </div>

      <div className="plants-row-v2-body">
        <div className="plants-row-v2-name-row">
          <div className="plants-row-v2-name">{species.name}</div>
          <div className={`plants-row-v2-pct ${isMature ? 'is-mature' : ''}`}>
            {isMature ? 'PRÊT' : `${pct}%`}
          </div>
        </div>
        {species.scientificName && (
          <div className="plants-row-v2-sci">{species.scientificName}</div>
        )}

        <div className="plants-row-v2-stats">
          <div className="plants-row-v2-stat" title="Revenu prévisionnel par seconde">
            <span className="plants-row-v2-stat-icon">＋</span>
            <span className="plants-row-v2-stat-val">
              {formatNumber(perSec, { decimals: perSec >= 10 ? 1 : 2 })}
            </span>
            <span className="plants-row-v2-stat-unit">€/s</span>
          </div>
          <div
            className={`plants-row-v2-stat ${hot ? 'is-hot' : ''} ${cold ? 'is-cold' : ''}`}
            title="Multiplicateur marché actuel"
          >
            <span className="plants-row-v2-stat-icon">{hot ? '🔥' : cold ? '❄' : '◆'}</span>
            <span className="plants-row-v2-stat-val">
              ×{marketMul.toFixed(2)}
            </span>
          </div>
          <div className="plants-row-v2-stat" title="Temps restant">
            <span className="plants-row-v2-stat-icon">⏱</span>
            <span className="plants-row-v2-stat-val">
              {isMature ? '—' : formatDuration(remaining)}
            </span>
          </div>
        </div>

        <div className="plants-row-v2-bar">
          <div
            className="plants-row-v2-bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
