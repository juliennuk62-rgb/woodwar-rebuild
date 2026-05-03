import { useGameStore } from '../store/gameStore.js';

// Bannière visible quand la sauvegarde échoue. Le cas le plus fréquent est
// le quota localStorage dépassé (~5 MB) — typiquement après beaucoup
// d'hybrides + un long historique de marché. On laisse au joueur la main
// pour réinitialiser via Settings.
export default function SaveErrorBanner() {
  const error = useGameStore((s) => s.saveError);
  const clear = useGameStore((s) => s.setSaveError);
  const openSettings = useGameStore((s) => s.setActivePanel);

  if (!error) return null;

  const isQuota = error === 'quota';

  return (
    <div className="save-error-banner" role="alert">
      <div className="save-error-icon">⚠️</div>
      <div className="save-error-text">
        <strong>
          {isQuota ? 'Sauvegarde impossible — espace plein' : 'Sauvegarde impossible'}
        </strong>
        <span>
          {isQuota
            ? 'Le navigateur a atteint sa limite (~5 MB). Exporte ta save dans les Réglages, puis réinitialise pour repartir en douceur.'
            : 'Tes derniers progrès ne sont pas sauvegardés. Vérifie l\'espace disponible.'}
        </span>
      </div>
      <div className="save-error-actions">
        <button className="btn-secondary" onClick={() => openSettings('settings')}>
          Ouvrir réglages
        </button>
        <button className="save-error-close" onClick={() => clear(null)} aria-label="Fermer">×</button>
      </div>
    </div>
  );
}
