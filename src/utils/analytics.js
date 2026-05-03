// Analytics : abstraction simple. Pour l'instant on log dans la console.
// L'intégration GameAnalytics réelle (npm install gameanalytics) viendra
// avec le Prompt 10 (lancement). Cette interface centralise pour qu'on
// n'ait pas à modifier les call sites.

const ENABLED = false; // mettre à true pour voir les events en console

const queue = [];
const MAX_QUEUE = 200;

export function trackEvent(name, properties = {}) {
  const entry = {
    name,
    properties,
    timestamp: Date.now(),
  };
  queue.push(entry);
  if (queue.length > MAX_QUEUE) queue.shift();
  if (ENABLED) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${name}`, properties);
  }
}

export function trackOnce(name, properties = {}) {
  const key = `__jardin_seen_${name}`;
  if (window[key]) return;
  window[key] = true;
  trackEvent(name, properties);
}

export function getQueue() {
  return [...queue];
}

// Helpers pour les events standards (GDD Prompt 9)
export const Events = {
  tutorialStep: (step)         => trackEvent('tutorial_step_completed', { step }),
  firstPlant: ()                => trackOnce('first_plant_bought'),
  firstGardener: ()             => trackOnce('first_gardener_hired'),
  firstExpedition: ()           => trackOnce('first_expedition_completed'),
  firstHybrid: ()               => trackOnce('first_hybrid_created'),
  firstPrestige: ()             => trackOnce('first_prestige'),
  greenhouseUnlocked: (id)      => trackEvent('greenhouse_unlocked', { greenhouse: id }),
  questCompleted: (id)          => trackEvent('quest_completed', { questId: id }),
  dailyQuestCompleted: (kind)   => trackEvent('daily_quest_completed', { kind }),
  achievementUnlocked: (id)     => trackEvent('achievement_unlocked', { achievementId: id }),
  sessionStart: ()              => trackEvent('session_start'),
  sessionEnd: (durationMs)      => trackEvent('session_end', { durationMs }),
};
