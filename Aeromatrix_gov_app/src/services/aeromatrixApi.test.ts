import { afterEach, describe, expect, it, vi } from 'vitest';
import examples from './__fixtures__/trained_model_RESPONSE_EXAMPLES.json';
import contract from './__fixtures__/trained_model_API_CONTRACT.json';
import {
  API_BASE,
  API_POLLUTANT_KEYS,
  API_POLLUTANT_LABEL,
  ApiError,
  ENDPOINTS,
  describeWarning,
  getAqiHistory,
  getDistrictEmissions,
  getForecast,
  getHealth,
  getIndustry,
  getLocation,
  getModelMetrics,
  getBoundaries,
  getPollution,
  getRegions,
  isForecast,
  isMeasured,
  isMeasuredValue,
  isPredicted,
  isUnavailable,
  modelQuality,
  postForecast,
  type ApiForecast,
  type ApiMeasured,
  type ApiPrediction,
} from './aeromatrixApi';

const ex = examples as unknown as Record<string, ApiForecast | ApiMeasured>;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

afterEach(() => vi.unstubAllGlobals());

describe('contract coverage', () => {
  it('has a client function for every path in the API contract', () => {
    const paths = Object.keys((contract as { paths: Record<string, unknown> }).paths).sort();
    expect([...ENDPOINTS].sort()).toEqual(paths);
  });

  it('knows every pollutant that appears in the recorded responses', () => {
    const seen = new Set<string>();
    for (const e of Object.values(ex)) for (const k of Object.keys(e.pollutants)) seen.add(k);
    for (const k of seen) expect(API_POLLUTANT_KEYS).toContain(k);
    for (const k of API_POLLUTANT_KEYS) expect(API_POLLUTANT_LABEL[k]).toBeTruthy();
  });
});

describe('recorded responses', () => {
  it('a PARTIAL forecast mixes predictions and UNAVAILABLE entries with reasons', () => {
    const f = ex.Hadapsar as ApiForecast;
    expect(f.status).toBe('PARTIAL');
    expect(isForecast(f)).toBe(true);
    expect(f.region.latitude).toBeNull();
    expect(isPredicted(f.pollutants.pm25)).toBe(true);
    expect(isUnavailable(f.pollutants.so2)).toBe(true);
    expect((f.pollutants.so2 as { reason: string }).reason).toBe('Station not represented in this model');
    expect(isUnavailable(f.aqi)).toBe(true);
    expect(f.scenario_note).toMatch(/not validated/);
  });

  it('predictions are historical, carry an interval, metrics and a model kind', () => {
    const p = (ex.Hadapsar as ApiForecast).pollutants.pm25 as ApiPrediction;
    expect(p.historical).toBe(true);
    expect(p.lower).toBeLessThan(p.value);
    expect(p.upper).toBeGreaterThan(p.value);
    expect(p.horizon_hours).toBe(24);
    expect(p.model.kind).toBe('fitted_ml_model');
    expect(p.test_metrics.r2).toBeGreaterThan(0.5);
    expect(p.prediction_window.statistic).toBe('hourly_mean');
  });

  it('SO2 can be a statistical baseline rather than an ML model', () => {
    const so2 = (ex.Shivajinagar as ApiForecast).pollutants.so2 as ApiPrediction;
    expect(isPredicted(so2)).toBe(true);
    expect(so2.model.kind).toBe('statistical_baseline');
    expect(modelQuality(so2).label).toBe('Baseline only');
  });

  it('a MEASURED snapshot is historical, per-pollutant times can differ and units are explicit', () => {
    const m = ex.measured_Hadapsar as ApiMeasured;
    expect(isMeasured(m)).toBe(true);
    expect(m.historical).toBe(true);
    expect(m.aqi.status).toBe('AVAILABLE');
    const pm = m.pollutants.pm25;
    expect(isMeasuredValue(pm)).toBe(true);
    const times = new Set(Object.values(m.pollutants).map((v) => (isMeasuredValue(v) ? v.time : '')));
    expect(times.size).toBeGreaterThan(1);
    const co = m.pollutants.co;
    expect(isMeasuredValue(co) && co.unit).toBe('mg/m3');
    const nox = m.pollutants.nox;
    expect(isMeasuredValue(nox) && nox.unit).toBe('ppb');
    expect(m.notice).toMatch(/different timestamps/);
  });

  it('the POST forecast echoes the caller-supplied observations', () => {
    const post = ex.POST_forecast as ApiForecast;
    expect(post.status).toBe('PREDICTED');
    expect((post.pollutants.pm25 as ApiPrediction).source).toBe('caller_supplied_observations');
    expect(post.input_observed_aqi?.status).toBe('AVAILABLE');
  });

  it('models are described, not marketed', () => {
    const q = modelQuality((ex.Hadapsar as ApiForecast).pollutants.pm25 as ApiPrediction);
    expect(q.label).toBe('Reasonable fit');
    expect(q.reasons.join(' ')).toMatch(/R2 0\.71/);
    const weak = modelQuality({ ...((ex.Hadapsar as ApiForecast).pollutants.pm10 as ApiPrediction) });
    expect(weak.reasons.join(' ')).toMatch(/EMPIRICAL_INTERVAL/);
    expect(describeWarning('EMPIRICAL_INTERVAL_TEST_COVERAGE_BELOW_8')).toMatch(/interval/);
  });
});

