import { afterEach, describe, expect, it, vi } from 'vitest';
import examples from './__fixtures__/trained_model_RESPONSE_EXAMPLES.json';
import type { ApiForecast, ApiMeasured } from './aeromatrixApi';
import { connectModelService, fetchAqiHistory, initialModelService, refetchForecasts } from './modelService';
import { parseDeepLink } from '../deepLink';

const ex = examples as unknown as Record<string, ApiForecast | ApiMeasured>;
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
afterEach(() => vi.unstubAllGlobals());

const stations = [(ex.Hadapsar as ApiForecast).region, (ex.Alandi as ApiForecast).region];

function stubService(over: Record<string, () => Response> = {}) {
  const f = vi.fn(async (url: string) => {
    const u = new URL(url);
    if (over[u.pathname]) return over[u.pathname]();
    switch (u.pathname) {
      case '/health':
        return res({ status: 'ok' });
      case '/regions':
        return res({ station_locations: stations, wards: [] });
      case '/pollution':
        return res(ex.measured_Hadapsar);
      case '/forecast':
        return res(u.searchParams.get('region') === 'Alandi' ? ex.Alandi : ex.Hadapsar);
      case '/aqi/history':
        return res({ status: 'AVAILABLE' });
      default:
        return res({}, 404);
    }
  });
  vi.stubGlobal('fetch', f);
  return f;
}

describe('connectModelService', () => {
  it('goes online, loading regions, one snapshot and one forecast per station', async () => {
    const f = stubService();
    const s = await connectModelService(false, () => 1234);
    expect(s.status).toBe('online');
    expect(s.health).toEqual({ status: 'ok' });
    expect(s.stations).toHaveLength(2);
    expect(Object.keys(s.measured)).toHaveLength(2);
    expect(Object.keys(s.forecasts)).toHaveLength(2);
    expect(s.errors).toEqual([]);
    expect(s.connectedAt).toBe(1234);
    const forecastCalls = f.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/forecast'));
    expect(forecastCalls.every((u) => u.includes('allow_historical=false'))).toBe(true);
  });

  it('degrades to offline with the reason when the service is not there', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('connection refused'); }));
    const s = await connectModelService();
    expect(s.status).toBe('offline');
    expect(s.reason).toMatch(/not reachable/);
    expect(s.stations).toEqual([]);
    expect(s.measured).toEqual({});
  });

  it('stays online when some stations fail, and records each failure', async () => {
    stubService({ '/pollution': () => res({}, 500) });
    const s = await connectModelService();
    expect(s.status).toBe('online');
    expect(s.measured).toEqual({});
    expect(s.errors.length).toBe(2);
    expect(s.errors[0]).toMatch(/snapshot/);
    expect(Object.keys(s.forecasts)).toHaveLength(2);
  });

  it('keeps going when /regions fails', async () => {
    stubService({ '/regions': () => res({}, 500) });
    const s = await connectModelService();
    expect(s.status).toBe('online');
    expect(s.stations).toEqual([]);
    expect(s.errors[0]).toMatch(/regions/);
  });

  it('asks for historical forecasts only when told to', async () => {
    const f = stubService();
    const out = await refetchForecasts(stations, true);
    expect(Object.keys(out.forecasts)).toHaveLength(2);
    expect(f.mock.calls.every((c) => String(c[0]).includes('allow_historical=true'))).toBe(true);
  });

  it('reads AQI history or returns null', async () => {
    stubService();
    expect(await fetchAqiHistory('Kothrud')).toEqual({ status: 'AVAILABLE' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x'); }));
    expect(await fetchAqiHistory('Kothrud')).toBeNull();
    expect(initialModelService().status).toBe('idle');
  });
});

describe('deep links', () => {
  it('opens a section from the hash or the query', () => {
    expect(parseDeepLink('#/air', '')).toBe('air');
    expect(parseDeepLink('#simulator', '')).toBe('simulator');
    expect(parseDeepLink('', '?section=analytics')).toBe('analytics');
    expect(parseDeepLink('#/air', '?section=data')).toBe('data'); // the query wins
    expect(parseDeepLink('#/sites', '')).toBe('locations');
    expect(parseDeepLink('#what-if', '')).toBe('simulator');
    expect(parseDeepLink('#industry', '')).toBe('industries');
  });

  it('ignores anything else', () => {
    expect(parseDeepLink('', '')).toBeNull();
    expect(parseDeepLink('#nonsense', '?section=nope')).toBeNull();
  });
});
