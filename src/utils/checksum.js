// Checksum SHA-256 sur le save — Prompt 10 (anti-cheat basique).
//
// Ce n'est pas un vrai HMAC (pas de clé secrète stockable côté client de
// manière sûre) — c'est un checksum d'intégrité qui décourage l'édition
// directe du localStorage. Quelqu'un de motivé saura recalculer le hash,
// mais pour 95% des cas de tampering naïf c'est suffisant.

export async function computeChecksum(text) {
  if (!window.crypto?.subtle) return null;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyChecksum(text, expected) {
  const actual = await computeChecksum(text);
  return actual === expected;
}
