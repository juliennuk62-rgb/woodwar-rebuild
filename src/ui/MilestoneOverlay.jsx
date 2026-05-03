import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { audioManager } from '../audio/audioManager.js';
import { formatEuros } from '../utils/numberFormat.js';

// Rush moments — overlay cinématique qui s'affiche au passage de seuils €
// lifetime. GDD Prompt 11.
//
// Détection : on s'abonne à `currency.lifetimeEuros` via useGameStore.subscribe.
// À chaque franchissement, on enfile le seuil dans une queue interne (au cas
// où plusieurs seraient franchis dans le même tick — peu probable mais propre).
// Une seule modale visible à la fois ; on dépile à la fermeture.
//
// Persistance : le store stocke `seenMilestones[amount] = true`. On ignore
// donc les seuils déjà célébrés au reload.
//
// Accessibilité : si `settings.reducedMotion` est actif, on remplace
// l'animation full-screen + particules par un toast bref centré (~1.2s).

const THRESHOLDS = [
  1_000,
  10_000,
  100_000,
  1_000_000,
  10_000_000,
  100_000_000,
  1_000_000_000,
];

// Durée d'affichage de l'overlay normal (scale-in → hold → fade-out).
// Synchronisée avec l'animation CSS `milestone-pop` (cf. globals.css).
const OVERLAY_DURATION_MS = 2400;
// Toast réduit pour reducedMotion.
const TOAST_DURATION_MS = 1200;

// Libellé court affiché en gros. Pour les puissances de 1000 on préfère
// "1 MILLION" à "1,00M €" — plus spectaculaire pour un rush moment.
function bigLabel(amount) {
  switch (amount) {
    case 1_000:         return '1 000 €';
    case 10_000:        return '10 000 €';
    case 100_000:       return '100 000 €';
    case 1_000_000:     return '1 MILLION';
    case 10_000_000:    return '10 MILLIONS';
    case 100_000_000:   return '100 MILLIONS';
    case 1_000_000_000: return '1 MILLIARD';
    default:            return formatEuros(amount, { decimals: 0 });
  }
}

export default function MilestoneOverlay() {
  const reducedMotion = useGameStore((s) => s.settings?.reducedMotion);
  const markSeen = useGameStore((s) => s.markMilestoneSeen);

  // File interne de seuils en attente d'affichage. On garde aussi le seuil
  // courant séparé pour pouvoir animer son entrée/sortie tranquillement.
  const queueRef = useRef([]);
  const [current, setCurrent] = useState(null);

  // Affiche le prochain seuil dispo. No-op si rien en file ou déjà affiché.
  // On utilise un setter fonctionnel pour ne pas écraser un seuil en cours
  // (le subscribe peut être déclenché alors que la modale est encore visible).
  function showNext() {
    setCurrent((cur) => {
      if (cur != null) return cur;
      if (queueRef.current.length === 0) return null;
      return queueRef.current.shift();
    });
  }

  // Subscribe au store — on se cale sur le pattern d'Onboarding.jsx
  // (useGameStore n'a pas le middleware `subscribeWithSelector`, donc on
  // reçoit l'état complet et on compare lifetimeEuros à la main).
  useEffect(() => {
    return useGameStore.subscribe((s, prev) => {
      const lifetime = s.currency?.lifetimeEuros;
      const prevLifetime = prev?.currency?.lifetimeEuros;
      if (!Number.isFinite(lifetime) || !Number.isFinite(prevLifetime)) return;
      if (lifetime <= prevLifetime) return;
      const seen = s.seenMilestones ?? {};
      let pushedAny = false;
      for (const t of THRESHOLDS) {
        // Franchi pendant ce delta + jamais célébré
        if (lifetime >= t && prevLifetime < t && !seen[String(t)]) {
          // On marque tout de suite côté store : empêche un double-déclenchement
          // si un autre tick arrive avant qu'on ait dépilé la queue.
          markSeen(t);
          queueRef.current.push(t);
          pushedAny = true;
        }
      }
      if (pushedAny) showNext();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markSeen]);

  // Quand un seuil devient courant → joue le son + arme le timer de fermeture
  useEffect(() => {
    if (current == null) return;
    audioManager.play('prestige');
    const dur = reducedMotion ? TOAST_DURATION_MS : OVERLAY_DURATION_MS;
    const id = setTimeout(() => {
      setCurrent(null);
      // Laisse un petit gap avant d'enchaîner pour que l'animation respire.
      setTimeout(() => showNext(), 200);
    }, dur);
    return () => clearTimeout(id);
  }, [current, reducedMotion]);

  if (current == null) return null;

  if (reducedMotion) {
    return (
      <div className="milestone-toast" role="status" aria-live="polite">
        <span className="milestone-toast-tag">Palier atteint</span>
        <strong>{bigLabel(current)}</strong>
      </div>
    );
  }

  return (
    <div className="milestone-overlay" role="status" aria-live="polite">
      <div className="milestone-particles" aria-hidden="true">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className={`milestone-particle p${i % 6}`} />
        ))}
      </div>
      <div className="milestone-card">
        <div className="milestone-tag">🎉 Palier atteint</div>
        <div className="milestone-amount">{bigLabel(current)}</div>
        <div className="milestone-sub">Lifetime gagné dans ton jardin</div>
      </div>
    </div>
  );
}
