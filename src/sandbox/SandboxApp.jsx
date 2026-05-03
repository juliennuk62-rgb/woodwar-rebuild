import { useEffect, useState } from 'react';
import {
  useSandboxStore,
  startSandboxLoop, stopSandboxLoop,
  startSandboxAutosave, stopSandboxAutosave,
} from './sandboxStore.js';
import { CONVEYOR, RARITY_META } from '../config/conveyor.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';

// Page sandbox autonome — testbed pour le système de tapis roulant.
// Aucun lien avec le jeu principal : son propre state, sa propre boucle,
// son propre localStorage ('jardin-agnes:sandbox').
//
// L'idée : valider si la mécanique du conveyor seule fait un loop fun.
// Si oui, on construira un vrai jeu autour. Si non, on revient au tycoon.
export default function SandboxApp() {
  const ready = useSandboxStore((s) => s.ready);

  useEffect(() => {
    startSandboxLoop();
    startSandboxAutosave();
    return () => {
      stopSandboxLoop();
      stopSandboxAutosave();
    };
  }, []);

  if (!ready) {
    return (
      <div className="sandbox-loader">
        <div className="sandbox-loader-title">Sandbox — Tapis roulant</div>
      </div>
    );
  }

  return (
    <div className="sandbox-root">
      <SandboxHud />
      <SandboxBelt />
      <SandboxControls />
    </div>
  );
}

function SandboxHud() {
  const cash = useSandboxStore((s) => s.cash);
  const lifetimeEarned = useSandboxStore((s) => s.lifetimeEarned);
  const factoryLevel = useSandboxStore((s) => s.factoryLevel);
  const grabbed = useSandboxStore((s) => s.grabbed);
  const ignored = useSandboxStore((s) => s.ignored);
  const ips = useSandboxStore.getState().getIncomePerSecond();
  const totalSeen = grabbed + ignored;
  const grabRate = totalSeen > 0 ? Math.round((grabbed / totalSeen) * 100) : 0;

  return (
    <header className="sandbox-hud">
      <a href="#" className="sandbox-back" title="Revenir au jeu principal">← Jeu</a>
      <div className="sandbox-hud-main">
        <div className="sandbox-hud-cash">{formatEuros(cash)}</div>
        <div className="sandbox-hud-sub">
          <span>+ {formatNumber(ips, { decimals: 1 })} €/s</span>
          <span>•</span>
          <span>Usine niv. {factoryLevel}</span>
          <span>•</span>
          <span>{grabbed} / {totalSeen} cartes ({grabRate}%)</span>
          <span>•</span>
          <span>Total gagné : {formatEuros(lifetimeEarned)}</span>
        </div>
      </div>
    </header>
  );
}

function SandboxBelt() {
  const cards = useSandboxStore((s) => s.cards);
  const grab = useSandboxStore((s) => s.grabCard);
  const cash = useSandboxStore((s) => s.cash);

  // Re-render 5×/s pour faire avancer les cartes
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  return (
    <div className="sandbox-belt-area">
      <div className="sandbox-belt">
        <div className="sandbox-rail" aria-hidden="true">
          <div className="sandbox-rail-stripes" />
        </div>
        {cards.map((c) => {
          const progress = Math.min(1, Math.max(0, (now - c.spawnedAt) / CONVEYOR.lifetimeMs));
          const canAfford = cash >= c.cost;
          return (
            <SandboxCard
              key={c.id}
              card={c}
              progress={progress}
              canAfford={canAfford}
              onGrab={() => grab(c.id)}
            />
          );
        })}
      </div>
      <div className="sandbox-belt-hint">
        Saisis les cartes avant qu'elles sortent à gauche. Plus une carte est rare, plus elle rapporte.
      </div>
    </div>
  );
}

function SandboxCard({ card, progress, canAfford, onGrab }) {
  const meta = RARITY_META[card.rarity] ?? RARITY_META.common;
  const x = 100 - progress * 110;
  const scale = 0.85 + Math.sin(progress * Math.PI) * 0.18;
  const opacity = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;

  const benefit = describeBenefit(card);
  const roi = describeRoi(card);

  return (
    <button
      type="button"
      className={`sandbox-card rarity-${card.rarity} ${canAfford ? '' : 'is-poor'} ${progress > 0.7 ? 'is-leaving' : ''}`}
      onClick={onGrab}
      disabled={!canAfford}
      style={{
        right: `${x}%`,
        transform: `translateX(50%) scale(${scale.toFixed(3)})`,
        opacity,
        '--rarity-color': meta.color,
        '--rarity-glow': meta.glow,
      }}
      aria-label={`${meta.label} — ${benefit} — coût ${formatEuros(card.cost)}`}
    >
      <span className="sandbox-card-rarity">{meta.label}</span>
      <span className="sandbox-card-icon" aria-hidden="true">{card.icon}</span>
      <span className="sandbox-card-benefit">{benefit}</span>
      <span className="sandbox-card-cost">{formatEuros(card.cost)}</span>
      {roi && <span className="sandbox-card-roi">{roi}</span>}
    </button>
  );
}

function SandboxControls() {
  const cash = useSandboxStore((s) => s.cash);
  const factoryLevel = useSandboxStore((s) => s.factoryLevel);
  const upgradeCost = useSandboxStore.getState().getFactoryUpgradeCost();
  const upgrade = useSandboxStore((s) => s.buyFactoryUpgrade);
  const reset = useSandboxStore((s) => s.reset);
  const canAfford = cash >= upgradeCost;

  return (
    <div className="sandbox-controls">
      <button
        className={`sandbox-upgrade-btn ${canAfford ? '' : 'is-poor'}`}
        onClick={upgrade}
        disabled={!canAfford}
        title={`Augmente le revenu passif de +2 €/s. Niveau actuel : ${factoryLevel}`}
      >
        <span className="sandbox-upgrade-icon" aria-hidden="true">🏭</span>
        <span className="sandbox-upgrade-label">Améliorer l'usine</span>
        <span className="sandbox-upgrade-cost">{formatEuros(upgradeCost)}</span>
      </button>
      <button
        className="sandbox-reset-btn"
        onClick={() => {
          if (confirm('Réinitialiser la sandbox ? Tu perdras toute progression.')) reset();
        }}
        title="Reset complet du sandbox"
      >
        ↺ Reset
      </button>
    </div>
  );
}

function describeBenefit(card) {
  if (card.type === 'cash') return `+ ${formatEuros(card.gain)}`;
  if (card.type === 'boost') {
    const m = card.multiplier.toFixed(card.multiplier % 1 === 0 ? 0 : 1).replace('.', ',');
    return `${m}× boost`;
  }
  if (card.type === 'seed') return `+ ${formatNumber(card.quantity)} 🌱`;
  return '';
}

function describeRoi(card) {
  if (card.type !== 'cash') return null;
  const ratio = card.gain / Math.max(1, card.cost);
  return `×${ratio.toFixed(1).replace('.', ',')}`;
}
