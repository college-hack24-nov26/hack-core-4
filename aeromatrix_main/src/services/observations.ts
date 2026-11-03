/**
 * Observed station data (imported CSV), the IDW observed field, model-vs-observed validation and the PM2.5
 * calibration of the rule model. Everything here is browser-side and OBSERVED only when it came from a file the
 * user imported. A calibration adjusts the PROTOTYPE rule model to the imported readings; it is not a validated
 * forecast.
 */
import type { BaseState, CellState, LonLat, Pollutant } from '../types';
import { haversineKm } from '../utils/geo';
import { cellAtLonLat } from '../utils/grid';
import { POLLUTANTS } from './pollutionModel';

export interface ObsStation {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
}

export interface ObsReading {
  stationId: string;
  /** hour start, ms */
  time: number;
  values: Partial<Record<Pollutant, number>>;
}

export interface ObservationDataset {
  stations: ObsStation[];
  readings: ObsReading[];
  /** file names the data came from */
  sources: string[];
  warnings: string[];
}

export type ObsWindow = { kind: 'last24h' } | { kind: 'period'; from: number; to: number };

export interface StationSummary {
  stationId: string;
  name: string;
  lat: number | null;
  lon: number | null;
  means: Partial<Record<Pollutant, number>>;
  counts: Partial<Record<Pollutant, number>>;
  latest: number | null;
}

export interface ObservedField {
  pollutant: Pollutant;
  /** one value per grid cell, in base.cells order */
  values: number[];
  /** distance in km from each cell centre to its nearest station */
  nearestKm: number[];
  stationCount: number;
  status: 'OBSERVED' | 'MODEL_PREDICTION';
  label: string;
}

export function emptyDataset(): ObservationDataset {
  return { stations: [], readings: [], sources: [], warnings: [] };
}

export function datasetRange(ds: ObservationDataset): { from: number; to: number } | null {
  if (ds.readings.length === 0) return null;
  let from = Infinity;
  let to = -Infinity;
  for (const r of ds.readings) {
    if (r.time < from) from = r.time;
    if (r.time > to) to = r.time;
  }
  return { from, to };
}

/** Resolve a window to [from, to] ms. "last24h" ends at the newest reading in the data, not at the wall clock. */
export function resolveWindow(ds: ObservationDataset, w: ObsWindow): { from: number; to: number } | null {
  const range = datasetRange(ds);
  if (!range) return null;
  if (w.kind === 'period') return { from: w.from, to: w.to };
  return { from: range.to - 24 * 3600 * 1000 + 1, to: range.to };
}

export function summariseStations(ds: ObservationDataset, w: ObsWindow): StationSummary[] {
  const win = resolveWindow(ds, w);
  if (!win) return [];
  const sums = new Map<string, { sum: Partial<Record<Pollutant, number>>; n: Partial<Record<Pollutant, number>>; latest: number | null }>();
  for (const r of ds.readings) {
    if (r.time < win.from || r.time > win.to) continue;
    const s = sums.get(r.stationId) ?? { sum: {}, n: {}, latest: null };
    for (const p of POLLUTANTS) {
      const v = r.values[p];
      if (typeof v === 'number' && Number.isFinite(v)) {
        s.sum[p] = (s.sum[p] ?? 0) + v;
        s.n[p] = (s.n[p] ?? 0) + 1;
      }
    }
    s.latest = s.latest === null ? r.time : Math.max(s.latest, r.time);
    sums.set(r.stationId, s);
  }
  return ds.stations
    .filter((st) => sums.has(st.id))
    .map((st) => {
      const s = sums.get(st.id)!;
      const means: StationSummary['means'] = {};
      for (const p of POLLUTANTS) if (s.n[p]) means[p] = (s.sum[p] as number) / (s.n[p] as number);
      return { stationId: st.id, name: st.name, lat: st.lat, lon: st.lon, means, counts: s.n, latest: s.latest };
    });
}

/** Station readings placed on the map: only stations with a coordinate and a mean for the pollutant. */
export function placedPoints(summaries: StationSummary[], p: Pollutant): Array<{ lon: number; lat: number; value: number; name: string }> {
  const out: Array<{ lon: number; lat: number; value: number; name: string }> = [];
  for (const s of summaries) {
    const v = s.means[p];
    if (s.lat !== null && s.lon !== null && v !== undefined) out.push({ lon: s.lon, lat: s.lat, value: v, name: s.name });
  }
  return out;
}

/** Inverse-distance-weighted field over the grid (power 2). A cell far from every station keeps its distance. */
export function idwField(
  base: BaseState,
  points: Array<{ lon: number; lat: number; value: number }>,
  pollutant: Pollutant,
  label: string,
  status: ObservedField['status'] = 'OBSERVED',
  power = 2,
): ObservedField | null {
  if (points.length === 0) return null;
  const values: number[] = [];
  const nearestKm: number[] = [];
  for (const c of base.cells) {
    let wSum = 0;
    let vSum = 0;
    let nearest = Infinity;
    let exact: number | null = null;
    for (const pt of points) {
      const d = haversineKm(c.center, [pt.lon, pt.lat]);
      if (d < nearest) nearest = d;
      if (d < 0.05) exact = pt.value;
      const w = 1 / Math.max(d, 0.05) ** power;
      wSum += w;
      vSum += w * pt.value;
    }
    values.push(exact ?? vSum / wSum);
    nearestKm.push(nearest);
  }
  return { pollutant, values, nearestKm, stationCount: points.length, status, label };
}

