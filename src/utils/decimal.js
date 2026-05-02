// Wrapper minimal autour de break_infinity.js.
// Pour Prompt 1 on reste sur des nombres natifs JS, mais on isole l'API
// pour pouvoir basculer en Decimal partout sans toucher au reste du code.
import Decimal from 'break_infinity.js';

export function D(value) {
  return new Decimal(value);
}

export function toNumber(d) {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  if (typeof d === 'string') return Number(d);
  if (d.toNumber) return d.toNumber();
  return Number(d);
}

export function fromSave(value) {
  if (value == null) return new Decimal(0);
  if (value instanceof Decimal) return value;
  return new Decimal(value);
}

export function toSave(d) {
  if (d == null) return '0';
  if (typeof d === 'number') return String(d);
  if (d.toString) return d.toString();
  return String(d);
}

export { Decimal };
