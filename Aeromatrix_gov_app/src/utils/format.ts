export function fmt(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '-';
  return v.toFixed(digits);
}

export function fmtInt(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return Math.round(v).toLocaleString('en-IN');
}

export function fmtSigned(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '-';
  const s = v.toFixed(digits);
  return v > 0 ? `+${s}` : s;
}

let uidCounter = 0;
/** Unique id for UI/session objects (not used by the engine). */
export function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}_${uidCounter.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
