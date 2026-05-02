import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { PLANTS } from '../config/plants.js';
import { formatEuros, formatDuration } from '../utils/numberFormat.js';

// Panneau qui s'ouvre quand on clique un pot vide.
// Liste les espèces disponibles dans la serre active, débloquées ou non.
export default function ShopPanel() {
  const [slotId, setSlotId] = useState(null);
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const euros = useGameStore((s) => s.currency.euros);
  const lifetimeEuros = useGameStore((s) => s.currency.lifetimeEuros);
  const market = useGameStore((s) => s.market.prices);
  const plant = useGameStore((s) => s.plantSeed);
  const getCost = useGameStore((s) => s.getSeedCost);
  const isUnlocked = useGameStore((s) => s.isSpeciesUnlocked);

  useEffect(() => {
    const onOpen = (e) => setSlotId(e.detail.slotId);
    window.addEventListener('jardin:open-shop', onOpen);
    return () => window.removeEventListener('jardin:open-shop', onOpen);
  }, []);

  if (slotId === null) return null;

  const onPlant = (speciesId) => {
    const ok = plant(slotId, speciesId);
    if (ok) setSlotId(null);
  };

  return (
    <>
      <div className="shop-backdrop" onClick={() => setSlotId(null)} />
      <aside className="shop-panel">
        <div className="shop-header">
          <div>
            <div className="shop-title">Planter une graine</div>
            <div className="shop-sub">Slot #{slotId + 1} · {config.name}</div>
          </div>
          <button className="shop-close" onClick={() => setSlotId(null)} aria-label="Fermer">×</button>
        </div>

        <div className="shop-list">
          {config.species.map((id) => {
            const species = PLANTS[id];
            const cost = getCost(id);
            const unlocked = isUnlocked(id);
            const canAfford = euros >= cost;
            const marketMult = market[id] ?? 1.0;
            const sellPrice = Math.floor(species.baseRevenue * marketMult);

            return (
              <button
                key={id}
                className={`shop-card ${!unlocked ? 'shop-card--locked' : ''} ${!canAfford && unlocked ? 'shop-card--poor' : ''}`}
                onClick={() => unlocked && canAfford && onPlant(id)}
                disabled={!unlocked || !canAfford}
              >
                <div className="shop-card-icon">{unlocked ? species.icon : '🔒'}</div>
                <div className="shop-card-body">
                  <div className="shop-card-title">{species.name}</div>
                  <div className="shop-card-desc">
                    {unlocked
                      ? species.description
                      : `Débloquée à ${formatEuros(species.unlockCost)} gagnés (actuel : ${formatEuros(lifetimeEuros)})`}
                  </div>
                  {unlocked && (
                    <div className="shop-card-stats">
                      <span>⏱ {formatDuration(species.growTime)}</span>
                      <span>💰 {formatEuros(sellPrice)}</span>
                      <span className={marketMult >= 1 ? 'good' : 'bad'}>
                        Marché ×{marketMult.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  )}
                </div>
                {unlocked && (
                  <div className="shop-card-cost">
                    <span className={canAfford ? 'good' : 'bad'}>{formatEuros(cost)}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
