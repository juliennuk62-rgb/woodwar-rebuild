// Format des grands nombres — court, lisible, idle-friendly.
// 1234 → "1 234"   12_345 → "12,3k"   1_234_567 → "1,23M"   etc.
import { toNumber } from './decimal.js';

const SUFFIXES = ['', 'k', 'M', 'Md', 'B', 'T', 'Qa', 'Qi'];

export function formatEuros(value, opts = {}) {
  const n = toNumber(value);
  if (!isFinite(n)) return '∞ €';
  return formatNumber(n, opts) + ' €';
}

export function formatNumber(value, { decimals = 2 } = {}) {
  const n = toNumber(value);
  if (n < 1000) return formatSmall(n);

  let mag = Math.floor(Math.log10(Math.abs(n)) / 3);
  if (mag >= SUFFIXES.length) mag = SUFFIXES.length - 1;
  const scaled = n / Math.pow(1000, mag);
  const fixed = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(decimals);
  return fixed.replace('.', ',') + SUFFIXES[mag];
}

function formatSmall(n) {
  if (Number.isInteger(n)) {
    return n.toLocaleString('fr-FR');
  }
  return n.toFixed(2).replace('.', ',');
}

// "2 min 30s" — pour les temps de pousse
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}min ${rs}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}min` : `${h}h`;
}