describe('client', () => {
  it('builds the documented requests and returns the recorded responses', async () => {
    const seen: string[] = [];
    const answers: Record<string, unknown> = {
      '/health': { status: 'ok' },
      '/regions': { station_locations: [(ex.Hadapsar as ApiForecast).region], wards: [{}, {}] },
      '/pollution': ex.measured_Hadapsar,
      '/forecast': ex.Hadapsar,
      '/model/metrics': { pm25: { r2: 0.7 } },
      '/boundaries': { type: 'FeatureCollection', features: [] },
      '/location': { ward: 'x' },
      '/industry': { sites: [] },
      '/industry/district-emissions': { sectors: [] },
      '/aqi/history': { status: 'AVAILABLE' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        seen.push(`${init?.method ?? 'GET'} ${url.replace(API_BASE, '')}`);
        return json(answers[new URL(url).pathname]);
      }),
    );
    expect((await getHealth()).status).toBe('ok');
    const regions = await getRegions();
    expect(regions.station_locations).toHaveLength(1);
    expect(regions.wards).toHaveLength(2);
    expect(isMeasured(await getPollution('Hadapsar'))).toBe(true);
    const f = await getForecast('Hadapsar', 'pm25', true);
    expect(isForecast(f) && f.status).toBe('PARTIAL');
    await postForecast({ region: 'Hadapsar', units: { pm25: 'ug/m3' }, observations: [] });
    await getModelMetrics('pm25');
    await getBoundaries();
    await getLocation(73.85, 18.52);
    await getIndustry(73.85, 18.52, 3);
    await getDistrictEmissions();
    await getAqiHistory('Kothrud');
    expect(seen).toEqual([
      'GET /health',
      'GET /regions',
      'GET /pollution?region=Hadapsar',
      'GET /forecast?region=Hadapsar&pollutant=pm25&allow_historical=true',
      'POST /forecast',
      'GET /model/metrics?pollutant=pm25',
      'GET /boundaries',
      'GET /location?longitude=73.85&latitude=18.52',
      'GET /industry?longitude=73.85&latitude=18.52&radius_km=3',
      'GET /industry/district-emissions',
      'GET /aqi/history?region=Kothrud',
    ]);
  });

  it('defaults allow_historical to false and accepts a bare list of stations', async () => {
    const fetchMock = vi.fn(async () => json([{ station: 's', name: 'N' }]));
    vi.stubGlobal('fetch', fetchMock);
    const r = await getRegions();
    expect(r.station_locations).toHaveLength(1);
    fetchMock.mockImplementation(async () => json(ex.Hadapsar));
    await getForecast('Hadapsar');
    expect(String((fetchMock.mock.calls.at(-1) as unknown[])[0])).toContain('allow_historical=false');
  });

  it('reports an offline service when the connection is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(getHealth()).rejects.toMatchObject({ kind: 'offline' });
    await expect(getHealth()).rejects.toThrow(/not reachable/);
  });

  it('reports HTTP and parse errors distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    await expect(getHealth()).rejects.toMatchObject({ kind: 'http', statusCode: 500 });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) as unknown as Response));
    const e = await getHealth().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).kind).toBe('parse');
  });
});
