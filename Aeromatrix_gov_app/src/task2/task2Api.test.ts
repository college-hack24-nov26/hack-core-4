import { afterEach, describe, expect, it, vi } from 'vitest';
import A from '../services/__fixtures__/task2/A_normal.json';
import B from '../services/__fixtures__/task2/B_missing_readings.json';
import C from '../services/__fixtures__/task2/C_unseen_station.json';
import D from '../services/__fixtures__/task2/D_severe_loss.json';
import manifest from '../services/__fixtures__/task2/demo_manifest.json';
import contract from '../services/__fixtures__/task2/task2_API_CONTRACT.json';
import {
  T2Error,
  T2_LABEL,
  T2_LOSS_LEVELS,
  T2_ROUTES,
  T2_SEEDS,
  T2_UNIT,
  donorsOf,
  estimatePmAqi,
  getT2Cases,
  getT2Health,
  getT2Stations,
  isT2Available,
  isT2Replay,
  isT2Unavailable,
  istCutoff,
  istParts,
  postT2Replay,
  shiftHours,
  shortName,
  withMissingDonors,
  type T2Replay,
} from './task2Api';

const cases = { A, B, C, D } as unknown as Record<string, T2Replay>;
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
afterEach(() => vi.unstubAllGlobals());

describe('the four contract example cases (input -> prediction)', () => {
  it('are historical replays with an input and a verified prediction', () => {
    for (const [name, c] of Object.entries(cases)) {
      expect(isT2Replay(c), name).toBe(true);
      expect(c.mode).toBe('HISTORICAL_REPLAY');
      expect(c.input.observations.length).toBeGreaterThan(0);
      for (const o of c.input.observations) {
        expect(o.category).toBe('MEASURED');
        expect(o.units).toBe('ug/m3');
        expect(['pm25', 'pm10']).toContain(o.pollutant);
        expect(o.value).toBeGreaterThanOrEqual(0);
      }
      expect(c.input.observations.length).toBeLessThanOrEqual(100);
    }
  });

  it('A normal: an ML forecast with interval, baselines and reliability, never a causal claim', () => {
    const p = A.prediction as unknown;
    expect(isT2Available(p)).toBe(true);
    if (!isT2Available(p)) return;
    expect(p.category).toBe('FORECAST_ML');
    expect(p.horizon_hours).toBe(1);
    expect(p.interval).toHaveLength(2);
    expect(p.interval[0]).toBeLessThanOrEqual(p.value);
    expect(p.interval[1]).toBeGreaterThanOrEqual(p.value);
    expect(p.model).toBe('pm25_network');
    expect(p.version).toMatch(/^task2-/);
    expect(p.baselines).toEqual({ idw: expect.any(Number), persistence: expect.any(Number) });
    expect(p.reliability).toMatchObject({ status: 'LOW', donor_count: 2, weather_available: true, nominal_interval_coverage: 0.9 });
    expect(p.reliability.coverage_warning).toMatch(/not a guaranteed confidence probability/);
    expect(p.causal_effects_estimated).toBe(false);
    expect(new Date(p.target_time).getTime() - new Date(p.cutoff).getTime()).toBe(3600000);
    expect((A as unknown as T2Replay).absolute_error).toBeCloseTo(Math.abs(p.value - (A as unknown as T2Replay).independent_reference.value!), 8);
  });

  it('B missing readings: still a forecast, with fewer donors and an out-of-bounds warning', () => {
    const p = B.prediction as unknown;
    expect(isT2Available(p)).toBe(true);
    if (!isT2Available(p)) return;
    expect(B.configuration.loss_level).toBe(0.5);
    expect(p.reliability.out_of_training_bounds).toContain('nearest_km');
  });

  it('C unseen station: the matching excluded-station artifact, never the network model', () => {
    const p = C.prediction as unknown;
    expect(isT2Available(p)).toBe(true);
    if (!isT2Available(p)) return;
    expect(C.input.excluded_station).toBe(C.input.station);
    expect(C.configuration.fold).toBe(C.input.station);
    expect(p.model).toBe(`pm25_${C.input.station}`);
    expect(p.model).not.toBe('pm25_network');
    expect(p.baselines.persistence).toBeNull(); // an unseen station has no own history
  });

  it('D severe loss: UNAVAILABLE with the reason, and no invented value', () => {
    const p = D.prediction as unknown;
    expect(isT2Unavailable(p)).toBe(true);
    if (!isT2Unavailable(p)) return;
    expect(p.value).toBeNull();
    expect(p.reason).toMatch(/two distinct valid measured donor/);
    expect((D as unknown as T2Replay).absolute_error).toBeNull();
    expect((D as unknown as T2Replay).independent_reference.value).toBe(12.98); // the held-out truth is shown, but never passed to the model
  });

  it('matches the demo manifest', () => {
    const rows = manifest as unknown as Array<{ name: string; status: string; actual: number | null; prediction: number | null; absolute_error: number | null }>;
    expect(rows.map((r) => r.name)).toEqual(['A_normal', 'B_missing_readings', 'C_unseen_station', 'D_severe_loss']);
    for (const r of rows) {
      const c = Object.values(cases).find((x) => x.scenario === r.name)!;
      expect(c.prediction.status).toBe(r.status);
      expect(c.independent_reference.value).toBe(r.actual);
      expect(isT2Available(c.prediction) ? c.prediction.value : null).toBe(r.prediction);
    }
  });
});

