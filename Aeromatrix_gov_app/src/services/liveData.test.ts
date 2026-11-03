import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import airFixture from './__fixtures__/openmeteo-air-quality.json';
import wxFixture from './__fixtures__/openmeteo-weather.json';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { clearOpenMeteoCache } from './openMeteo';
import {
  LIVE_REFRESH_MINUTES,
  MODEL_POINT_STEP,
  buildTargets,
  currentFieldValues,
  fetchLocalityPoint,
  isLiveFresh,
  liveValue,
  localityPointId,
  loadLive,
  nextRefreshAt,
  placePointId,
  snapCoord,
  snapPoint,
  zonePointId,
} from './liveData';

const air = airFixture as unknown as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const wx = wxFixture as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const NOW = air[0].current.time * 1000;
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
let base: BaseState;

beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});
beforeEach(() => clearOpenMeteoCache());
afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const f = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.hostname.startsWith('air-quality')) {
      const n = u.searchParams.get('latitude')!.split(',').length;
      return res(n === 1 ? air[0] : Array.from({ length: n }, () => air[0]));
    }
    return res(wx);
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('lattice snapping', () => {
  it('snaps to 0.1 degrees', () => {
    expect(MODEL_POINT_STEP).toBe(0.1);
    expect(snapCoord(73.8537)).toBe(73.9);
    expect(snapCoord(18.5249)).toBe(18.5);
    expect(snapPoint([73.84, 18.56])).toEqual([73.8, 18.6]);
  });

  it('builds readable point ids', () => {
    expect(zonePointId('g10-r1c2')).toBe('zone:g10-r1c2');
    expect(placePointId('site_5407')).toBe('place:site_5407');
    expect(localityPointId('Kothrud')).toBe('locality:Kothrud');
  });

  it('refreshes at least every 5 minutes at most', () => {
    expect(LIVE_REFRESH_MINUTES).toBeGreaterThanOrEqual(5);
    expect(nextRefreshAt(null)).toBe(0);
    expect(nextRefreshAt(1000)).toBe(1000 + LIVE_REFRESH_MINUTES * 60000);
  });
});

describe('loadLive', () => {
  it('requests far fewer distinct points than there are targets, and maps each target to a result', async () => {
    const f = stubFetch();
    const targets = buildTargets(base, [{ id: placePointId('s1'), lon: 73.9275, lat: 18.5018 }]);
    expect(targets).toHaveLength(base.cells.length + 1);
    const snap = await loadLive(targets, base.city.center, { now: () => NOW, retryDelayMs: 1 });
    expect(snap.requestedPoints).toBeLessThan(25);
    expect(Object.keys(snap.points)).toHaveLength(targets.length);
    expect(snap.errors).toEqual([]);
    expect(snap.weather?.temperature).toBe(27);
    const aqCalls = f.mock.calls.filter((c) => String(c[0]).includes('air-quality'));
    expect(aqCalls).toHaveLength(1);
    // The target keeps its own coordinate, while the model grid point is what Open-Meteo used.
    const p = snap.points[zonePointId(base.cells[0].id)];
    expect(p.requested).toEqual(base.cells[0].center);
    expect(p.targetId).toBe(zonePointId(base.cells[0].id));
    expect(p.grid).toBeDefined();
  });

  it('reports errors instead of numbers when the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const snap = await loadLive(buildTargets(base), base.city.center, { now: () => NOW, retryDelayMs: 1 });
    expect(Object.keys(snap.points)).toHaveLength(0);
    expect(snap.weather).toBeNull();
    expect(snap.errors.length).toBe(2);
    expect(snap.errors[0]).toMatch(/Air quality/);
  });

  it('fetches a locality on demand', async () => {
    stubFetch();
    const p = await fetchLocalityPoint('Kothrud', 73.808, 18.507, { now: () => NOW });
    expect(p.targetId).toBe('locality:Kothrud');
    expect(p.requested).toEqual([73.808, 18.507]);
  });
});

describe('reading live values', () => {
  it('gives the current-hour value, or null when missing', async () => {
    stubFetch();
    const snap = await loadLive(buildTargets(base), base.city.center, { now: () => NOW });
    const pt = snap.points[zonePointId(base.cells[0].id)];
    expect(liveValue(pt, 'pm25', NOW)).toBe(air[0].current.pm2_5);
    expect(liveValue(undefined, 'pm25', NOW)).toBeNull();
    expect(liveValue(pt, 'pm25', 0)).toBeNull(); // before the data starts
  });

  it('builds a whole-grid current field only when every zone has a value', async () => {
    stubFetch();
    const snap = await loadLive(buildTargets(base), base.city.center, { now: () => NOW });
    const field = currentFieldValues(base, snap.points, 'pm25', NOW);
    expect(field).toHaveLength(base.cells.length);
    const partial = { ...snap.points };
    delete partial[zonePointId(base.cells[3].id)];
    expect(currentFieldValues(base, partial, 'pm25', NOW)).toBeNull();
  });

  it('never presents stale data as current', () => {
    const fresh = { lastUpdated: 1_000_000, status: 'ready' as const };
    expect(isLiveFresh(fresh, 1_000_000 + 60_000)).toBe(true);
    expect(isLiveFresh(fresh, 1_000_000 + 3 * LIVE_REFRESH_MINUTES * 60_000)).toBe(false);
    expect(isLiveFresh({ lastUpdated: 1_000_000, status: 'offline' }, 1_000_001)).toBe(false);
    expect(isLiveFresh({ lastUpdated: null, status: 'idle' })).toBe(false);
  });
});
