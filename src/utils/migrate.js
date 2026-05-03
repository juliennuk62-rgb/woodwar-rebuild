// Migration des saves entre versions — Prompt 10.
// Les migrations sont enchaînées : v1 → v2 → v3 ...
// Chaque migration prend le state du save et retourne le state mis à jour.
//
// Exemple d'utilisation : si un jour on bumpe GAME_CONFIG.version à 2 et
// qu'on ajoute un champ `tutorial.skipped`, on définit migrations[1] pour
// la transition v1 → v2.

const migrations = {
  // 1: (state) => ({ ...state, tutorial: { skipped: false }, version: 2 }),
};

export function migrateSave(rawState, currentVersion) {
  let state = rawState;
  let v = state.version ?? 1;

  while (v < currentVersion) {
    const fn = migrations[v];
    if (!fn) {
      // Pas de migration définie pour cette transition — on abandonne
      // proprement plutôt que de corrompre la save
      return null;
    }
    state = fn(state);
    v = state.version ?? v + 1;
  }
  return state;
}
