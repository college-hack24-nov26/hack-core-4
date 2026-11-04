import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import airFixture from './__fixtures__/openmeteo-air-quality.json';
import wxFixture from './__fixtures__/openmeteo-weather.json';
import {
  CO_UG_TO_MG,
  MAX_POINTS_PER_REQUEST,
  OpenMeteoError,
  clearOpenMeteoCache,
  currentHourIndex,
  fetchAirQuality,
  fetchWeather,
} from './openMeteo';
import type { LonLat } from '../types';

const air = airFixture as unknown as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const wx = wxFixture as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const NOW = air[0].current.time * 1000;
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const opts = { now: () => NOW, retryDelayMs: 1 };
const pts: LonLat[] = [[73.9, 18.5], [73.85, 18.55], [73.8, 18.6]];

beforeEach(() => clearOpenMeteoCache());
afterEach(() => vi.unstubAllGlobals());

describe('fetchAirQuality', () => {
  it('parses the recorded response, keeping requested and grid coordinates', async () => {
    const f = vi.fn(async () => res(air));
    vi.stubGlobal('fetch', f);
    const r = await fetchAirQuality(pts, opts);
    expect(r).toHaveLength(3);
    expect(r[0].requested).toEqual([73.9, 18.5]);
    expect(r[0].grid).toEqual([73.90001, 18.5]);
    expect(r[0].elevation).toBe(577);
    expect(r[0].times).toHaveLength(48);
    expect(r[0].hourly.pm25).toHaveLength(48);
  });

  it('asks for the CAMS global domain and the six variables in one batched request', async () => {
    const f = vi.fn(async () => res(air));
    vi.stubGlobal('fetch', f);
    await fetchAirQuality(pts, opts);
    expect(f).toHaveBeenCalledTimes(1);
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe('https://air-quality-api.open-meteo.com/v1/air-quality');
    expect(url.searchParams.get('domains')).toBe('cams_global');
    expect(url.searchParams.get('hourly')).toBe('pm2_5,pm10,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,ozone');
    expect(url.searchParams.get('latitude')).toBe('18.5000,18.5500,18.6000');
    expect(url.searchParams.get('longitude')).toBe('73.9000,73.8500,73.8000');
  });

  it('converts carbon monoxide from ug/m3 to mg/m3', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(air)));
    const r = await fetchAirQuality(pts, opts);
    expect(CO_UG_TO_MG).toBe(0.001);
    expect(r[0].current.values.co).toBeCloseTo(0.661, 6);
    expect(r[0].current.values.pm25).toBe(39.2);
    expect(r[0].hourly.co[0]).toBeCloseTo(air[0].hourly.carbon_monoxide[0] * 0.001, 9);
  });

  it('computes an estimated CPCB AQI from the model hours, labelled as an estimate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(air)));
    const [p] = await fetchAirQuality(pts, opts);
    expect(p.aqi).not.toBeNull();
    expect(p.aqi!.method).toMatch(/ESTIMATED from CAMS model data/);
    expect(p.aqi!.method).toMatch(/not an official station AQI/);
    expect(['AVAILABLE', 'LOWER_BOUND', 'UNAVAILABLE']).toContain(p.aqi!.status);
    expect(p.asOf).toBe(currentHourIndex(p.times, NOW) >= 0 ? p.times[currentHourIndex(p.times, NOW)] * 1000 : null);
  });

  it('records per-pollutant missing reasons instead of inventing values', async () => {
    const broken = JSON.parse(JSON.stringify(air));
    broken[0].hourly.ozone = broken[0].hourly.ozone.map(() => null);
    delete broken[0].hourly.sulphur_dioxide;
    vi.stubGlobal('fetch', vi.fn(async () => res(broken)));
    const [p] = await fetchAirQuality(pts, opts);
    expect(p.missing.o3).toMatch(/no ozone values/);
    expect(p.missing.so2).toMatch(/no sulphur_dioxide series/);
    expect(p.missing.pm25).toBeUndefined();
    expect(p.hourly.o3.every((v) => v === null)).toBe(true);
  });

  it('caches results and de-duplicates requests in flight', async () => {
    const f = vi.fn(async () => res(air));
    vi.stubGlobal('fetch', f);
    await Promise.all([fetchAirQuality(pts, opts), fetchAirQuality(pts, opts)]);
    expect(f).toHaveBeenCalledTimes(1);
    await fetchAirQuality(pts, opts);
    expect(f).toHaveBeenCalledTimes(1); // cache hit
  });

  it('splits more than 100 points into batches', async () => {
    const many: LonLat[] = Array.from({ length: 130 }, (_, i) => [73.7 + i * 0.001, 18.5]);
    const f = vi.fn(async (url: string) => {
      const n = new URL(url).searchParams.get('latitude')!.split(',').length;
      return res(Array.from({ length: n }, () => air[0]));
    });
    vi.stubGlobal('fetch', f);
    const r = await fetchAirQuality(many, opts);
    expect(r).toHaveLength(130);
    expect(f).toHaveBeenCalledTimes(2);
    expect(MAX_POINTS_PER_REQUEST).toBe(100);
  });

  it('handles a single-object response for a single point', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(air[0])));
    const r = await fetchAirQuality([[73.9, 18.5]], opts);
    expect(r).toHaveLength(1);
  });

  it('retries once, then reports a readable error', async () => {
    const f = vi.fn(async () => { throw new TypeError('offline'); });
    vi.stubGlobal('fetch', f);
    await expect(fetchAirQuality(pts, opts)).rejects.toThrow(/Could not reach Open-Meteo/);
    expect(f).toHaveBeenCalledTimes(2);
    clearOpenMeteoCache();
    vi.stubGlobal('fetch', vi.fn(async () => res({}, 429)));
    const e = await fetchAirQuality(pts, opts).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(OpenMeteoError);
    expect((e as OpenMeteoError).busy).toBe(true);
  });

  it('does not retry a rejected request and surfaces the provider reason', async () => {
    const f = vi.fn(async () => res({ error: true, reason: 'Latitude must be in range' }, 400));
    vi.stubGlobal('fetch', f);
    await expect(fetchAirQuality(pts, opts)).rejects.toThrow(/Latitude must be in range/);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('fetchWeather', () => {
  it('parses current weather and sums the last 24 h of precipitation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res(wx)));
    const [w] = await fetchWeather([[73.87, 18.52]], { now: () => wx.current.time * 1000, retryDelayMs: 1 });
    expect(w.temperature).toBe(27);
    expect(w.humidity).toBe(52);
    expect(w.windSpeed).toBe(0.85);
    expect(w.windDirection).toBe(242);
    expect(w.pressure).toBe(1014.7);
    expect(w.grid).toEqual([73.86876, 18.523726]);
    expect(w.rainfall24h).toBe(0);
  });

  it('asks for metres per second', async () => {
    const f = vi.fn(async () => res(wx));
    vi.stubGlobal('fetch', f);
    await fetchWeather([[73.87, 18.52]], opts);
    const url = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
    expect(url.origin).toBe('https://api.open-meteo.com');
  });
});
