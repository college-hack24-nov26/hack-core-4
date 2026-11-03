import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { computeCellStates } from './pollutionModel';
import { defaultParams } from './scenarioService';
import {
  computeStats,
  datasetRange,
  fitCalibration,
  idwField,
  observedSeries,
  placedPoints,
  resolveWindow,
  summariseStations,
  validateModel,
  type ObservationDataset,
} from './observations';

let base: BaseState;
const H = 3600 * 1000;
const T0 = Date.UTC(2025, 0, 10, 0, 0);

beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

function dataset(): ObservationDataset {
  const stations = [
    { id: 'a', name: 'Alpha', lat: 18.5, lon: 73.85 },
    { id: 'b', name: 'Beta', lat: 18.6, lon: 73.8 },
    { id: 'c', name: 'Gamma (no coordinate)', lat: null, lon: null },
  ];
  const readings = [];
  for (let h = 0; h < 48; h++) {
    readings.push({ stationId: 'a', time: T0 + h * H, values: { pm25: 100 + (h < 24 ? 0 : 20), pm10: 150 } });
    readings.push({ stationId: 'b', time: T0 + h * H, values: { pm25: 50 } });
    readings.push({ stationId: 'c', time: T0 + h * H, values: { pm25: 70 } });
  }
  return { stations, readings, sources: ['x.csv'], warnings: [] };
}

describe('windows and summaries', () => {
  it('finds the data range and resolves "last 24 h" against the newest reading', () => {
    const ds = dataset();
    expect(datasetRange(ds)).toEqual({ from: T0, to: T0 + 47 * H });
    const w = resolveWindow(ds, { kind: 'last24h' })!;
    expect(w.to).toBe(T0 + 47 * H);
    expect(w.to - w.from).toBe(24 * H - 1);
    expect(resolveWindow({ stations: [], readings: [], sources: [], warnings: [] }, { kind: 'last24h' })).toBeNull();
  });

  it('averages each station over the window', () => {
    const ds = dataset();
    const last = summariseStations(ds, { kind: 'last24h' });
    expect(last.find((s) => s.stationId === 'a')!.means.pm25).toBe(120);
    const whole = summariseStations(ds, { kind: 'period', from: T0, to: T0 + 47 * H });
    expect(whole.find((s) => s.stationId === 'a')!.means.pm25).toBe(110);
    expect(whole.find((s) => s.stationId === 'a')!.counts.pm25).toBe(48);
    expect(whole.find((s) => s.stationId === 'b')!.means.pm10).toBeUndefined();
  });

  it('only places stations that have a coordinate and a mean', () => {
    const pts = placedPoints(summariseStations(dataset(), { kind: 'last24h' }), 'pm25');
    expect(pts.map((p) => p.name).sort()).toEqual(['Alpha', 'Beta']);
    expect(placedPoints(summariseStations(dataset(), { kind: 'last24h' }), 'no2')).toEqual([]);
  });

  it('gives a station time series', () => {
    const s = observedSeries(dataset(), 'a', 'pm25');
    expect(s).toHaveLength(48);
    expect(s[0].time).toBeLessThan(s[47].time);
    expect(observedSeries(dataset(), 'a', 'pm25', { kind: 'last24h' })).toHaveLength(24);
  });
});

describe('IDW observed field', () => {
  it('returns null without points and keeps station values at the station', () => {
    expect(idwField(base, [], 'pm25', 'x')).toBeNull();
    const cell = base.cells[55];
    const f = idwField(base, [{ lon: cell.center[0], lat: cell.center[1], value: 80 }, { lon: 73.75, lat: 18.45, value: 20 }], 'pm25', 'obs')!;
    expect(f.values[55]).toBe(80);
    expect(f.nearestKm[55]).toBeLessThan(0.05);
    expect(f.values).toHaveLength(base.cells.length);
    expect(f.status).toBe('OBSERVED');
    expect(f.stationCount).toBe(2);
  });

  it('interpolates between stations and reports the distance to the nearest one', () => {
    const f = idwField(base, [{ lon: 73.75, lat: 18.63, value: 10 }, { lon: 73.97, lat: 18.45, value: 110 }], 'pm25', 'obs')!;
    for (const v of f.values) {
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(110);
    }
    const farCell = f.nearestKm.indexOf(Math.max(...f.nearestKm));
    expect(f.nearestKm[farCell]).toBeGreaterThan(5);
  });

  it('a field from forecasts is labelled MODEL_PREDICTION', () => {
    const f = idwField(base, [{ lon: 73.85, lat: 18.5, value: 50 }], 'pm25', 'fc', 'MODEL_PREDICTION')!;
    expect(f.status).toBe('MODEL_PREDICTION');
    expect(new Set(f.values.map((v) => Math.round(v))).size).toBe(1); // one station: constant field
  });
});

