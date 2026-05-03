import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore.js';

// Tutoriel guidé en 6 étapes — GDD Prompt 5.
// L'avancement est automatique : on observe les changements du store via
// useGameStore.subscribe et on appelle advanceOnboarding(step) au bon moment.
//
// Les étapes :
//   1. Cliquer un pot vide → avance quand une plante est ajoutée
//   2. Regarder pousser → timer 4 s
//   3. Vente auto → avance quand stats.totalPlantsGrown >= 1
//   4. Continue à planter → avance quand 3+ plantes posées au total
//   5. Embauche un jardinier → avance quand greenhouse.gardeners.length >= 1
//   6. Final → fermable
const STEPS = [
  {
    n: 1,
    title: 'Bienvenue dans Le Jardin d\'Agnès 🌱',
    body: 'Tape sur l\'un des pots en terre cuite au sol pour planter ta première marguerite (1 €).',
    cta: 'Compris',
    autoNext: false,
  },
  {
    n: 2,
    title: 'La marguerite pousse',
    body: 'Elle met 2 minutes à devenir mature. Sur desktop, tu peux suivre sa progression dans la liste à gauche.',
    cta: 'Suivant',
    autoNext: true,
    delayMs: 4000,
  },
  {
    n: 3,
    title: 'Vente automatique 🌼',
    body: 'À maturité, la marguerite se vend toute seule au prix du marché. Tu peux aussi cliquer une fleur mature pour récolter manuellement avec un bonus +25 %.',
    cta: 'Suivant',
    autoNext: false,
  },
  {
    n: 4,
    title: 'Continue à planter',
    body: 'Plante d\'autres marguerites pour gagner plus. À 50 € lifetime, la tulipe se débloque (2,5× plus rentable). À 200 € lifetime, la lavande.',
    cta: 'Suivant',
    autoNext: false,
  },
  {
    n: 5,
    title: 'Embauche un jardinier 👩‍🌾',
    body: 'Pour 200 €, embauche Marie la Florale. Sans jardinier, tes pots se vident à chaque vente. Avec, tout repousse en boucle. Onglet Jardiniers en bas.',
    cta: 'Suivant',
    autoNext: false,
  },
  {
    n: 6,
    title: 'Tu es prêt(e) 🌿',
    body: 'Surveille la météo et le marché : vendre quand le multiplicateur dépasse ×1,40 fait des gros bénefs. Bonne route !',
    cta: 'Démarrer',
    autoNext: false,
  },
];

export default function Onboarding() {
  const onboarding = useGameStore((s) => s.onboarding);
  const advance = useGameStore((s) => s.advanceOnboarding);
  const dismiss = useGameStore((s) => s.dismissOnboarding);

  // Observe les actions du joueur pour avancer auto
  useEffect(() => {
    return useGameStore.subscribe((s, prev) => {
      if (s.onboarding.dismissed) return;
      const step = s.onboarding.step;

      // Étape 1 → 2 : première plante posée
      if (step <= 1) {
        const plants = s.greenhouses[s.activeGreenhouse]?.plants?.length ?? 0;
        if (plants >= 1) advance(2);
      }
      // Étape 3 : avance dès qu'on récolte la première
      if (step <= 2 && s.stats.totalPlantsGrown >= 1) {
        advance(3);
      }
      // Étape 4 : 3 plantes posées au total
      // Compte le nombre total de plantations toutes espèces confondues
      // (pas que les marguerites — le joueur peut diversifier tôt).
      const totalOwned = Object.values(s.species ?? {}).reduce(
        (sum, sp) => sum + (sp?.owned ?? 0),
        0
      );
      if (step <= 3 && totalOwned >= 3) {
        advance(4);
      }
      // Étape 5 : un jardinier embauché
      if (step <= 4) {
        const hired = s.greenhouses[s.activeGreenhouse]?.gardeners?.length ?? 0;
        if (hired >= 1) advance(5);
      }
      // Étape 6 : conserve l'étape 5 jusqu'au clic suivant
    });
  }, [advance]);

  // Auto-next basé sur le timer
  const [autoNextDone, setAutoNextDone] = useState(false);
  useEffect(() => {
    setAutoNextDone(false);
    const cur = STEPS.find((s) => s.n === onboarding.step + 1) ?? STEPS.find((s) => s.n === onboarding.step);
    if (!cur || !cur.autoNext || onboarding.dismissed) return;
    const id = setTimeout(() => {
      setAutoNextDone(true);
    }, cur.delayMs ?? 3000);
    return () => clearTimeout(id);
  }, [onboarding.step, onboarding.dismissed]);

  if (onboarding.dismissed) return null;

  // Si l'étape 0, on montre la 1.
  const stepN = Math.max(1, onboarding.step);
  const cur = STEPS.find((s) => s.n === stepN);
  if (!cur) return null;

  const onCta = () => {
    if (cur.n >= STEPS.length) {
      dismiss();
    } else {
      advance(cur.n + 1);
    }
  };

  return (
    <>
      <div className="onboarding-backdrop" />
      <div className="onboarding-card" role="dialog" aria-labelledby="onb-title">
        <div className="onboarding-step">{cur.n} / {STEPS.length}</div>
        <h2 id="onb-title">{cur.title}</h2>
        <p>{cur.body}</p>
        <div className="onboarding-actions">
          {cur.n < STEPS.length && (
            <button className="onboarding-skip" onClick={dismiss}>
              Passer le tutoriel
            </button>
          )}
          <button
            className="onboarding-cta"
            onClick={onCta}
            disabled={cur.autoNext && !autoNextDone}
          >
            {cur.autoNext && !autoNextDone ? 'Patience…' : cur.cta}
          </button>
        </div>
      </div>
    </>
  );
}