describe('contract and routes', () => {
  it('knows the contract paths, and /task2/predict is not a browser route', () => {
    const paths = Object.keys((contract as { paths: Record<string, unknown> }).paths);
    expect(paths).toContain('/task2/predict');
    expect(paths).toContain('/task2/health');
    expect(T2_ROUTES).toEqual(['health', 'stations', 'models', 'cases', 'replay', 'evaluation', 'demos', 'plan']);
    expect((T2_ROUTES as readonly string[]).includes('predict')).toBe(false);
  });

  it('exposes the documented constants', () => {
    expect(T2_LABEL).toEqual({ pm25: 'PM2.5', pm10: 'PM10' });
    expect(T2_UNIT).toBe('ug/m3');
    expect(T2_LOSS_LEVELS).toContain(0.5);
    expect(T2_LOSS_LEVELS).toContain(0.7);
    expect(T2_SEEDS).toContain(17);
  });
});

describe('IST helpers', () => {
  it('converts an IST date and hour to the UTC cutoff of the examples', () => {
    expect(istCutoff('2025-06-30', 17)).toBe('2025-06-30T11:30:00+00:00');
    expect(istCutoff('2025-07-06', 4)).toBe('2025-07-05T22:30:00+00:00');
    expect(istParts('2025-06-30T11:30:00+00:00')).toMatchObject({ date: '2025-06-30', hour: 17, minute: 0, label: '2025-06-30 17:00 IST' });
    expect(istParts(istCutoff('2025-03-01', 0)).date).toBe('2025-03-01');
    expect(shiftHours('2025-06-30T11:30:00+00:00', 1)).toBe('2025-06-30T12:30:00+00:00');
    expect(shiftHours('2025-06-30T11:30:00+00:00', -6)).toBe('2025-06-30T05:30:00+00:00');
    expect(shortName('site_5766')).toBe('5766');
    expect(shortName('Katraj Dairy')).toBe('Katraj Dairy');
  });
});

describe('donors', () => {
  it('lists donors with ages and states, and marks missing ones', () => {
    const d = donorsOf(A as unknown as T2Replay);
    expect(d.length).toBeGreaterThan(0);
    expect(d.every((x) => x.station !== A.input.station)).toBe(true);
    const fresh = d.find((x) => x.state === 'USED');
    expect(fresh?.ageHours).toBeLessThanOrEqual(2);
    const all = withMissingDonors(d, ['site_5409', 'site_9999', 'site_8888'], ['site_8888']);
    expect(all.find((x) => x.station === 'site_9999')).toMatchObject({ state: 'NO_READING', value: null });
    expect(all.find((x) => x.station === 'site_8888')?.state).toBe('OUTAGE_SIMULATED');
  });
});

describe('estimated PM-based AQI', () => {
  const full = (v: number) => Array.from({ length: 24 }, () => v);
  it('needs 16 valid hours per pollutant, otherwise AQI unavailable', () => {
    const ok = estimatePmAqi({ pm25: full(55), pm10: full(80) }, { pm25: 55, pm10: 80 });
    expect(ok.status).toBe('AVAILABLE');
    expect(ok.dominant).toBe('pm25'); // 55 ug/m3 PM2.5 is AQI ~91, PM10 80 is ~80
    expect(ok.label).toMatch(/never an official CPCB AQI/);
    const sparse = estimatePmAqi({ pm25: [...full(40).slice(0, 10), ...Array(14).fill(null)] }, { pm25: 40 });
    expect(sparse.status).toBe('UNAVAILABLE');
    expect(sparse.value).toBeNull();
    expect(sparse.reason).toMatch(/of the 16 valid hours needed/);
    expect(estimatePmAqi({}, {}).status).toBe('UNAVAILABLE');
  });
});

describe('client', () => {
  it('posts a replay and returns the recorded response', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => res(A));
    vi.stubGlobal('fetch', f);
    const r = await postT2Replay({ station: 'site_5766', pollutant: 'pm25', cutoff: A.input.cutoff, loss_level: 0, pattern: 'random', seed: 17 });
    expect(isT2Replay(r)).toBe(true);
    expect(String(f.mock.calls[0][0])).toBe('/task2/replay');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toMatchObject({ station: 'site_5766', loss_level: 0, seed: 17 });
  });

  it('reads stations and the replayable period defensively', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({ stations: [{ station: 'site_5766', name: 'Katraj Dairy' }, 'site_5407'] })));
    expect((await getT2Stations()).stations).toEqual([{ id: 'site_5766', name: 'Katraj Dairy' }, { id: 'site_5407', name: 'site_5407' }]);
    vi.stubGlobal('fetch', vi.fn(async () => res({})));
    expect(await getT2Cases()).toEqual({ from: '2025-02-01', to: '2025-09-30' });
    vi.stubGlobal('fetch', vi.fn(async () => res({ start: '2025-03-01T00:00', end: '2025-08-31' })));
    expect(await getT2Cases()).toEqual({ from: '2025-03-01', to: '2025-08-31' });
  });

  it('says the service is not running when it is absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(getT2Health()).rejects.toMatchObject({ kind: 'offline' });
    vi.stubGlobal('fetch', vi.fn(async () => res({}, 502)));
    await expect(getT2Health()).rejects.toThrow(/not running on port 8030/);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('<html>'); } }) as unknown as Response));
    const e = await getT2Health().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(T2Error);
    expect((e as T2Error).kind).toBe('offline');
    vi.stubGlobal('fetch', vi.fn(async () => res({}, 500)));
    await expect(getT2Health()).rejects.toMatchObject({ kind: 'offline', statusCode: 500 });
    vi.stubGlobal('fetch', vi.fn(async () => res({}, 422)));
    await expect(getT2Health()).rejects.toMatchObject({ kind: 'http', statusCode: 422 });
  });
});
