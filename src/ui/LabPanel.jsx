import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { PLANTS } from '../config/plants.js';
import { TECHS, TECH_LIST, TECH_BRANCHES, isUnlockable } from '../mechanics/research.js';
import {
  TRAITS,
  hybridizationCost,
  hybridizationDurationMs,
} from '../mechanics/hybridation.js';
import { formatDuration } from '../utils/numberFormat.js';

const TABS = [
  { id: 'hybrid',   label: 'Hybridation' },
  { id: 'research', label: 'Recherche' },
  { id: 'gallery',  label: 'Galerie' },
];

export default function LabPanel() {
  const close = useGameStore((s) => s.setActivePanel);
  const [tab, setTab] = useState('hybrid');

  // Re-render léger pour les compteurs
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Laboratoire</div>
            <div className="side-panel-sub">Hybridation, recherche, collection</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <nav className="lab-tabs" aria-label="Onglets du labo">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`lab-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="side-panel-body">
          {tab === 'hybrid'   && <HybridTab />}
          {tab === 'research' && <ResearchTab />}
          {tab === 'gallery'  && <GalleryTab />}
        </div>
      </aside>
    </>
  );
}

// ─── Onglet Hybridation ────────────────────────────────────────
function HybridTab() {
  const species = useGameStore((s) => s.species);
  const rareSeeds = useGameStore((s) => s.currency.rareSeeds);
  const lab = useGameStore((s) => s.lab);
  const research = useGameStore((s) => s.research);
  const startHybridization = useGameStore((s) => s.startHybridization);
  const completeHybridization = useGameStore((s) => s.completeHybridization);
  const canHybridize = useGameStore((s) => s.canHybridize);

  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');

  const discovered = Object.keys(species)
    .filter((id) => species[id]?.discovered && PLANTS[id])
    .map((id) => PLANTS[id]);

  const cost = hybridizationCost(research.unlocked);
  const duration = (p1 && p2 && PLANTS[p1] && PLANTS[p2])
    ? hybridizationDurationMs(PLANTS[p1], PLANTS[p2], research.unlocked)
    : null;
  const check = canHybridize(p1, p2);

  return (
    <>
      <p className="panel-intro">
        Croise deux espèces que tu as découvertes pour créer un <strong>hybride unique</strong>.
        Si les biomes diffèrent, la rareté monte et un trait spécial peut apparaître
        (✨ bioluminescent, ⚡ pousse fulgurante, 🌸 parfumé, ♾️ éternel).
      </p>

      <div className="hybrid-form">
        <label>
          Parent 1
          <select value={p1} onChange={(e) => setP1(e.target.value)} className="settings-select">
            <option value="">— Choisir une espèce —</option>
            {discovered.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.icon} {sp.name}</option>
            ))}
          </select>
        </label>
        <label>
          Parent 2
          <select value={p2} onChange={(e) => setP2(e.target.value)} className="settings-select">
            <option value="">— Choisir une espèce —</option>
            {discovered.map((sp) => (
              <option key={sp.id} value={sp.id}>{sp.icon} {sp.name}</option>
            ))}
          </select>
        </label>

        {p1 && p2 && PLANTS[p1] && PLANTS[p2] && (
          <HybridPreview p1={PLANTS[p1]} p2={PLANTS[p2]} duration={duration} />
        )}

        <button
          className="btn-plant"
          onClick={() => { if (startHybridization(p1, p2)) { setP1(''); setP2(''); } }}
          disabled={!check.ok}
        >
          {check.ok
            ? `🧬 Lancer l'hybridation · ${cost} 🌱`
            : reasonText(check.reason)}
        </button>
      </div>

      {/* Hybridations en cours */}
      {lab.active.length > 0 && (
        <div className="lab-active">
          <div className="settings-section-title">Hybridations en cours</div>
          {lab.active.map((job) => (
            <ActiveLabJob key={job.id} job={job} onComplete={() => completeHybridization(job.id)} />
          ))}
        </div>
      )}
    </>
  );
}

