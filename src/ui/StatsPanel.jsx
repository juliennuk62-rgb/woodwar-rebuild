import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { formatEuros, formatNumber, formatDuration } from '../utils/numberFormat.js';
import { getAchievementBonus } from '../mechanics/quests.js';
import { getResearchBonuses } from '../mechanics/research.js';

// Panel "Statistiques" — façon AdVenture Capitalist : un mur de big numbers
// qui donne au joueur la satisfaction de voir tout ce qu'il a accompli.
export default function StatsPanel() {
  const close = useGameStore((s) => s.setActivePanel);

  // Re-render 1×/s pour le multiplicateur live et les compteurs qui bougent
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const s = useGameStore.getState();
  const stats = s.stats ?? {};
  const currency = s.currency ?? {};
  const greenhouses = s.greenhouses ?? {};
  const expeditions = s.expeditions ?? {};
  const research = s.research ?? {};

  const totalIncome = s.getIncomePerSecond();
  const totalPlanted = Object.values(s.species ?? {}).reduce(
    (sum, sp) => sum + (sp?.owned ?? 0),
    0
  );
  const totalDiscovered = Object.values(s.species ?? {}).filter((sp) => sp?.discovered).length;
  const totalHybrids = Object.keys(s.hybrids ?? {}).length;
  const totalTokens = Object.values(greenhouses).reduce(
    (sum, gh) => sum + (gh.prestige?.tokens ?? 0),
    0
  );
  const totalPrestiges = Object.values(greenhouses).reduce(
    (sum, gh) => sum + (gh.prestige?.count ?? 0),
    0
  );
  const unlockedGreenhouses = Object.values(greenhouses).filter((g) => g.unlocked).length;

  // Tous les jardiniers embauchés
  let hiredGardeners = 0;
  for (const gh of Object.values(greenhouses)) {
    if (Array.isArray(gh.gardeners)) hiredGardeners += gh.gardeners.length;
    else if (gh.gardeners) hiredGardeners += Object.values(gh.gardeners).filter((lvl) => lvl > 0).length;
  }

  // Multiplicateur global (approximation : moyenne des serres actives)
  const claimed = s.quests?.claimed ?? {};
  const aBonuses = getAchievementBonus(claimed);
  const rBonuses = getResearchBonuses(research?.unlocked ?? []);
  const multiBreakdown = computeMultiplierBreakdown(s);

  // Temps de jeu — approximation depuis lastSave initial
  const playTime = formatDuration(Math.max(0, (Date.now() - (s.firstPlayAt ?? Date.now())) / 1000));

  return (
    <>
      <div className="panel-backdrop" onClick={() => close(null)} />
      <aside className="side-panel">
        <header className="side-panel-header">
          <div>
            <div className="side-panel-title">Statistiques</div>
            <div className="side-panel-sub">L'empire d'Agnès en chiffres</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <div className="side-panel-body">
          {/* ── HERO STATS ── */}
          <div className="stats-grid stats-grid--hero">
            <BigStat label="Production actuelle" value={`+ ${formatNumber(totalIncome, { decimals: 1 })} €/s`} accent="green" />
            <BigStat label="Total gagné" value={formatEuros(currency.lifetimeEuros ?? 0)} accent="gold" />
          </div>

          {/* ── MULTIPLICATEUR BREAKDOWN ── */}
          <div className="stats-section">
            <div className="settings-section-title">Multiplicateur global ×{multiBreakdown.total.toFixed(2).replace('.', ',')}</div>
            <div className="stats-multi-breakdown">
              {multiBreakdown.parts.map((p) => (
                <div key={p.label} className="stats-multi-row">
                  <span className="stats-multi-label">{p.icon} {p.label}</span>
                  <span className={`stats-multi-value ${p.value >= 1.01 ? 'good' : p.value <= 0.99 ? 'bad' : ''}`}>
                    ×{p.value.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── COMPTEURS ── */}
          <div className="stats-section">
            <div className="settings-section-title">Cultivation</div>
            <div className="stats-grid">
              <Stat label="Plantes cultivées" value={formatNumber(stats.totalPlantsGrown ?? 0)} />
              <Stat label="Plantations totales" value={formatNumber(totalPlanted)} />
              <Stat label="Espèces découvertes" value={`${totalDiscovered}`} />
              <Stat label="Hybrides créés" value={formatNumber(totalHybrids)} />
            </div>
          </div>

          <div className="stats-section">
            <div className="settings-section-title">Empire</div>
            <div className="stats-grid">
              <Stat label="Serres débloquées" value={`${unlockedGreenhouses} / ${Object.keys(greenhouses).length}`} />
              <Stat label="Jardiniers embauchés" value={formatNumber(hiredGardeners)} />
              <Stat label="Recherches débloquées" value={formatNumber((research.unlocked ?? []).length)} />
              <Stat label="Expéditions terminées" value={formatNumber(expeditions.completed ?? 0)} />
            </div>
          </div>

          <div className="stats-section">
            <div className="settings-section-title">Prestige</div>
            <div className="stats-grid">
              <Stat label="Total prestiges" value={formatNumber(totalPrestiges)} />
              <Stat label="Tokens accumulés" value={formatNumber(totalTokens)} accent="gold" />
              <Stat label="Bonus permanent" value={`+ ${Math.round((s.permanentBonuses?.revenueBonus ?? 0) * 100)} %`} />
              <Stat label="1er prestige" value={stats.firstPrestigeAt ? '✓' : '—'} />
            </div>
          </div>

          <div className="stats-section">
            <div className="settings-section-title">Interactions</div>
            <div className="stats-grid">
              <Stat label="Clics arrosoir" value={formatNumber(s.waterClicks ?? 0)} />
              <Stat label="Auto-arrosoir" value={s.autoWaterer ? '✓ Actif' : '—'} />
              <Stat label="Graines rares" value={formatNumber(currency.rareSeeds ?? 0)} accent="green" />
              <Stat label="€ totaux gagnés" value={formatEuros(stats.totalEarned ?? 0)} />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stats-cell ${accent ? `is-${accent}` : ''}`}>
      <div className="stats-cell-label">{label}</div>
      <div className="stats-cell-value">{value}</div>
    </div>
  );
}

function BigStat({ label, value, accent }) {
  return (
    <div className={`stats-cell stats-cell--big ${accent ? `is-${accent}` : ''}`}>
      <div className="stats-cell-label">{label}</div>
      <div className="stats-cell-value">{value}</div>
    </div>
  );
}

// Calcule la décomposition du multiplicateur global (en moyennant sur la
// serre active pour simplifier — donne au joueur l'idée d'où vient son revenu).
function computeMultiplierBreakdown(s) {
  const parts = [];
  const claimed = s.quests?.claimed ?? {};
  const aBonuses = getAchievementBonus(claimed);
  const rBonuses = getResearchBonuses(s.research?.unlocked ?? []);

  parts.push({ icon: '🏆', label: 'Achievements', value: 1 + (aBonuses.revenueBonus ?? 0) });
  parts.push({ icon: '🔬', label: 'Recherche', value: 1 + (rBonuses.revenueBonus ?? 0) });
  parts.push({ icon: '🌟', label: 'Bonus permanent', value: 1 + (s.permanentBonuses?.revenueBonus ?? 0) });

  // Boost actuel arrosoir
  const now = Date.now();
  const waterStacks = (now < s.waterBoostEndsAt) ? s.waterBoostStacks : 0;
  parts.push({ icon: '💧', label: 'Arrosoir', value: 1 + waterStacks * 0.25 });

  // Boost abeille dorée
  const bee = s.activeBoost;
  const beeM = (bee && bee.endsAt > now) ? (bee.multiplier ?? 1) : 1;
  parts.push({ icon: '🐝', label: 'Abeille dorée', value: beeM });

  const total = parts.reduce((acc, p) => acc * p.value, 1);
  return { parts, total };
}