describe('validation statistics', () => {
  it('computes MAE, RMSE, bias and r', () => {
    const s = computeStats([
      { observed: 100, modeled: 110 },
      { observed: 80, modeled: 70 },
      { observed: 60, modeled: 80 },
    ]);
    expect(s.n).toBe(3);
    expect(s.mae).toBeCloseTo(40 / 3, 8);
    expect(s.rmse).toBeCloseTo(Math.sqrt((100 + 100 + 400) / 3), 8);
    expect(s.bias).toBeCloseTo(20 / 3, 8);
    expect(s.r).toBeGreaterThan(0.5);
    expect(computeStats([])).toEqual({ n: 0, mae: null, rmse: null, bias: null, r: null });
    expect(computeStats([{ observed: 1, modeled: 2 }, { observed: 2, modeled: 3 }]).r).toBeNull(); // needs 3
  });

  it('compares the model with observed means in each station cell', () => {
    const states = computeCellStates(base, defaultParams(base));
    const v = validateModel(base, states, summariseStations(dataset(), { kind: 'last24h' }), 'pm25');
    expect(v.rows.map((r) => r.name).sort()).toEqual(['Alpha', 'Beta']); // Gamma has no coordinate
    for (const r of v.rows) expect(r.error).toBeCloseTo(r.modeled - r.observed, 8);
    expect(v.stats.n).toBe(2);
  });
});

describe('calibration', () => {
  // Observations generated from the model itself with known scales, at stations in different cells.
  function synthetic(alpha: number, beta: number) {
    const states = computeCellStates({ ...base, calibration: undefined }, defaultParams(base));
    const picks = [12, 25, 38, 44, 57, 63, 71, 88];
    const summaries = picks.map((i) => {
      const c = base.cells[i];
      const s = states[i].contributionAbs;
      const local = s.traffic + s.industry + s.other;
      return { stationId: `s${i}`, name: `S${i}`, lat: c.center[1], lon: c.center[0], means: { pm25: alpha * s.background + beta * local }, counts: {}, latest: null };
    });
    return { states, summaries };
  }

  it('recovers the scales of a model-generated observed set and lowers RMSE', () => {
    const { states, summaries } = synthetic(1.2, 0.7);
    const fit = fitCalibration(base, states, summaries, 'test', '2026-01-01T00:00:00.000Z');
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.calibration.backgroundScale).toBeCloseTo(1.2, 3);
    expect(fit.calibration.localScale).toBeCloseTo(0.7, 3);
    expect(fit.calibration.stations).toBe(8);
    expect(fit.calibration.rmseAfter).toBeLessThan(fit.calibration.rmseBefore);
    expect(fit.calibration.rmseAfter).toBeCloseTo(0, 6);
    expect(fit.calibration.fittedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('applied to the base it changes the model output, and removing it restores the original', () => {
    const { states, summaries } = synthetic(1.2, 0.7);
    const fit = fitCalibration(base, states, summaries, 'test');
    if (!fit.ok) throw new Error('fit failed');
    const calibrated = { ...base, calibration: { localScale: fit.calibration.localScale, backgroundScale: fit.calibration.backgroundScale } };
    const after = computeCellStates(calibrated, defaultParams(base));
    expect(after[12].pm25).not.toBeCloseTo(states[12].pm25, 2);
    const reset = computeCellStates({ ...calibrated, calibration: undefined }, defaultParams(base));
    expect(reset).toEqual(states);
  });

  it('refuses to fit with fewer than two usable stations, with a reason', () => {
    const { states, summaries } = synthetic(1, 1);
    const one = fitCalibration(base, states, summaries.slice(0, 1), 'test');
    expect(one.ok).toBe(false);
    if (!one.ok) expect(one.reason).toMatch(/At least two stations/);
    const noCoord = fitCalibration(base, states, summaries.map((s) => ({ ...s, lat: null, lon: null })), 'test');
    expect(noCoord.ok).toBe(false);
  });

  it('keeps scales inside a sane range', () => {
    const { states, summaries } = synthetic(1, 1);
    const wild = summaries.map((s) => ({ ...s, means: { pm25: 5000 } }));
    const fit = fitCalibration(base, states, wild, 'test');
    if (fit.ok) {
      expect(fit.calibration.localScale).toBeLessThanOrEqual(4);
      expect(fit.calibration.backgroundScale).toBeLessThanOrEqual(4);
    }
  });
});
