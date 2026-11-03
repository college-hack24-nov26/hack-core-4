/**
 * Open-Meteo clients: CAMS global air-quality MODEL data (about 40 km resolution) and the weather forecast.
 * Values are MODEL_DATA, never measurements. Each point keeps the requested coordinate AND the model grid point
 * Open-Meteo actually used. CPCB AQI is computed here from the model hours and says so in its method text.
 */
import type { LonLat } from '../types';
import type { Pollutant } from '../types';
import { METHOD_MODEL, calculateAqi, type AqiResult, type HourlySeries } from './cpcbAqi';

export const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
export const MAX_POINTS_PER_REQUEST = 100;
export const CACHE_TTL_MS = 10 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 15000;

/** Provider variable for each engine pollutant. */
export const OM_VARIABLES: Record<Pollutant, string> = {
  pm25: 'pm2_5',
  pm10: 'pm10',
  no2: 'nitrogen_dioxide',
  so2: 'sulphur_dioxide',
  co: 'carbon_monoxide',
  o3: 'ozone',
};
export const OM_POLLUTANTS = Object.keys(OM_VARIABLES) as Pollutant[];
/** Provider reports carbon monoxide in ug/m3; the app uses mg/m3. */
export const CO_UG_TO_MG = 0.001;

export type HourlyValues = Record<Pollutant, Array<number | null>>;

export interface OmAirPoint {
  requested: LonLat;
  /** the model grid point Open-Meteo actually used */
  grid: LonLat;
  elevation: number | null;
  /** hour starts, unix seconds (UTC) */
  times: number[];
  hourly: HourlyValues;
  /** values for the current hour as reported by the provider (CO in mg/m3) */
  current: { time: number | null; values: Partial<Record<Pollutant, number>> };
  /** why a pollutant has no data at this point */
  missing: Partial<Record<Pollutant, string>>;
  /** CPCB AQI estimated from the model hours up to `asOf` (always labelled an estimate) */
  aqi: AqiResult | null;
  asOf: number | null;
  fetchedAt: number;
}

export interface OmWeatherPoint {
  requested: LonLat;
  grid: LonLat;
  elevation: number | null;
  time: number | null;
  temperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  pressure: number | null;
  /** precipitation over the 24 hours up to now, mm */
  rainfall24h: number | null;
  fetchedAt: number;
}

export class OpenMeteoError extends Error {
  constructor(
    message: string,
    public busy = false,
  ) {
    super(message);
    this.name = 'OpenMeteoError';
  }
}

export interface FetchOptions {
  pastDays?: number;
  forecastDays?: number;
  /** "now" in ms; injectable for tests */
  now?: () => number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

interface CacheEntry<T> {
  at: number;
  value: T;
}
const airCache = new Map<string, CacheEntry<OmAirPoint>>();
const wxCache = new Map<string, CacheEntry<OmWeatherPoint>>();
const inflight = new Map<string, Promise<unknown>>();

export function clearOpenMeteoCache() {
  airCache.clear();
  wxCache.clear();
  inflight.clear();
}

const keyOf = (p: LonLat, extra: string) => `${p[1].toFixed(4)},${p[0].toFixed(4)}|${extra}`;

async function getJson(url: string, opts: FetchOptions): Promise<unknown> {
  const attempts = 2; // one retry
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? REQUEST_TIMEOUT_MS) });
      if (res.status === 429 || res.status >= 500) throw new OpenMeteoError(`Open-Meteo answered HTTP ${res.status}`, res.status === 429);
      if (!res.ok) {
        let reason = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { reason?: string };
          if (body?.reason) reason = body.reason;
        } catch {
          /* keep the status text */
        }
        throw new OpenMeteoError(`Open-Meteo rejected the request: ${reason}`);
      }
      const body = (await res.json()) as unknown;
      if (body && typeof body === 'object' && (body as { error?: boolean }).error) {
        throw new OpenMeteoError(`Open-Meteo: ${(body as { reason?: string }).reason ?? 'request failed'}`);
      }
      return body;
    } catch (e) {
      last = e;
      if (e instanceof OpenMeteoError && !e.busy && /rejected|Open-Meteo:/.test(e.message)) break; // a 4xx will not improve
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 600));
    }
  }
  if (last instanceof OpenMeteoError) throw last;
  throw new OpenMeteoError(`Could not reach Open-Meteo (${last instanceof Error ? last.message : 'network error'}).`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toArray(json: unknown): Array<Record<string, unknown>> {
  return (Array.isArray(json) ? json : [json]) as Array<Record<string, unknown>>;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const numArr = (v: unknown): Array<number | null> => (Array.isArray(v) ? v.map(num) : []);

/** Trailing hourly AQI inputs, newest first, for the hour whose index is `idx`. */
export function seriesNewestFirst(hourly: HourlyValues, idx: number): HourlySeries {
  const out: HourlySeries = {};
  for (const p of OM_POLLUTANTS) {
    const arr: Array<number | null> = [];
    for (let i = idx; i > idx - 24 && i >= 0; i--) arr.push(hourly[p][i] ?? null);
    out[p] = arr;
  }
  return out;
}

/** Index of the last hour that has started by `nowMs`. */
export function currentHourIndex(times: number[], nowMs: number): number {
  let idx = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i] * 1000 <= nowMs) idx = i;
    else break;
  }
  return idx;
}

