import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { formatEuros, formatNumber } from '../utils/numberFormat.js';

const TABS = [
  { id: 'story',   label: 'Histoire' },
  { id: 'achieve', label: 'Succès' },
  { id: 'daily',   label: 'Journalières' },
];

export default function QuestsPanel() {
  const close = useGameStore((s) => s.setActivePanel);
  const [tab, setTab] = useState('story');

  // Re-render léger pour rafraîchir les barres de progression
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
            <div className="side-panel-title">Quêtes</div>
            <div className="side-panel-sub">Histoire, succès, journalières</div>
          </div>
          <button className="side-panel-close" onClick={() => close(null)} aria-label="Fermer">×</button>
        </header>

        <nav className="lab-tabs" aria-label="Onglets quêtes">
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
          {tab === 'story'   && <StoryTab />}
          {tab === 'achieve' && <AchievementsTab />}
          {tab === 'daily'   && <DailyTab />}
        </div>
      </aside>
    </>
  );
}

function StoryTab() {
  const list = useGameStore((s) => s.getStoryList)();
  const claim = useGameStore((s) => s.claimQuest);

  return (
    <>
      <p className="panel-intro">
        Une chaîne de 10 étapes pour t'accompagner du premier semis à
        ton premier prestige. Chaque étape débloque la suivante.
      </p>
      <div className="cards">
        {list.map((q) => (
          <QuestCard
            key={q.quest.id}
            title={q.quest.title}
            description={q.quest.description}
            progress={q.progress}
            target={q.quest.target}
            ratio={q.ratio}
            isComplete={q.isComplete}
            isClaimed={q.isClaimed}
            isLocked={q.locked && !q.isClaimed}
            reward={q.quest.reward}
            onClaim={() => claim(q.quest.id)}
          />
        ))}
      </div>
    </>
  );
}

function AchievementsTab() {
  const list = useGameStore((s) => s.getAchievements)();
  const claim = useGameStore((s) => s.claimQuest);

  return (
    <>
      <p className="panel-intro">
        12 succès permanents qui débloquent des bonus de revenu cumulatifs.
        Plus tu progresses, plus ta serre rapporte.
      </p>
      <div className="cards">
        {list.map((q) => (
          <QuestCard
            key={q.quest.id}
            title={q.quest.title}
            icon={q.quest.icon}
            progress={q.progress}
            target={q.quest.target}
            ratio={q.ratio}
            isComplete={q.isComplete}
            isClaimed={q.isClaimed}
            reward={q.quest.reward}
            onClaim={() => claim(q.quest.id)}
          />
        ))}
      </div>
    </>
  );
}

function DailyTab() {
  const dailies = useGameStore((s) => s.getDailies)();
  const claim = useGameStore((s) => s.claimQuest);
  const lastRefresh = useGameStore((s) => s.quests.daily.lastRefresh);

  return (
    <>
      <p className="panel-intro">
        Trois quêtes tirées chaque jour pour rythmer tes sessions.
        Reset à minuit (heure locale).
        {lastRefresh && <span style={{ color: 'var(--muted)' }}> · Tirage du {lastRefresh}</span>}
      </p>

      {dailies.length === 0 ? (
        <p className="panel-intro" style={{ marginTop: 12, fontStyle: 'italic' }}>
          Tirage en cours…
        </p>
      ) : (
        <div className="cards">
          {dailies.map((d) => (
            <QuestCard
              key={d.id}
              title={d.title}
              description={d.description}
              progress={d.progress}
              target={d.target}
              ratio={d.ratio}
              isComplete={d.isComplete}
              isClaimed={d.isClaimed}
              reward={d.reward}
              onClaim={() => claim(d.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─── Carte de quête commune ─────────────────────────────────────
function QuestCard({
  title, description, icon, progress, target, ratio, isComplete, isClaimed, isLocked, reward, onClaim,
}) {
  const showProgress = !isLocked && !isClaimed;
  const fillPct = Math.max(8, Math.round(ratio * 100)); // Zeigarnik : barres jamais à 0%
  return (
    <div className={`quest-card ${isClaimed ? 'claimed' : ''} ${isLocked ? 'locked' : ''} ${isComplete && !isClaimed ? 'ready' : ''}`}>
      {icon && <div className="quest-icon">{icon}</div>}
      <div className="quest-body">
        <div className="quest-row">
          <div className="quest-title">
            {title}
            {isLocked && <span className="quest-locked-tag"> · 🔒 verrouillée</span>}
          </div>
          {isClaimed ? (
            <span className="badge badge-active">✓ Réclamé</span>
          ) : isComplete ? (
            <button className="btn-plant" onClick={onClaim}>Récupérer</button>
          ) : (
            <RewardPill reward={reward} subtle={isLocked} />
          )}
        </div>
        {description && <div className="quest-desc">{description}</div>}
        {showProgress && (
          <>
            <div className="expedition-bar">
              <div className="expedition-bar-fill"
                style={{
                  width: `${fillPct}%`,
                  background: isComplete ? 'var(--gold)' : 'var(--green)',
                }}
              />
            </div>
            <div className="quest-progress">
              {formatNumber(progress)} / {formatNumber(target)}
              {' · '}
              {Math.round(ratio * 100)}%
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RewardPill({ reward, subtle }) {
  if (!reward) return null;
  const parts = [];
  if (reward.euros) parts.push(`+${formatEuros(reward.euros)}`);
  if (reward.rareSeeds) parts.push(`+${reward.rareSeeds} 🌱`);
  if (reward.revenueBonus) parts.push(`+${Math.round(reward.revenueBonus * 100)}% 💶`);
  if (reward.achievementBonus?.revenueBonus) parts.push(`+${Math.round(reward.achievementBonus.revenueBonus * 100)}% 💶`);
  if (parts.length === 0) return null;
  return (
    <span className={`reward-pill ${subtle ? 'subtle' : ''}`}>
      {parts.join(' · ')}
    </span>
  );
}
