// Store complètement isolé pour le prototype "tapis roulant".
// Aucun lien avec le store du jeu principal — propre localStorage,
// propre boucle, propre économie.
//
// L'idée : tester si la mécanique du conveyor seule suffit à faire
// un loop de jeu intéressant. Si oui, on partira là-dessus pour
// reconstruire un vrai tycoon autour.
import { create } from 'zustand';
import { CONVEYOR, pickRarity, rollCard } from '../config/conveyor.js';

const SAVE_KEY = 'jardin-agnes:sandbox';
const TICK_MS = 100;

// Économie de base du sandbox : un revenu passif fixe qui scale avec le
// niveau d'usine (chaque achat de "tapis additionnel" augmente le baseline).
// Permet au joueur d'avoir un budget pour saisir des cartes sans avoir à
// gérer des plantes — focus total sur la décision conveyor.
const BASE_INCOME_PER_LEVEL = 2;       // €/s par niveau d'usine
const FACTORY_BASE_COST = 50;          // coût du 1er upgrade
const FACTORY_COST_GROWTH = 1.55;      // coût × 1.55 par niveau

function loadSandboxSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    // On nettoie systématiquement les cartes — éphémères.
    data.cards = [];
    data.nextSpawnAt = 0;
    return data;
  } catch {
    return null;
  }
}

function saveSandbox(state) {
  try {
    const { cards, ...persisted } = state;
    localStorage.setItem(SAVE_KEY, JSON.stringify(persisted));
  } catch {}
}

const initial = {
  // Cash = ressource unique. Démarre à 50 € pour pouvoir saisir
  // immédiatement quelques commun et apprendre la boucle.
  cash: 50,
  lifetimeEarned: 0,

  // Niveau d'usine = upgrade unique. +2 €/s par niveau.
  factoryLevel: 1,

  // Stats lifetime
  grabbed: 0,
  ignored: 0,
  totalSpent: 0,
  totalGained: 0,

  // Cartes en cours sur le tapis (volatiles)
  cards: [],
  nextSpawnAt: 0,
  lastTick: 0,
};

export const useSandboxStore = create((set, get) => ({
  ...initial,
  ready: false,

  init: () => {
    const saved = loadSandboxSave();
    if (saved) set({ ...initial, ...saved, ready: true });
    else set({ ready: true });
  },

  // ─── Économie ──────────────────────────────────────────────────
  getIncomePerSecond: () => {
    const s = get();
    return BASE_INCOME_PER_LEVEL * s.factoryLevel;
  },

  getFactoryUpgradeCost: () => {
    const s = get();
    return Math.round(FACTORY_BASE_COST * Math.pow(FACTORY_COST_GROWTH, s.factoryLevel - 1));
  },

  buyFactoryUpgrade: () => {
    const cost = get().getFactoryUpgradeCost();
    const s = get();
    if (s.cash < cost) return false;
    set({ cash: s.cash - cost, factoryLevel: s.factoryLevel + 1 });
    return true;
  },

  // ─── Tick — appelé toutes les 100 ms par le composant racine ──
  tick: () => {
    const now = Date.now();
    const s = get();

    // Revenu passif : appliqué chaque tick proportionnellement au delta
    if (s.lastTick > 0) {
      const dtSec = (now - s.lastTick) / 1000;
      const earned = get().getIncomePerSecond() * dtSec;
      if (earned > 0) {
        set((st) => ({
          cash: st.cash + earned,
          lifetimeEarned: st.lifetimeEarned + earned,
        }));
      }
    }

    // Spawn d'une carte si le tapis n'est pas plein et le timer est OK.
    if (now >= (s.nextSpawnAt ?? 0) && s.cards.length < CONVEYOR.maxOnBelt) {
      const ips = get().getIncomePerSecond();
      const rarity = pickRarity(1); // pas de boost global dans le sandbox
      const card = rollCard(rarity, ips);
      const id = `cv_${now}_${Math.floor(Math.random() * 9999)}`;
      const newCard = {
        id, rarity, ...card,
        spawnedAt: now,
        expiresAt: now + CONVEYOR.lifetimeMs,
      };
      set((st) => ({
        cards: [...st.cards, newCard],
        nextSpawnAt: now + CONVEYOR.spawnIntervalMs + Math.random() * CONVEYOR.spawnJitterMs,
      }));
    }

    // Expire les cartes
    const expired = s.cards.filter((c) => c.expiresAt <= now);
    if (expired.length > 0) {
      set((st) => ({
        cards: st.cards.filter((c) => c.expiresAt > now),
        ignored: st.ignored + expired.length,
      }));
    }

    set({ lastTick: now });
  },

  // ─── Saisir une carte ─────────────────────────────────────────
  grabCard: (cardId) => {
    const s = get();
    const card = s.cards.find((c) => c.id === cardId);
    if (!card) return false;
    if (s.cash < card.cost) return false;

    let gainedCash = 0;
    if (card.type === 'cash') {
      gainedCash = card.gain;
    } else if (card.type === 'boost') {
      // Boost : on convertit en gain instantané équivalent à durée × multi × ips
      // (simplification pour le sandbox — pas de timer global ici)
      const ips = get().getIncomePerSecond();
      gainedCash = Math.round(ips * (card.durationMs / 1000) * (card.multiplier - 1));
    } else if (card.type === 'seed') {
      // Pas de système de graines dans le sandbox — on convertit en cash
      // (chaque graine = 50 × ips, valeur arbitraire pour le proto)
      gainedCash = Math.round(get().getIncomePerSecond() * 50 * card.quantity);
    }

    set((st) => ({
      cash: st.cash - card.cost + gainedCash,
      lifetimeEarned: st.lifetimeEarned + gainedCash,
      cards: st.cards.filter((c) => c.id !== cardId),
      grabbed: st.grabbed + 1,
      totalSpent: st.totalSpent + card.cost,
      totalGained: st.totalGained + gainedCash,
    }));
    return true;
  },

  // Reset complet (bouton dans la sandbox)
  reset: () => {
    try { localStorage.removeItem(SAVE_KEY); } catch {}
    set({ ...initial, ready: true });
  },
}));

// Autosave : 1×/3s
let saveInterval = null;
export function startSandboxAutosave() {
  if (saveInterval) return;
  saveInterval = setInterval(() => {
    const s = useSandboxStore.getState();
    if (s.ready) saveSandbox(s);
  }, 3000);
}
export function stopSandboxAutosave() {
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
}

// Boucle de jeu (séparée du jeu principal pour ne pas se polluer mutuellement)
let tickInterval = null;
export function startSandboxLoop() {
  if (tickInterval) return;
  const s = useSandboxStore.getState();
  if (!s.ready) s.init();
  tickInterval = setInterval(() => {
    useSandboxStore.getState().tick();
  }, TICK_MS);
}
export function stopSandboxLoop() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}