export function aqiForPoint(times: number[], hourly: HourlyValues, nowMs: number): { aqi: AqiResult | null; idx: number } {
  const idx = currentHourIndex(times, nowMs);
  if (idx < 0) return { aqi: null, idx };
  // The AQI period ends when the hour completes; model hours are labelled by their start.
  const end = new Date((times[idx] + 3600) * 1000);
  return { aqi: calculateAqi(seriesNewestFirst(hourly, idx), end, METHOD_MODEL), idx };
}

function parseAirPoint(raw: Record<string, unknown>, requested: LonLat, nowMs: number): OmAirPoint {
  const h = (raw.hourly ?? {}) as Record<string, unknown>;
  const times = Array.isArray(h.time) ? (h.time as number[]) : [];
  const hourly = {} as HourlyValues;
  const missing: OmAirPoint['missing'] = {};
  for (const p of OM_POLLUTANTS) {
    const arr = numArr(h[OM_VARIABLES[p]]);
    const scaled = p === 'co' ? arr.map((v) => (v === null ? null : v * CO_UG_TO_MG)) : arr;
    hourly[p] = scaled;
    if (scaled.length === 0) missing[p] = `Open-Meteo returned no ${OM_VARIABLES[p]} series for this point`;
    else if (scaled.every((v) => v === null)) missing[p] = `The CAMS model has no ${OM_VARIABLES[p]} values for this point and period`;
  }
  const c = (raw.current ?? {}) as Record<string, unknown>;
  const cur: OmAirPoint['current'] = { time: num(c.time), values: {} };
  for (const p of OM_POLLUTANTS) {
    const v = num(c[OM_VARIABLES[p]]);
    if (v !== null) cur.values[p] = p === 'co' ? v * CO_UG_TO_MG : v;
  }
  const { aqi, idx } = aqiForPoint(times, hourly, nowMs);
  return {
    requested,
    grid: [num(raw.longitude) ?? requested[0], num(raw.latitude) ?? requested[1]],
    elevation: num(raw.elevation),
    times,
    hourly,
    current: cur,
    missing,
    aqi,
    asOf: idx >= 0 ? times[idx] * 1000 : null,
    fetchedAt: nowMs,
  };
}