function HybridPreview({ p1, p2, duration }) {
  const sameBiome = p1.biome === p2.biome;
  const avgGrow = (p1.growTime + p2.growTime) / 2;
  const avgRev = (p1.baseRevenue + p2.baseRevenue) / 2;
  const rarity = Math.max(p1.rarity, p2.rarity) + 1 + (sameBiome ? 0 : 2);
  return (
    <div className="hybrid-preview">
      <div className="hybrid-preview-row"><span>Croisement</span><strong>{sameBiome ? 'Intra-biome' : 'Cross-biome 🌍'}</strong></div>
      <div className="hybrid-preview-row"><span>Croissance estimée</span><strong>~{formatDuration(avgGrow * 0.7)} – {formatDuration(avgGrow * 1.3)}</strong></div>
      <div className="hybrid-preview-row"><span>Revenu estimé</span><strong>~{Math.round(avgRev * 0.8)} – {Math.round(avgRev * 2.0)} €</strong></div>
      <div className="hybrid-preview-row"><span>Rareté minimum</span><strong>{'⭐'.repeat(Math.min(7, rarity))}</strong></div>
      <div className="hybrid-preview-row"><span>Trait unique</span><strong>{sameBiome ? '5%' : '30%'} de chance</strong></div>
      {duration && (
        <div className="hybrid-preview-row"><span>Durée du lab</span><strong>{formatDuration(duration / 1000)}</strong></div>
      )}
    </div>
  );
}

function ActiveLabJob({ job, onComplete }) {
  const now = Date.now();
  const ratio = Math.min(1, (now - job.startedAt) / (job.endsAt - job.startedAt));
  const remaining = Math.max(0, job.endsAt - now);
  const done = ratio >= 1;
  const p1 = PLANTS[job.parent1Id];
  const p2 = PLANTS[job.parent2Id];

  return (
    <div className={`lab-job ${done ? 'done' : ''}`}>
      <div className="lab-job-icons">{p1?.icon} × {p2?.icon}</div>
      <div className="lab-job-info">
        <div className="lab-job-title">{p1?.name} × {p2?.name}</div>
        <div className="lab-job-meta">
          {done ? <span className="good">Synthèse terminée ✓</span> : `Reste ${formatDuration(remaining / 1000)}`}
        </div>
        <div className="expedition-bar">
          <div className="expedition-bar-fill" style={{ width: `${Math.round(ratio * 100)}%`, background: 'var(--lavender,#b4a8d4)' }} />
        </div>
      </div>
      {done && <button className="btn-plant" onClick={onComplete}>Voir 🧬</button>}
    </div>
  );
}

function reasonText(reason) {
  switch (reason) {
    case 'select': return 'Choisis 2 espèces différentes';
    case 'same': return 'Les parents doivent différer';
    case 'broke': return 'Pas assez de graines rares';
    case 'busy': return 'Lab occupé';
    case 'undiscovered1':
    case 'undiscovered2':
      return 'Parent non découvert';
    default: return 'Hybridation impossible';
  }
}

