import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { getPlantStage, getSpeciesData } from '../engine/economy.js';
import { formatDuration } from '../utils/numberFormat.js';

// Sidebar gauche (desktop) : liste les plantes en cours dans la serre active
// avec leur barre de progression. Re-rendu interne tous les 250 ms pour
// fluidité — sans surcharger React.
export default function PlantsList() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const [tick, setTick] = useState(0);

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
  // Tri : matures d'abord, puis par % de croissance descendant
  const enriched = greenhouse.plants
    .map((p) => {
      const stage = getPlantStage(p, undefined, greenhouse, state);
      return { plant: p, ...stage, species: getSpeciesData(p.speciesId, state) };
    })
    .filter((e) => e.species)
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <aside className="plants-list">
      <div className="plants-list-title">Plantes en culture · {greenhouse.plants.length}/{greenhouse.slots}</div>
      <div className="plants-list-rows">
        {enriched.map(({ plant, species, ratio, remaining, stage }) => (
          <div key={plant.slotId} className={`plants-row ${stage === 'mature' ? 'mature' : ''}`}>
            <div className="plants-row-icon">{species.icon}</div>
            <div className="plants-row-info">
              <div className="plants-row-name">
                <span>{species.name}</span>
                <span className="plants-row-time">
                  {stage === 'mature' ? '✓' : formatDuration(remaining)}
                </span>
              </div>
              <div className="plants-row-bar">
                <div
                  className="plants-row-bar-fill"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
