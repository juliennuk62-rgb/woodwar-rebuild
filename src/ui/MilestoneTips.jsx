import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';

// Tips contextuels pour les features que l'onboarding (étapes 1→6) ne couvre
// pas : laboratoire (hybridation) et prestige. Le joueur les découvre souvent
// par hasard, donc on lui pousse un toast doré une seule fois quand la
// condition se déclenche.
//
// Préfixe `mtips` choisi exprès pour ne pas collisionner avec le système
// `tipsSeen` / `markTipSeen` déjà utilisé pour d'autres tips.
//
// Règles :
//   - Pas pendant l'onboarding (step 1→5, non dismissé)
//   - Délai de 1 s avant l'apparition pour laisser le contexte se poser
//   - Auto-fade après 12 s
//   - Bouton "Compris" ferme le toast

const TIP_LAB = {
  id: 'lab_unlocked',
  text: '🧬 Tu peux maintenant croiser deux espèces dans le Laboratoire pour créer un hybride unique.',
};
const TIP_PRESTIGE = {
  id: 'prestige_unlocked',
  text: '🌟 Tu peux maintenant réinitialiser cette serre pour gagner des tokens permanents qui boostent ses futurs revenus.',
};

const SPAWN_DELAY_MS = 1000;
const AUTO_FADE_MS = 12000;

// Vrai si l'onboarding est encore en cours (étapes 1→5 sur 6).
function isOnboardingActive(s) {
  const o = s.onboarding;
  if (!o) return false;
  return o.dismissed === false && o.step > 0 && o.step < 6;
}

function countDiscovered(species) {
  if (!species) return 0;
  let n = 0;
  for (const sp of Object.values(species)) {
    if (sp?.discovered) n++;
  }
  return n;
}

function anyGreenhouseCanPrestige(greenhouses) {
  if (!greenhouses) return false;
  for (const gh of Object.values(greenhouses)) {
    if (!gh?.unlocked) continue;
    const lifetime = gh.prestige?.lifetimeEarned ?? 0;
    if (Math.floor(Math.sqrt(Math.max(0, lifetime))) > 0) return true;
  }
  return false;
}

export default function MilestoneTips() {
  // `current` est l'objet tip affiché ou null. On ne montre qu'un tip à la fois
  // pour ne pas saturer l'écran si les deux conditions tombent en même temps.
  const [current, setCurrent] = useState(null);
  const pendingTimerRef = useRef(null);
  const fadeTimerRef = useRef(null);

  useEffect(() => {
    // Évalue une condition avec délai. Si le tip a déjà été vu ou si
    // l'onboarding est actif, on ne fait rien.
    function maybeQueue(tip) {
      if (current?.id === tip.id) return;
      if (pendingTimerRef.current) return;
      const s = useGameStore.getState();
      if (s.mtipsSeen?.[tip.id]) return;
      if (isOnboardingActive(s)) return;
      pendingTimerRef.current = setTimeout(() => {
        pendingTimerRef.current = null;
        // Re-vérifie au moment d'afficher : l'état peut avoir changé pendant la
        // seconde d'attente (onboarding repris, tip déjà marqué…).
        const s2 = useGameStore.getState();
        if (s2.mtipsSeen?.[tip.id]) return;
        if (isOnboardingActive(s2)) return;
        setCurrent((cur) => cur ?? tip);
      }, SPAWN_DELAY_MS);
    }

    // Vérification immédiate (au mount, après chargement de la save).
    function evaluate(s) {
      if (!s.mtipsSeen?.[TIP_LAB.id] && countDiscovered(s.species) >= 2) {
        maybeQueue(TIP_LAB);
      }
      if (!s.mtipsSeen?.[TIP_PRESTIGE.id] && anyGreenhouseCanPrestige(s.greenhouses)) {
        maybeQueue(TIP_PRESTIGE);
      }
    }

    evaluate(useGameStore.getState());

    const unsub = useGameStore.subscribe((s) => {
      evaluate(s);
    });

    return () => {
      unsub();
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Auto-fade après AUTO_FADE_MS — réarmé à chaque changement de tip.
  useEffect(() => {
    if (!current) return;
    fadeTimerRef.current = setTimeout(() => {
      const id = current.id;
      useGameStore.getState().markMtipSeen(id);
      setCurrent(null);
    }, AUTO_FADE_MS);
    return () => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, [current]);

  if (!current) return null;

  const onDismiss = () => {
    useGameStore.getState().markMtipSeen(current.id);
    setCurrent(null);
  };

  return (
    <div className="milestone-tip" role="status" aria-live="polite">
      <p className="milestone-tip-text">{current.text}</p>
      <button type="button" className="milestone-tip-cta" onClick={onDismiss}>
        Compris
      </button>
    </div>
  );
}
