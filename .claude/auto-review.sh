#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Stop hook : auto-review du travail récent.
#
# À chaque fois que Claude termine sa réponse, on lui demande de
# relire son travail et d'appliquer des améliorations (bug fixes,
# polish UI, équilibrage, simplification).
#
# Limite à $MAX_PASSES passes consécutives pour éviter une boucle
# infinie où Claude continue de modifier des choses qui re-déclenchent
# le hook. Le compteur est reset par UserPromptSubmit (cf. settings.json).
# ─────────────────────────────────────────────────────────────────

set -e

COUNTER_FILE="/tmp/claude-iron-co-auto-review-count"
MAX_PASSES=2

# Lit le compteur courant (0 si le fichier n'existe pas encore)
count=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)

# Si on a déjà fait MAX_PASSES revues, on libère Claude et on reset.
if [ "$count" -ge "$MAX_PASSES" ]; then
  rm -f "$COUNTER_FILE"
  echo '{}'
  exit 0
fi

# Sinon : on incrémente et on demande une revue.
new_count=$((count + 1))
echo "$new_count" > "$COUNTER_FILE"

cat <<JSON
{
  "decision": "block",
  "reason": "🔁 AUTO-REVIEW (passe ${new_count}/${MAX_PASSES}) — Avant de t'arrêter, relis tes modifications récentes à index.html. Cherche : (1) bugs subtils dans la logique JS (math iso, gestion d'état, boucles, edge cases d'inputs) ; (2) polish UI (contrastes, hover states, feedback visuel, responsive) ; (3) équilibrage tycoon (coûts vs revenus, courbe de progression, sentiment de progression) ; (4) simplification (code redondant, fonctions trop longues, magic numbers). Applique uniquement les améliorations qui en valent vraiment la peine — pas de refactor gratuit. Si tu modifies, commit + push à la fin. RÈGLE INVIOLABLE : tout reste dans le seul fichier index.html à la racine du repo — n'ajoute AUCUN autre fichier de jeu (.js, .css, autres .html), AUCUNE autre page, AUCUN dossier src/ ou assets/. Si rien ne mérite d'être changé après ta revue, dis-le en une phrase et arrête-toi."
}
JSON
