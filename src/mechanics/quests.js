// Moteur de quêtes — pure logic, pas d'effet de bord.
// Le store appelle ces fonctions et applique les changements.
import {
  STORY_QUESTS,
  ACHIEVEMENTS,
  DAILY_QUEST_KINDS,
  targetForDaily,
  dailyProgressValue,
} from '../config/quests.js';

// Stats sur l'avancement d'une quête (story ou achievement)
export function questStatus(quest, state, claimed = {}) {
  const progress = quest.progress(state);
  const ratio = Math.min(1, progress / quest.target);
  return {
    id: quest.id,
    progress,
    ratio,
    isComplete: progress >= quest.target,
    isClaimed: !!claimed[quest.id],
  };
}

// Renvoie la quête story actuellement disponible (la 1re non-claimed dont
// le prereq est claimed). null si tout claimed.
export function activeStory(state, claimed = {}) {
  for (const q of STORY_QUESTS) {
    if (claimed[q.id]) continue;
    if (q.prereq && !claimed[q.prereq]) continue;
    return q;
  }
  return null;
}

// Liste des achievements à montrer (tous, mais avec status)
export function achievementsList(state, claimed = {}) {
  return ACHIEVEMENTS.map((a) => ({
    quest: a,
    ...questStatus(a, state, claimed),
  }));
}

export function storyList(state, claimed = {}) {
  return STORY_QUESTS.map((q) => {
    const status = questStatus(q, state, claimed);
    const locked = q.prereq && !claimed[q.prereq];
    return { quest: q, ...status, locked };
  });
}

// ─── Dailies ──────────────────────────────────────────────────────
// Génère 3 dailies pour aujourd'hui en piochant 3 kinds différents.
// Snapshot des compteurs au moment du tirage : on calcule (current - start).
export function generateDailies(state, today = todayISO()) {
  // Toujours 3 kinds. On les tire dans l'ordre : earn, plant, expedition.
  const kinds = [...DAILY_QUEST_KINDS];
  const out = kinds.map((kind) => ({
    id: `d_${kind}_${today}`,
    kind,
    target: targetForDaily(kind, state),
    startValue: dailyProgressValue(kind, state),
    claimed: false,
  }));
  return out;
}

export function dailyStatus(daily, state) {
  if (!daily) return null;
  const current = dailyProgressValue(daily.kind, state);
  const delta = Math.max(0, current - daily.startValue);
  const ratio = Math.min(1, delta / daily.target);
  return {
    ...daily,
    progress: delta,
    ratio,
    isComplete: delta >= daily.target,
  };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function shouldRefreshDailies(quests, today = todayISO()) {
  return quests?.daily?.lastRefresh !== today;
}

// Bonus revenu cumulé depuis tous les achievements claimed
export function getAchievementBonus(claimed = {}) {
  let bonus = 0;
  for (const a of ACHIEVEMENTS) {
    if (!claimed[a.id]) continue;
    if (a.reward?.revenueBonus) bonus += a.reward.revenueBonus;
  }
  return bonus;
}
