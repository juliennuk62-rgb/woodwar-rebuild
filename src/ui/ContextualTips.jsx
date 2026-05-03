import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { HOT_THRESHOLD } from '../mechanics/market.js';

// Tips contextuels — apparaissent UNE seule fois à la première rencontre
// d'une feature avancée (saison, pic marché). Toast top center, dismissable.
//
// Détection :
//   - season    : observe market.currentSeason qui change vs la valeur précédente
//   - marketHot : itère sur prices et détecte une espèce déjà découverte ≥ 1.40
//
// Persistance : chaque tip vu est stocké dans state.tipsSeen[tipId] = true
// via markTipSeen, donc un reload n'en re-déclenche aucun.

const TIP_TEXTS = {
  season: '🌸 La saison change ! Le printemps boost les tulipes et les roses (+30 %).',
  marketHot: '📈 Le marché grimpe ! Vendre maintenant rapporte beaucoup plus.',
};

const SHOW_DURATION_MS = 8000;
const SPAWN_DELAY_MS = 500;

export default function ContextualTips() {
  const [activeTip, setActiveTip] = useState(null); // { id, text }
  const reducedMotion = useGameStore((s) => s.settings?.reducedMotion);

  // On garde des refs pour pouvoir tracker les changements depuis le subscribe
  // sans remonter un composant à chaque update du store.
  const fadeTimerRef = useRef(null);
  const spawnTimerRef = useRef(null);
  const prevSeasonRef = useRef(null);

  useEffect(() => {
    // Initialise la saison de référence avec la valeur courante du store, pour
    // ne PAS déclencher le tip "saison" sur le premier render (le joueur n'a
    // pas encore "observé" de transition s'il vient juste de charger le jeu).
    const initial = useGameStore.getState();
    prevSeasonRef.current = initial.market?.currentSeason ?? null;

    const queueTip = (tipId) => {
      const state = useGameStore.getState();
      if (state.tipsSeen?.[tipId]) return;
      // Marque immédiatement pour éviter qu'un second événement très rapide
      // ne re-queue le même tip avant que le premier ne soit affiché.
      state.markTipSeen(tipId);

      // Petit delay pour ne pas spawn pendant un changement abrupt
      // (ex: la saison change pile au moment où une autre transition a lieu).
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      spawnTimerRef.current = setTimeout(() => {
        setActiveTip({ id: tipId, text: TIP_TEXTS[tipId] });
      }, SPAWN_DELAY_MS);
    };

    const unsubscribe = useGameStore.subscribe((s) => {
      // ─── Tip 1 : transition de saison observée ────────────────────
      const curSeason = s.market?.currentSeason;
      if (curSeason && prevSeasonRef.current && curSeason !== prevSeasonRef.current) {
        queueTip('season');
      }
      if (curSeason) prevSeasonRef.current = curSeason;

      // ─── Tip 2 : pic de marché (≥ HOT_THRESHOLD) sur espèce découverte ─
      if (!s.tipsSeen?.marketHot) {
        const prices = s.market?.prices ?? {};
        for (const speciesId of Object.keys(prices)) {
          if (prices[speciesId] >= HOT_THRESHOLD && s.species?.[speciesId]?.discovered) {
            queueTip('marketHot');
            break;
          }
        }
      }
    });

    return () => {
      unsubscribe();
      if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  // Auto-fade après SHOW_DURATION_MS
  useEffect(() => {
    if (!activeTip) return;
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = setTimeout(() => {
      setActiveTip(null);
    }, SHOW_DURATION_MS);
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [activeTip]);

  if (!activeTip) return null;

  const className = `contextual-tip${reducedMotion ? ' contextual-tip--reduced' : ''}`;

  return (
    <div
      className={className}
      role="status"
      aria-live="polite"
      onClick={() => setActiveTip(null)}
    >
      <span className="contextual-tip-text">{activeTip.text}</span>
      <button
        type="button"
        className="contextual-tip-close"
        aria-label="Fermer le conseil"
        onClick={(e) => {
          e.stopPropagation();
          setActiveTip(null);
        }}
      >
        ×
      </button>
    </div>
  );
}
