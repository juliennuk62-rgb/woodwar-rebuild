import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { CONVEYOR, RARITY_META } from '../config/conveyor.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';

// Tapis roulant en bas d'écran (au-dessus du PanelLauncher).
// - Cartes spawn dans le store (cf. tick.js + gameStore.spawnConveyorCard)
// - Animation : chaque carte glisse de droite à gauche en faux-3D.
// - Click → tente d'acheter ; flash visuel selon réussite/échec.
// - Caché en vue Map et tant que le tapis n'est pas débloqué.
export default function ConveyorBelt() {
  const cards = useGameStore((s) => s.conveyor.cards);
  const unlocked = useGameStore((s) => s.conveyor.unlocked);
  const grab = useGameStore((s) => s.grabConveyorCard);
  const euros = useGameStore((s) => s.currency.euros);
  const viewMode = useGameStore((s) => s.viewMode);

  // Re-render 5×/s pour faire avancer les cartes selon leur âge
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  if (!unlocked || viewMode === 'map') return null;

  const now = Date.now();

  return (
    <div className="conveyor-wrap" aria-label="Tapis roulant — saisis les cartes avant qu'elles disparaissent">
      <div className="conveyor-belt">
        <div className="conveyor-rail" aria-hidden="true">
          <div className="conveyor-rail-stripes" />
        </div>
        {cards.map((c) => {
          // Progression 0→1 sur la durée de vie. 0 = vient de spawn (à droite),
          // 1 = expire (à gauche).
          const progress = Math.min(1, Math.max(0, (now - c.spawnedAt) / CONVEYOR.lifetimeMs));
          const canAfford = euros >= c.cost;
          return (
            <ConveyorCard
              key={c.id}
              card={c}
              progress={progress}
              canAfford={canAfford}
              onGrab={() => grab(c.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConveyorCard({ card, progress, canAfford, onGrab }) {
  const meta = RARITY_META[card.rarity] ?? RARITY_META.common;
  // Position : 100% (right edge) → -10% (off left). On reste un poil dans
  // l'écran à gauche pour le fade out.
  const x = 100 - progress * 110;
  // Léger zoom au passage central pour le côté "carte qui s'avance"
  const scale = 0.9 + Math.sin(progress * Math.PI) * 0.12;
  // Fade out sur les 15% finaux pour signaler "tu vas la perdre"
  const opacity = progress > 0.85 ? 1 - (progress - 0.85) / 0.15 : 1;

  const benefit = describeBenefit(card);
  const roi = describeRoi(card);

  return (
    <button
      type="button"
      className={`conveyor-card rarity-${card.rarity} ${canAfford ? '' : 'is-poor'} ${progress > 0.7 ? 'is-leaving' : ''}`}
      onClick={onGrab}
      disabled={!canAfford}
      style={{
        right: `${x}%`,
        transform: `translateX(50%) scale(${scale.toFixed(3)})`,
        opacity,
        '--rarity-color': meta.color,
        '--rarity-glow': meta.glow,
      }}
      title={canAfford ? `${benefit} — coût ${formatEuros(card.cost)}` : `Pas assez (${formatEuros(card.cost)} requis)`}
      aria-label={`${meta.label} — ${card.label} — ${benefit} — coût ${formatEuros(card.cost)}`}
    >
      <span className="conveyor-card-rarity">{meta.label}</span>
      <span className="conveyor-card-icon" aria-hidden="true">{card.icon}</span>
      <span className="conveyor-card-benefit">{benefit}</span>
      <span className="conveyor-card-cost">{formatEuros(card.cost)}</span>
      {roi && <span className="conveyor-card-roi">{roi}</span>}
    </button>
  );
}

function describeBenefit(card) {
  if (card.type === 'cash') return `+ ${formatEuros(card.gain)}`;
  if (card.type === 'boost') {
    const m = card.multiplier.toFixed(card.multiplier % 1 === 0 ? 0 : 1).replace('.', ',');
    return `×${m} · ${Math.round(card.durationMs / 1000)}s`;
  }
  if (card.type === 'seed') return `+ ${formatNumber(card.quantity)} 🌱`;
  return '';
}

// Petite étiquette ROI (pour les cartes cash uniquement) : ratio gain/coût
function describeRoi(card) {
  if (card.type !== 'cash') return null;
  const ratio = card.gain / Math.max(1, card.cost);
  return `×${ratio.toFixed(1).replace('.', ',')}`;
}
