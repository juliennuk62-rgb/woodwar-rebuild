import { useGameStore } from '../store/gameStore.js';
import { GARDENERS_BY_GREENHOUSE } from '../config/gardeners.js';
import { PLANTS } from '../config/plants.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros } from '../utils/numberFormat.js';

const MAX_LEVEL = 5;

// Multiplicateur du bonus de spécialité en fonction du niveau du jardinier.
// Niveau 1 = 100% du bonus, Niveau 5 = 200%.
function levelMultiplier(level) {
  return 1 + 0.25 * Math.max(0, level - 1);
}

export default function GardenersPanel() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const euros = useGameStore((s) => s.currency.euros);
  const levelUp = useGameStore((s) => s.levelUpGardener);
  const getLevel = useGameStore((s) => s.getGardenerLevel);
  const getCost = useGameStore((s) => s.getGardenerUpgradeCost);
  const close = useGameStore((s) => s.setActivePanel);

  const list = GARDENERS_BY_GREENHOUSE[ghId] ?? [];

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Jardiniers</div>
            <div className="side-panel-sub">{config.icon} {config.name}</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <div className="side-panel-body">
          <p className="panel-intro">
            Les jardiniers automatisent ta serre : sans eux, un slot vidé reste vide.
            Chaque jardinier peut être amélioré jusqu'au niveau 5 — son bonus de
            spécialité grimpe avec son niveau (×1 → ×2).
          </p>

          <div className="cards">
            {list.map((g) => {
              const level = getLevel(g.id);
              const isMax = level >= MAX_LEVEL;
              const cost = getCost(g.id);
              const canAfford = !isMax && euros >= cost;
              const mul = levelMultiplier(Math.max(1, level)); // pour affichage : niveau 0 montre quand même le bonus du niveau 1
              const hired = level > 0;

              return (
                <div
                  key={g.id}
                  className={`gardener-card ${hired ? 'hired' : ''} ${!canAfford && !hired && !isMax ? 'poor' : ''} ${isMax ? 'maxed' : ''}`}
                >
                  <div className="gardener-icon">{g.icon}</div>
                  <div>
                    <div className="gardener-row">
                      <div>
                        <div className="gardener-name">{g.name}</div>
                        <div className="gardener-spec">{g.specialty}</div>
                      </div>
                      {isMax ? (
                        <span className="badge badge-max">Niveau 5 max</span>
                      ) : (
                        <button
                          className="btn-hire"
                          disabled={!canAfford}
                          onClick={() => levelUp(g.id)}
                        >
                          {hired ? `Améliorer · ${formatEuros(cost)}` : `Embaucher · ${formatEuros(cost)}`}
                        </button>
                      )}
                    </div>

                    {/* Pips de niveau (★ remplis 1..5) */}
                    <div className="gardener-level" aria-label={`Niveau ${level} sur ${MAX_LEVEL}`}>
                      {Array.from({ length: MAX_LEVEL }).map((_, i) => (
                        <span key={i} className={`level-pip ${i < level ? 'on' : ''}`}>★</span>
                      ))}
                      <span className="gardener-level-label">
                        Niveau {level} / {MAX_LEVEL}
                      </span>
                    </div>

                    <div className="gardener-desc">{g.description}</div>
                    <div className="gardener-bonuses">
                      {Object.entries(g.speciesBonus).map(([speciesId, bonus]) => {
                        const sp = PLANTS[speciesId];
                        if (!sp) return null;
                        const effective = bonus * (hired ? levelMultiplier(level) : 1);
                        return (
                          <span key={speciesId} className="bonus-pill">
                            {sp.icon} {sp.name} <strong>+{Math.round(effective * 100)}%</strong>
                          </span>
                        );
                      })}
                    </div>
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
