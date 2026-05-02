import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { EXPEDITION_LIST, EXPEDITIONS, MAX_CONCURRENT_EXPEDITIONS } from '../config/expeditions.js';
import { formatEuros, formatDuration } from '../utils/numberFormat.js';

// Panneau Expéditions — vue carte simplifiée + liste des destinations + actives.
// L'expédition se joue en arrière-plan : on la lance, on attend, on réclame.
export default function ExpeditionPanel() {
  const close = useGameStore((s) => s.setActivePanel);
  const expeditions = useGameStore((s) => s.expeditions);
  const lifetime = useGameStore((s) => s.currency.lifetimeEuros);
  const euros = useGameStore((s) => s.currency.euros);
  const startExpedition = useGameStore((s) => s.startExpedition);
  const claim = useGameStore((s) => s.claimExpedition);
  const canStartExp = useGameStore((s) => s.canStartExpedition);

  // Re-render léger toutes les secondes pour rafraîchir les compteurs
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const active = expeditions.active ?? [];
  const slotsLeft = MAX_CONCURRENT_EXPEDITIONS - active.length;

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Expéditions</div>
            <div className="side-panel-sub">{active.length}/{MAX_CONCURRENT_EXPEDITIONS} actives · {expeditions.completed ?? 0} terminées</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <div className="side-panel-body">
          <p className="panel-intro">
            Envoie une équipe explorer un biome lointain pour ramener des
            <strong> graines rares</strong> et, avec un peu de chance, une
            <strong> nouvelle espèce</strong> à cultiver.
          </p>

          <WorldMap destinations={EXPEDITION_LIST} active={active} lifetime={lifetime} />

          {/* ── Expéditions actives ──────────────────────── */}
          {active.length > 0 && (
            <div className="expedition-section">
              <div className="settings-section-title">En cours</div>
              <div className="cards">
                {active.map((exp) => (
                  <ActiveExpeditionRow key={exp.id} exp={exp} onClaim={() => claim(exp.id)} />
                ))}
              </div>
            </div>
          )}

          {/* ── Destinations disponibles ─────────────────── */}
          <div className="expedition-section">
            <div className="settings-section-title">Destinations</div>
            <div className="cards">
              {EXPEDITION_LIST.map((dest) => {
                const check = canStartExp(dest.id);
                return (
                  <DestinationCard
                    key={dest.id}
                    dest={dest}
                    check={check}
                    euros={euros}
                    lifetime={lifetime}
                    onStart={() => startExpedition(dest.id)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Carte du monde simplifiée (SVG flat) ───────────────────────
function WorldMap({ destinations, active, lifetime }) {
  return (
    <div className="worldmap">
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="worldmap-svg">
        {/* Continents stylisés (formes très simples) */}
        <path
          d="M 8,16 Q 22,8 38,12 Q 55,8 60,18 L 56,36 Q 50,42 42,38 L 28,42 Q 15,38 10,28 Z"
          fill="rgba(126,200,122,.10)"
          stroke="rgba(126,200,122,.25)"
          strokeWidth=".25"
        />
        <path
          d="M 62,32 Q 78,28 90,38 Q 95,52 80,55 Q 65,52 62,42 Z"
          fill="rgba(126,200,122,.10)"
          stroke="rgba(126,200,122,.25)"
          strokeWidth=".25"
        />
        <path
          d="M 38,46 Q 50,42 58,46 Q 60,55 50,58 Q 40,56 38,50 Z"
          fill="rgba(126,200,122,.10)"
          stroke="rgba(126,200,122,.25)"
          strokeWidth=".25"
        />

        {/* Pins */}
        {destinations.map((d) => {
          const isActive = active.some((e) => e.destinationId === d.id);
          const locked = lifetime < (d.unlockCost ?? 0);
          return (
            <g key={d.id} transform={`translate(${d.coords.x}, ${d.coords.y})`}>
              {isActive && (
                <circle r="3.2" fill={d.color} opacity=".25">
                  <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".25;0;.25" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r="1.8" fill={locked ? '#3a3a2a' : d.color} stroke="#0d110e" strokeWidth=".4" />
              <text
                y="-3"
                textAnchor="middle"
                fontSize="3"
                fill={locked ? '#6a7d66' : '#e8eee6'}
                fontFamily="DM Mono, monospace"
              >
                {d.icon} {d.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Carte d'une expédition active ──────────────────────────────
function ActiveExpeditionRow({ exp, onClaim }) {
  const dest = EXPEDITIONS[exp.destinationId];
  const now = Date.now();
  const total = exp.endsAt - exp.startedAt;
  const elapsed = now - exp.startedAt;
  const ratio = Math.min(1, elapsed / total);
  const remaining = Math.max(0, exp.endsAt - now);
  const done = ratio >= 1;

  return (
    <div className={`expedition-row ${done ? 'done' : ''}`}>
      <div className="expedition-row-icon">{dest.icon}</div>
      <div className="expedition-row-body">
        <div className="expedition-row-title">{dest.name}</div>
        <div className="expedition-row-meta">
          {done ? (
            <span className="good">Retour de mission ✓</span>
          ) : (
            <span>Retour dans {formatDuration(remaining / 1000)}</span>
          )}
        </div>
        <div className="expedition-bar">
          <div className="expedition-bar-fill" style={{ width: `${Math.round(ratio * 100)}%`, background: dest.color }} />
        </div>
      </div>
      {done && (
        <button className="btn-plant" onClick={onClaim} aria-label={`Réclamer le butin de l'expédition en ${dest.name}`}>
          Ouvrir 🎁
        </button>
      )}
    </div>
  );
}

// ─── Carte d'une destination disponible ─────────────────────────
function DestinationCard({ dest, check, euros, lifetime, onStart }) {
  const locked = check.reason === 'locked';
  const reasons = {
    broke:     `Manque ${formatEuros(dest.cost - euros)} pour partir`,
    busy:      `Limite de ${MAX_CONCURRENT_EXPEDITIONS} expéditions atteinte`,
    duplicate: 'Déjà en cours vers cette destination',
    locked:    `Débloque à ${formatEuros(dest.unlockCost)} de gains lifetime (${formatEuros(lifetime)} actuel)`,
  };
  return (
    <div className={`destination-card ${locked ? 'locked' : ''} ${!check.ok && !locked ? 'poor' : ''}`}>
      <div className="destination-icon" style={{ borderColor: dest.color }}>{dest.icon}</div>
      <div className="destination-body">
        <div className="destination-row">
          <div>
            <div className="destination-name">{dest.name}</div>
            <div className="destination-region">{dest.region}</div>
          </div>
          {check.ok ? (
            <button className="btn-hire" onClick={onStart} aria-label={`Lancer une expédition en ${dest.name} (${formatEuros(dest.cost)})`}>
              {formatEuros(dest.cost)}
            </button>
          ) : (
            <span className="badge badge-locked">⛔</span>
          )}
        </div>
        <div className="destination-desc">
          {locked ? <em>🔒 Débloque à {formatEuros(dest.unlockCost)} lifetime</em> : dest.description}
        </div>
        <div className="destination-stats">
          <span>⏱ {formatDuration(dest.durationMs / 1000)}</span>
          <span>🌱 {dest.rareSeedsRange[0]}–{dest.rareSeedsRange[1]} graines</span>
          {dest.discoveryChance > 0 && (
            <span className="good">+{Math.round(dest.discoveryChance * 100)}% découverte</span>
          )}
        </div>
        {!check.ok && !locked && (
          <div className="destination-warn">{reasons[check.reason]}</div>
        )}
      </div>
    </div>
  );
}