// ─── Onglet Recherche ─────────────────────────────────────────
function ResearchTab() {
  const research = useGameStore((s) => s.research);
  const rareSeeds = useGameStore((s) => s.currency.rareSeeds);
  const startResearch = useGameStore((s) => s.startResearch);
  const canStartResearch = useGameStore((s) => s.canStartResearch);

  const branches = Object.values(TECH_BRANCHES);
  const ip = research.inProgress;

  return (
    <>
      <p className="panel-intro">
        12 technologies en 4 branches. Chaque tech remplace la précédente
        dans sa branche. <strong>Une seule recherche active</strong> à la fois.
      </p>

      {ip && <ActiveResearch ip={ip} />}

      {branches.map((b) => (
        <div key={b.id} className="research-branch">
          <div className="research-branch-title" style={{ color: b.color }}>
            {b.icon} {b.name}
          </div>
          <div className="research-tree">
            {TECH_LIST.filter((t) => t.branch === b.id).map((tech) => {
              const unlocked = research.unlocked.includes(tech.id);
              const can = isUnlockable(tech.id, research.unlocked);
              const check = canStartResearch(tech.id);
              const inProgress = ip?.techId === tech.id;
              return (
                <div
                  key={tech.id}
                  className={`research-node ${unlocked ? 'unlocked' : ''} ${!can && !unlocked ? 'locked' : ''} ${inProgress ? 'progress' : ''}`}
                  style={{ borderColor: unlocked ? b.color : 'var(--border)' }}
                >
                  <div className="research-node-tier">Niv {tech.tier}</div>
                  <div className="research-node-name">{tech.name}</div>
                  <div className="research-node-desc">{tech.description}</div>
                  {unlocked ? (
                    <span className="badge badge-active">✓ Débloqué</span>
                  ) : inProgress ? (
                    <span className="badge badge-active">⏳ En cours</span>
                  ) : (
                    <button
                      className="btn-secondary"
                      disabled={!check.ok}
                      onClick={() => startResearch(tech.id)}
                      title={!check.ok ? `${check.reason}` : ''}
                    >
                      {tech.cost} 🌱 · {formatDuration(tech.durationMs / 1000)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function ActiveResearch({ ip }) {
  const tech = TECHS[ip.techId];
  const now = Date.now();
  const ratio = Math.min(1, (now - ip.startedAt) / (ip.endsAt - ip.startedAt));
  const remaining = Math.max(0, ip.endsAt - now);
  return (
    <div className="research-active">
      <div className="research-active-title">⏳ {tech.name}</div>
      <div className="research-active-meta">{formatDuration(remaining / 1000)}</div>
      <div className="expedition-bar">
        <div className="expedition-bar-fill" style={{ width: `${Math.round(ratio * 100)}%`, background: 'var(--green)' }} />
      </div>
    </div>
  );
}

// ─── Onglet Galerie ───────────────────────────────────────────
function GalleryTab() {
  const species = useGameStore((s) => s.species);
  const hybrids = useGameStore((s) => s.hybrids);

  const native = Object.values(PLANTS).filter((p) => species[p.id]?.discovered);
  const hybridList = Object.values(hybrids);

  return (
    <>
      <p className="panel-intro">
        Toutes les espèces que tu as découvertes — natives et hybrides confondus.
      </p>

      <div className="settings-section-title">Espèces natives ({native.length})</div>
      <div className="cards" style={{ marginBottom: 18 }}>
        {native.map((sp) => (
          <GalleryCard key={sp.id} sp={sp} owned={species[sp.id]?.totalGrown ?? 0} />
        ))}
      </div>

      <div className="settings-section-title">Hybrides ({hybridList.length})</div>
      {hybridList.length === 0 ? (
        <p className="panel-intro" style={{ marginTop: 8, fontStyle: 'italic' }}>
          Aucun hybride encore. Lance une hybridation dans l'onglet ci-dessus.
        </p>
      ) : (
        <div className="cards">
          {hybridList.map((h) => (
            <GalleryCard key={h.id} sp={h} owned={0} hybrid />
          ))}
        </div>
      )}
    </>
  );
}

function GalleryCard({ sp, owned, hybrid }) {
  return (
    <div className="gallery-card">
      <div className="gallery-icon" style={{ background: `radial-gradient(${sp.petalColor}33, transparent 70%)` }}>
        {sp.icon}
      </div>
      <div className="gallery-body">
        <div className="gallery-name">{sp.name}</div>
        {sp.scientificName && <div className="gallery-sci"><em>{sp.scientificName}</em></div>}
        <div className="gallery-stats">
          <span>⏱ {formatDuration(sp.growTime)}</span>
          <span>💰 {sp.baseRevenue} €</span>
          <span>{'⭐'.repeat(Math.min(7, sp.rarity))}</span>
        </div>
        {hybrid && sp.trait && (
          <div className="gallery-trait">
            {TRAITS[sp.trait]?.icon} {TRAITS[sp.trait]?.name}
          </div>
        )}
        {hybrid && (
          <div className="gallery-parents">
            {PLANTS[sp.parent1]?.icon}{PLANTS[sp.parent1]?.name} × {PLANTS[sp.parent2]?.icon}{PLANTS[sp.parent2]?.name}
          </div>
        )}
        {!hybrid && owned > 0 && (
          <div className="gallery-owned">{owned} cultivées au total</div>
        )}
      </div>
    </div>
  );
}
