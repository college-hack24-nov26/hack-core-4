import type { Pollutant, RiskLevel } from '../types';

export type RGB = [number, number, number];

const RAMP: Array<[number, RGB]> = [
  [0, [34, 197, 94]],
  [0.25, [163, 230, 53]],
  [0.45, [250, 204, 21]],
  [0.65, [249, 115, 22]],
  [0.85, [239, 68, 68]],
  [1, [168, 35, 110]],
];

export const POLLUTANT_RANGE: Record<Pollutant, [number, number]> = {
  pm25: [15, 120],
  pm10: [30, 200],
  no2: [10, 90],
  so2: [2, 40],
  co: [0.3, 2.5],
  o3: [20, 90],
};

export const POLLUTANT_LABEL: Record<Pollutant, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO2',
  so2: 'SO2',
  co: 'CO',
  o3: 'O3',
};

export const POLLUTANT_UNIT: Record<Pollutant, string> = {
  pm25: 'ug/m3',
  pm10: 'ug/m3',
  no2: 'ug/m3',
  so2: 'ug/m3',
  co: 'mg/m3',
  o3: 'ug/m3',
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function rampAt(t: number): RGB {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const k = (x - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export function normalizePollutant(p: Pollutant, v: number): number {
  const [lo, hi] = POLLUTANT_RANGE[p];
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

export function pollutionColor(p: Pollutant, v: number): RGB {
  return rampAt(normalizePollutant(p, v));
}

export function rgbCss(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

const DEC: RGB = [56, 189, 248];
const ZERO: RGB = [30, 41, 59];
const INC: RGB = [244, 63, 94];

/** Diverging colour: blue = modeled decrease, slate = zero, rose = increase. */
export function deltaColor(d: number, scale: number): RGB {
  const s = scale <= 0 ? 1 : scale;
  const t = Math.min(1, Math.abs(d) / s);
  const end = d < 0 ? DEC : INC;
  return [lerp(ZERO[0], end[0], t), lerp(ZERO[1], end[1], t), lerp(ZERO[2], end[2], t)];
}

export function riskFromPm25(v: number): RiskLevel {
  if (v <= 30) return 'LOW';
  if (v <= 60) return 'MODERATE';
  if (v <= 90) return 'HIGH';
  return 'VERY_HIGH';
}

export const RISK_COLOR: Record<RiskLevel, string> = {
  LOW: '#22c55e',
  MODERATE: '#facc15',
  HIGH: '#f97316',
  VERY_HIGH: '#ef4444',
};

export const RISK_LABEL: Record<RiskLevel, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  VERY_HIGH: 'Very high',
};

export const SOURCE_COLORS = {
  traffic: '#a3263f',
  industry: '#d19a2a',
  background: '#a8948c',
  other: '#2fae8b',
} as const;

export const SOURCE_LABELS = {
  traffic: 'Traffic',
  industry: 'Industry',
  background: 'Regional background',
  other: 'Other (dust / residential)',
} as const;

/** CSS linear-gradient string for the legend of a pollutant. */
export function legendGradient(): string {
  const stops = RAMP.map(([t, c]) => `rgb(${c[0]},${c[1]},${c[2]}) ${Math.round(t * 100)}%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// ---- V2 additions ----

/** Traffic corridor colours by volume proxy (0-100). */
export const TRAFFIC_COLORS = {
  low: '#22c55e',
  medium: '#facc15',
  high: '#f97316',
  severe: '#ef4444',
} as const;

export function trafficColorKey(volume: number): keyof typeof TRAFFIC_COLORS {
  if (volume >= 85) return 'severe';
  if (volume >= 70) return 'high';
  if (volume >= 55) return 'medium';
  return 'low';
}

/** Symmetric scale for the Change (delta) display mode: the largest |delta| rounded up to a tidy number. */
export function deltaScaleFor(p: Pollutant, values: number[]): number {
  let max = 0;
  for (const v of values) max = Math.max(max, Math.abs(v));
  const [lo, hi] = POLLUTANT_RANGE[p];
  const floor = (hi - lo) * 0.02;
  const m = Math.max(max, floor);
  const mag = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}
