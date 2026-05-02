import { useGameStore } from '../store/gameStore.js';
import { GARDENERS_BY_GREENHOUSE } from '../config/gardeners.js';
import { PLANTS } from '../config/plants.js';
import { GREENHOUSES } from '../config/greenhouses.js';
import { formatEuros } from '../utils/numberFormat.js';

export default function GardenersPanel() {
  const ghId = useGameStore((s) => s.activeGreenhouse);
  const greenhouse = useGameStore((s) => s.greenhouses[ghId]);
  const config = GREENHOUSES[ghId];
  const euros = useGameStore((s) => s.currency.euros);
  const hire = useGameStore((s) => s.hireGardener);
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
            Avec au moins un jardinier embauché, les plantes sont replantées
            automatiquement après chaque vente. Chacun apporte aussi un bonus de
            revenu sur ses spécialités.
          </p>

          <div className="cards">
            {list.map((g) => {
              const hired = greenhouse.gardeners.includes(g.id);
              const canAfford = euros >= g.cost;
              return (
                <div
                  key={g.id}
                  className={`gardener-card ${hired ? 'hired' : ''} ${!canAfford && !hired ? 'poor' : ''}`}
                >
                  <div className="gardener-icon">{g.icon}</div>
                  <div>
                    <div className="gardener-row">
                      <div>
                        <div className="gardener-name">{g.name}</div>
                        <div className="gardener-spec">{g.specialty}</div>
                      </div>
                      {hired ? (
                        <span className="badge badge-active">Actif</span>
                      ) : (
                        <button
                          className="btn-hire"
                          disabled={!canAfford}
                          onClick={() => hire(g.id)}
                        >
                          {formatEuros(g.cost)}
                        </button>
                      )}
                    </div>
                    <div className="gardener-desc">{g.description}</div>
                    <div className="gardener-bonuses">
                      {Object.entries(g.speciesBonus).map(([speciesId, bonus]) => {
                        const sp = PLANTS[speciesId];
                        if (!sp) return null;
                        return (
                          <span key={speciesId} className="bonus-pill">
                            {sp.icon} {sp.name} <strong>+{Math.round(bonus * 100)}%</strong>
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