async function fetchChunk<T>(
  baseUrl: string,
  points: LonLat[],
  query: Record<string, string>,
  parse: (raw: Record<string, unknown>, p: LonLat) => T,
  opts: FetchOptions,
): Promise<T[]> {
  const params = new URLSearchParams({
    latitude: points.map((p) => p[1].toFixed(4)).join(','),
    longitude: points.map((p) => p[0].toFixed(4)).join(','),
    ...query,
  });
  const url = `${baseUrl}?${params.toString()}`;
  let pending = inflight.get(url) as Promise<unknown> | undefined;
  if (!pending) {
    pending = getJson(url, opts).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  const arr = toArray(await pending);
  if (arr.length !== points.length) throw new OpenMeteoError(`Open-Meteo returned ${arr.length} results for ${points.length} points.`);
  return arr.map((raw, i) => parse(raw, points[i]));
}

/** CAMS air-quality model data for many points (batched, cached, de-duplicated while in flight). */
export async function fetchAirQuality(points: LonLat[], opts: FetchOptions = {}): Promise<OmAirPoint[]> {
  const now = opts.now ?? Date.now;
  const past = opts.pastDays ?? 1;
  const fore = opts.forecastDays ?? 2;
  const tag = `aq|${past}|${fore}`;
  const t0 = now();
  const result: Array<OmAirPoint | null> = points.map((p) => {
    const hit = airCache.get(keyOf(p, tag));
    return hit && t0 - hit.at < CACHE_TTL_MS ? hit.value : null;
  });
  const todo = points.map((p, i) => ({ p, i })).filter(({ i }) => result[i] === null);
  const variables = OM_POLLUTANTS.map((p) => OM_VARIABLES[p]).join(',');
  for (const group of chunk(todo, MAX_POINTS_PER_REQUEST)) {
    const parsed = await fetchChunk(
      AIR_QUALITY_URL,
      group.map((g) => g.p),
      {
        hourly: variables,
        current: variables,
        domains: 'cams_global',
        timezone: 'GMT',
        timeformat: 'unixtime',
        past_days: String(past),
        forecast_days: String(fore),
      },
      (raw, p) => parseAirPoint(raw, p, now()),
      opts,
    );
    group.forEach((g, k) => {
      result[g.i] = parsed[k];
      airCache.set(keyOf(g.p, tag), { at: now(), value: parsed[k] });
    });
  }
  return result as OmAirPoint[];
}

function parseWeather(raw: Record<string, unknown>, requested: LonLat, nowMs: number): OmWeatherPoint {
  const c = (raw.current ?? {}) as Record<string, unknown>;
  const h = (raw.hourly ?? {}) as Record<string, unknown>;
  const times = Array.isArray(h.time) ? (h.time as number[]) : [];
  const precip = numArr(h.precipitation);
  const idx = currentHourIndex(times, nowMs);
  let rain: number | null = null;
  if (idx >= 0) {
    const window = precip.slice(Math.max(0, idx - 23), idx + 1);
    const vals = window.filter((v): v is number => v !== null);
    rain = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) * 10) / 10 : null;
  }
  return {
    requested,
    grid: [num(raw.longitude) ?? requested[0], num(raw.latitude) ?? requested[1]],
    elevation: num(raw.elevation),
    time: num(c.time),
    temperature: num(c.temperature_2m),
    humidity: num(c.relative_humidity_2m),
    windSpeed: num(c.wind_speed_10m),
    windDirection: num(c.wind_direction_10m),
    pressure: num(c.pressure_msl),
    rainfall24h: rain,
    fetchedAt: nowMs,
  };
}

/** Current weather (Open-Meteo Forecast API) for many points. */
export async function fetchWeather(points: LonLat[], opts: FetchOptions = {}): Promise<OmWeatherPoint[]> {
  const now = opts.now ?? Date.now;
  const tag = 'wx';
  const t0 = now();
  const result: Array<OmWeatherPoint | null> = points.map((p) => {
    const hit = wxCache.get(keyOf(p, tag));
    return hit && t0 - hit.at < CACHE_TTL_MS ? hit.value : null;
  });
  const todo = points.map((p, i) => ({ p, i })).filter(({ i }) => result[i] === null);
  for (const group of chunk(todo, MAX_POINTS_PER_REQUEST)) {
    const parsed = await fetchChunk(
      WEATHER_URL,
      group.map((g) => g.p),
      {
        current: 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl',
        hourly: 'precipitation',
        wind_speed_unit: 'ms',
        timezone: 'GMT',
        timeformat: 'unixtime',
        past_days: '1',
        forecast_days: '1',
      },
      (raw, p) => parseWeather(raw, p, now()),
      opts,
    );
    group.forEach((g, k) => {
      result[g.i] = parsed[k];
      wxCache.set(keyOf(g.p, tag), { at: now(), value: parsed[k] });
    });
  }
  return result as OmWeatherPoint[];
}
