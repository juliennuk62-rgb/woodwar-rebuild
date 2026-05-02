import { useGameStore } from '../store/gameStore.js';
import { GARDENERS_BY_GREENHOUSE } from '../config/gardeners.js';
import { UPGRADE_LIST } from '../config/upgrades.js';

// Dock du bas : 3 boutons qui ouvrent Shop / Jardiniers / Upgrades.
// Sur mobile, le dock prend toute la largeur. Sur desktop, il flotte au centre.
//
// Affiche un petit indicateur "achetable" sur chaque bouton si au moins
// un item dans le panneau est dans le budget actuel.
export default function PanelLauncher() {
  const active = useGameStore((s) => s.activePanel);
  const toggle = useGameStore((s) => s.togglePanel);
  const euros = useGameStore((s) => s.currency.euros);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const lifetimeEuros = useGameStore((s) => s.currency.lifetimeEuros);

  const buttons = [
    {
      id: 'shop',
      label: 'Boutique',
      icon: '🌱',
      hint: shopAffordable(euros, lifetimeEuros, ghId),
    },
    {
      id: 'market',
      label: 'Marché',
      icon: '📈',
      hint: false,
    },
    {
      id: 'gardeners',
      label: 'Jardiniers',
      icon: '👩‍🌾',
      hint: gardenersAffordable(euros, greenhouse, ghId),
    },
    {
      id: 'upgrades',
      label: 'Améliorations',
      icon: '🛠️',
      hint: upgradesAffordable(euros, greenhouse),
    },
  ];

  return (
    <nav className="panel-launcher" aria-label="Panneaux du jeu">
      {buttons.map((b) => (
        <button
          key={b.id}
          className={`launcher-btn ${active === b.id ? 'active' : ''} ${b.hint ? 'available' : ''}`}
          onClick={() => toggle(b.id)}
          aria-label={`Ouvrir ${b.label}${b.hint ? ' — items achetables disponibles' : ''}`}
          aria-pressed={active === b.id}
        >
          <span className="launcher-icon" aria-hidden="true">{b.icon}</span>
          <span className="launcher-label">{b.label}</span>
          {b.hint && <span className="launcher-dot" aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}

// ─── Helpers : "y a-t-il qqch d'achetable ?" ───────────────────────
function shopAffordable(euros, lifetime) {
  // Au moins une espèce du shop est plantable
  // (on regarde juste la marguerite à 1 € de base, c'est un bon proxy)
  return euros >= 1;
}

function gardenersAffordable(euros, gh, ghId) {
  const list = GARDENERS_BY_GREENHOUSE[ghId] ?? [];
  return list.some((g) => !gh.gardeners.includes(g.id) && euros >= g.cost);
}

function upgradesAffordable(euros, gh) {
  return UPGRADE_LIST.some((u) => {
    const lvl = gh.upgrades[u.id] ?? 0;
    if (lvl >= u.maxLevel) return false;
    const cost = Math.round(u.baseCost * Math.pow(u.costGrowth, lvl));
    return euros >= cost;
  });
}
