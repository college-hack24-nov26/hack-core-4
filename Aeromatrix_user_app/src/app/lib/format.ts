/** Small formatting helpers shared by the Commissioner screens. All times are shown in Indian Standard Time. */
const IST = 'Asia/Kolkata';

export function formatIst(ms: number | null | undefined, withTime = true): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'no date';
  const d = new Date(ms);
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${date}, ${time} IST`;
}

/** YYYY-MM-DD of a moment in IST. */
export function istDate(ms: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  return p;
}

/** The IST date `days` after a moment. */
export function addDaysIst(ms: number, days: number): string {
  return istDate(ms + days * 86_400_000);
}

export function formatAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'unknown age';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} months ago`;
}

const POLLUTANT_LABEL: Record<string, string> = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO2', so2: 'SO2', co: 'CO', o3: 'O3' };
export const pollutantLabel = (k: string | null | undefined): string => (k ? (POLLUTANT_LABEL[k.toLowerCase()] ?? k.toUpperCase()) : 'n/a');

export const round =(v: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export const signed = (v: number, digits = 1): string => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;

export function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
