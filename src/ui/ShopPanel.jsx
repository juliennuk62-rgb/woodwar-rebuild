import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { PLANTS } from '../config/plants.js';
import { getSpeciesData, getEffectiveSlots } from '../engine/economy.js';
import { formatEuros, formatDuration } from '../utils/numberFormat.js';

// Panneau de plantation. S'ouvre via :
//   1. clic sur un pot vide       → mode "slot précis" (planter sur ce slot)
//   2. bouton du PanelLauncher    → mode "boutique" (acheter en masse)
export default function ShopPanel() {
  const [slotId, setSlotId] = useState(null);
  const activePanel = useGameStore((s) => s.activePanel);
  const setActivePanel = useGameStore((s) => s.setActivePanel);

  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const hybrids = useGameStore((s) => s.hybrids);
  const config = GREENHOUSES[ghId];
  const euros = useGameStore((s) => s.currency.euros);
  const lifetimeEuros = useGameStore((s) => s.currency.lifetimeEuros);
  const market = useGameStore((s) => s.market.prices);
  const plant = useGameStore((s) => s.plantSeed);
  const plantBulk = useGameStore((s) => s.plantSeedBulk);
  const getCost = useGameStore((s) => s.getSeedCost);
  const getMaxAffordable = useGameStore((s) => s.getMaxAffordable);
  const isUnlocked = useGameStore((s) => s.isSpeciesUnlocked);

  // On plante les hybrides du joueur en plus des espèces natives configurées
  // pour la serre. Règle simple : un hybride dont le biome correspond à la
  // serre y est plantable. Les hybrides "cross-biome" (biome === 'hybrid')
  // sont prioritairement plantables dans le Complexe Botanique s'il est
  // débloqué — sinon ils retombent dans la Tempérée.
  const complexUnlocked = useGameStore((s) => !!s.greenhouses.complex?.unlocked);
  const speciesIds = useMemo(() => {
    const native = config.species.slice();
    const hybridHome = complexUnlocked ? 'complex' : 'temperate';
    const hybridIds = Object.values(hybrids)
      .filter((h) => h.biome === ghId || (h.biome === 'hybrid' && ghId === hybridHome))
      .map((h) => h.id);
    return [...native, ...hybridIds];
  }, [config.species, hybrids, ghId, complexUnlocked]);

  useEffect(() => {
    const onOpen = (e) => setSlotId(e.detail.slotId);
    window.addEventListener('jardin:open-shop', onOpen);
    return () => window.removeEventListener('jardin:open-shop', onOpen);
  }, []);

  // Si l'utilisateur switche de serre alors qu'un slot précis était ouvert,
  // on referme le mode "slot" — sinon on planterait dans la mauvaise serre.
  useEffect(() => {
    if (slotId !== null) setSlotId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghId]);

  const open = slotId !== null || activePanel === 'shop';
  if (!open) return null;

  const slotMode = slotId !== null;

  const close = () => {
    setSlotId(null);
    if (activePanel === 'shop') setActivePanel(null);
  };

  const onPlantOne = (id) => {
    if (slotMode) {
      const ok = plant(slotId, id);
      if (ok) close();
    } else {
      // Trouve un slot libre
      const state = useGameStore.getState();
      const totalSlots = getEffectiveSlots(greenhouse, state);
      const used = new Set(greenhouse.plants.map((p) => p.slotId));
      let free = -1;
      for (let i = 0; i < totalSlots; i++) if (!used.has(i)) { free = i; break; }
      if (free !== -1) plant(free, id);
    }
  };

  const onPlantBulk = (id, qty) => {
    const state = useGameStore.getState();
    if (qty === 'max') qty = Math.min(getMaxAffordable(id), freeSlotsLeft(greenhouse, state));
    if (qty <= 0) return;
    plantBulk(id, qty);
  };

  return (
    <>
      <div className="panel-backdrop" onClick={close} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">{slotMode ? 'Planter une graine' : 'Boutique'}</div>
            <div className="side-panel-sub">
              {slotMode ? `Slot #${slotId + 1} · ${config.name}` : `${config.icon} ${config.name}`}
            </div>
          </div>
          <button className="side-panel-close" onClick={close} aria-label="Fermer">×</button>
        </header>

        <div className="side-panel-body">
          {!slotMode && (
            <p className="panel-intro">
              Achète et plante des graines en masse. Le coût grimpe à chaque graine
              du même type achetée. Vise les pics de marché pour vendre au meilleur prix.
            </p>
          )}

          <div className="cards">
            {speciesIds.map((id) => {
              const species = PLANTS[id] ?? hybrids[id];
              if (!species) return null;
              const cost = getCost(id);
              const unlocked = isUnlocked(id);
              const canAfford = euros >= cost;
              const marketMult = market[id] ?? 1.0;
              const sellPrice = Math.floor(species.baseRevenue * marketMult);
              const freeSlots = freeSlotsLeft(greenhouse, useGameStore.getState());

              return (
                <div
                  key={id}
                  className={`shop-card ${!unlocked ? 'locked' : ''} ${!canAfford && unlocked ? 'poor' : ''}`}
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
                          ×{marketMult.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    )}

                    {unlocked && (
                      <div className="shop-card-actions">
                        <button
                          className="btn-plant"
                          disabled={!canAfford || (!slotMode && freeSlots <= 0)}
                          onClick={() => onPlantOne(id)}
                        >
                          {slotMode ? `Planter · ${formatEuros(cost)}` : `×1 · ${formatEuros(cost)}`}
                        </button>
                        {!slotMode && (
                          <>
                            <button
                              className="btn-plant-mini"
                              disabled={freeSlots < 10 || getMaxAffordable(id) < 10}
                              onClick={() => onPlantBulk(id, 10)}
                              title="Planter 10 si possible"
                            >
                              ×10
                            </button>
                            <button
                              className="btn-plant-mini"
                              disabled={freeSlots <= 0 || getMaxAffordable(id) <= 0}
                              onClick={() => onPlantBulk(id, 'max')}
                              title="Planter le max possible"
                            >
                              Max
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}

// Slots libres = slots effectifs (incluant le bonus recherche slots_*)
// moins ceux déjà occupés. Ignorer le bonus serait un piège : le joueur ne
// peut pas planter en Max alors qu'il a payé pour des slots supplémentaires.
function freeSlotsLeft(greenhouse, state) {
  const total = getEffectiveSlots(greenhouse, state);
  return total - greenhouse.plants.length;
}