export function observedSeries(ds: ObservationDataset, stationId: string, p: Pollutant, w?: ObsWindow): Array<{ time: number; value: number }> {
  const win = w ? resolveWindow(ds, w) : null;
  return ds.readings
    .filter((r) => r.stationId === stationId && typeof r.values[p] === 'number' && (!win || (r.time >= win.from && r.time <= win.to)))
    .map((r) => ({ time: r.time, value: r.values[p] as number }))
    .sort((a, b) => a.time - b.time);
}

export interface ValidationRow {
  stationId: string;
  name: string;
  observed: number;
  modeled: number;
  error: number;
  cellId: string;
}

export interface ValidationStats {
  n: number;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  /** Pearson correlation; null with fewer than 3 stations or no spread */
  r: number | null;
}

export interface Validation {
  pollutant: Pollutant;
  rows: ValidationRow[];
  stats: ValidationStats;
}

export function computeStats(pairs: Array<{ observed: number; modeled: number }>): ValidationStats {
  const n = pairs.length;
  if (n === 0) return { n, mae: null, rmse: null, bias: null, r: null };
  const err = pairs.map((p) => p.modeled - p.observed);
  const mae = err.reduce((a, e) => a + Math.abs(e), 0) / n;
  const rmse = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / n);
  const bias = err.reduce((a, e) => a + e, 0) / n;
  let r: number | null = null;
  if (n >= 3) {
    const mo = pairs.reduce((a, p) => a + p.observed, 0) / n;
    const mm = pairs.reduce((a, p) => a + p.modeled, 0) / n;
    let num = 0;
    let dO = 0;
    let dM = 0;
    for (const p of pairs) {
      num += (p.observed - mo) * (p.modeled - mm);
      dO += (p.observed - mo) ** 2;
      dM += (p.modeled - mm) ** 2;
    }
    r = dO > 0 && dM > 0 ? num / Math.sqrt(dO * dM) : null;
  }
  return { n, mae, rmse, bias, r };
}

/** Compare the rule model with observed means in the grid cell that contains each station. */
export function validateModel(base: BaseState, states: CellState[], summaries: StationSummary[], pollutant: Pollutant = 'pm25'): Validation {
  const byId = new Map(states.map((s) => [s.cellId, s]));
  const rows: ValidationRow[] = [];
  for (const s of summaries) {
    const obs = s.means[pollutant];
    if (obs === undefined || s.lat === null || s.lon === null) continue;
    const cell = cellAtLonLat(base, s.lon, s.lat);
    const st = cell ? byId.get(cell.id) : undefined;
    if (!cell || !st) continue;
    rows.push({ stationId: s.stationId, name: s.name, observed: obs, modeled: st[pollutant], error: st[pollutant] - obs, cellId: cell.id });
  }
  return { pollutant, rows, stats: computeStats(rows) };
}

export interface ModelCalibration {
  backgroundScale: number;
  localScale: number;
  stations: number;
  rmseBefore: number;
  rmseAfter: number;
  window: string;
  fittedAt: string;
}

export type FitResult = { ok: true; calibration: ModelCalibration } | { ok: false; reason: string };

const SCALE_MIN = 0.1;
const SCALE_MAX = 4;

/**
 * Least-squares PM2.5 = alpha * background + beta * local sources over the station means (local = traffic +
 * industry + other contributions of the UNCALIBRATED model in each station's cell).
 */
export function fitCalibration(
  base: BaseState,
  uncalibrated: CellState[],
  summaries: StationSummary[],
  windowLabel: string,
  fittedAt: string = new Date().toISOString(),
): FitResult {
  const byId = new Map(uncalibrated.map((s) => [s.cellId, s]));
  const rows: Array<{ b: number; l: number; obs: number }> = [];
  for (const s of summaries) {
    const obs = s.means.pm25;
    if (obs === undefined || s.lat === null || s.lon === null) continue;
    const cell = cellAtLonLat(base, s.lon, s.lat);
    const st = cell ? byId.get(cell.id) : undefined;
    if (!st) continue;
    rows.push({ b: st.contributionAbs.background, l: st.contributionAbs.traffic + st.contributionAbs.industry + st.contributionAbs.other, obs });
  }
  if (rows.length < 2) {
    return { ok: false, reason: `At least two stations with PM2.5 and a coordinate inside the analysis area are needed to fit (found ${rows.length}).` };
  }
  let sbb = 0;
  let sbl = 0;
  let sll = 0;
  let sbo = 0;
  let slo = 0;
  for (const r of rows) {
    sbb += r.b * r.b;
    sbl += r.b * r.l;
    sll += r.l * r.l;
    sbo += r.b * r.obs;
    slo += r.l * r.obs;
  }
  const det = sbb * sll - sbl * sbl;
  if (!(Math.abs(det) > 1e-9 * (sbb * sll + 1))) {
    return { ok: false, reason: 'The stations do not differ enough in local sources to separate background from local contributions.' };
  }
  const clamp = (v: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
  const alpha = clamp((sbo * sll - slo * sbl) / det);
  const beta = clamp((slo * sbb - sbo * sbl) / det);
  const rmse = (a: number, bb: number) => Math.sqrt(rows.reduce((s, r) => s + (a * r.b + bb * r.l - r.obs) ** 2, 0) / rows.length);
  return {
    ok: true,
    calibration: {
      backgroundScale: alpha,
      localScale: beta,
      stations: rows.length,
      rmseBefore: rmse(1, 1),
      rmseAfter: rmse(alpha, beta),
      window: windowLabel,
      fittedAt,
    },
  };
}

export type { LonLat };
