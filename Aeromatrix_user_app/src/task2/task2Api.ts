/**
 * Typed client for Sensor Intelligence (Task 2): next-hour PM2.5 / PM10 for a station whose sensor is off.
 *
 * The service (FastAPI, localhost port 8030) is EXTERNAL and may not exist. The browser reaches only the read-only
 * routes below through the Vite proxy (/task2/...). /task2/predict is NOT exposed to the browser.
 * Everything it returns is a HISTORICAL REPLAY of the held-out Feb-Sep 2025 test period, never live.
 * Shapes follow docs/contracts/task2_API_CONTRACT.json and docs/contracts/task2_examples/*.json. Routes whose
 * response shape the contract leaves open are typed loosely and read defensively.
 */
import { subindexFor } from '../services/cpcbAqi';

export const T2_BASE = '/task2';
export const T2_TIMEOUT_MS = 20000;

/** Browser-reachable routes (read-only). */
export const T2_ROUTES = ['health', 'stations', 'models', 'cases', 'replay', 'evaluation', 'demos', 'plan'] as const;
export type T2Route = (typeof T2_ROUTES)[number];

export type T2Pollutant = 'pm25' | 'pm10';
export const T2_POLLUTANTS: T2Pollutant[] = ['pm25', 'pm10'];
export const T2_LABEL: Record<T2Pollutant, string> = { pm25: 'PM2.5', pm10: 'PM10' };
export const T2_UNIT = 'ug/m3';
export const T2_AQI_COLOR = { Good: '#2fae8b', Satisfactory: '#e8c100', Moderate: '#f08c1a', Poor: '#d9372f', 'Very Poor': '#8c1d5e', Severe: '#5e1535' } as const;

/** Evaluated sensor-loss levels (share of donor readings removed) and the random seeds used in evaluation. */
export const T2_LOSS_LEVELS = [0, 0.1, 0.3, 0.5, 0.7];
export const T2_SEEDS = [17, 42, 101];
export type T2Pattern = 'random' | 'block12h' | 'station';
export const T2_PATTERNS: Array<{ value: T2Pattern; label: string; hint: string }> = [
  { value: 'random', label: 'Random readings', hint: 'Individual hourly readings are missing at random.' },
  { value: 'block12h', label: '12-hour blocks', hint: 'Sensors go dark for 12 hours at a time.' },
  { value: 'station', label: 'Whole stations', hint: 'Entire donor stations are off.' },
];
export type T2Mode = 'HISTORICAL_REPLAY';

/** The held-out test period of the replays (UTC dates). */
export const T2_TEST_PERIOD = { from: '2025-02-01', to: '2025-09-30' };

export type T2DonorState = 'USED' | 'STALE' | 'NO_READING' | 'LOSS_MASKED' | 'OUTAGE_SIMULATED' | 'OUT_OF_RANGE';

export interface T2Observation {
  station: string;
  timestamp: string;
  available_at: string;
  pollutant: T2Pollutant;
  value: number;
  category: 'MEASURED';
  units: string;
}

/** Request body the contract defines for the (non-browser) predict route; replays carry the same fields. */
export interface T2Request {
  station: string;
  pollutant: T2Pollutant;
  cutoff: string;
  excluded_station?: string | null;
  observations: T2Observation[];
  weather?: Record<string, unknown>;
}

export interface T2Reliability {
  status: string;
  donor_count: number;
  nearest_km: number | null;
  oldest_donor_hours: number | null;
  out_of_training_bounds: string[];
  weather_available: boolean;
  weather_delay_days?: number;
  weather_missing_handling?: string;
  nominal_interval_coverage: number;
  coverage_warning: string;
  [k: string]: unknown;
}

export interface T2Available {
  status: 'AVAILABLE';
  category: string;
  pollutant: T2Pollutant;
  units: string;
  station: string;
  value: number;
  cutoff: string;
  target_time: string;
  horizon_hours: number;
  interval: [number, number];
  model: string;
  version: string;
  baselines: { idw: number | null; persistence: number | null };
  reliability: T2Reliability;
  causal_effects_estimated: false;
  [k: string]: unknown;
}

export interface T2Unavailable {
  status: 'UNAVAILABLE';
  value: null;
  reason: string;
  pollutant: T2Pollutant;
  units: string;
  [k: string]: unknown;
}

export type T2PollutantResult = T2Available | T2Unavailable;

export interface T2Reference {
  value: number | null;
  timestamp: string;
  units: string;
  source: string;
}

export interface T2Replay {
  scenario?: string;
  mode: T2Mode;
  configuration: { loss_level: number; pattern: T2Pattern; seed: number; fold: string };
  input: T2Request;
  prediction: T2PollutantResult;
  independent_reference: T2Reference;
  absolute_error: number | null;
  [k: string]: unknown;
}

export interface T2Stations {
  stations: Array<{ id: string; name: string }>;
}
export interface T2Cases {
  from: string;
  to: string;
}
export interface T2DemoRow {
  name: string;
  status: string;
  actual: number | null;
  prediction: number | null;
  absolute_error: number | null;
}

/** What the browser sends to POST /task2/replay (the service resolves the donor data itself). */
export interface T2ReplayRequest {
  station: string;
  pollutant: T2Pollutant;
  cutoff: string;
  loss_level: number;
  pattern: T2Pattern;
  seed: number;
  /** treat the station as unseen: use the matching excluded-station artifact, never the network model */
  excluded_station?: string | null;
  /** donor stations switched off by hand */
  sensors_off?: string[];
}

export class T2Error extends Error {
  constructor(
    public kind: 'offline' | 'http' | 'parse',
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'T2Error';
  }
}

async function call<T>(route: T2Route, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${T2_BASE}/${route}`, {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(T2_TIMEOUT_MS),
    });
  } catch (e) {
    throw new T2Error('offline', `The Sensor Intelligence service is not reachable (${e instanceof Error ? e.message : 'network error'}).`);
  }
  // With the service absent the dev proxy answers 5xx / 404 or serves the app's HTML: all mean "not running".
  if (res.status >= 500) throw new T2Error('offline', 'The Sensor Intelligence service is not running on port 8030 (or is failing).', res.status);
  if (!res.ok) throw new T2Error('http', `The Sensor Intelligence service answered HTTP ${res.status} for /${route}.`, res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new T2Error('offline', 'No Sensor Intelligence service answered (the response was not JSON).');
  }
}

export const getT2Health = () => call<Record<string, unknown>>('health');
export const getT2Models = () => call<unknown>('models');
export const getT2Evaluation = () => call<unknown>('evaluation');
export const getT2Demos = () => call<unknown>('demos');
export const postT2Plan = (body: unknown) => call<unknown>('plan', { method: 'POST', body });
export const postT2Replay = (body: T2ReplayRequest) => call<T2Replay>('replay', { method: 'POST', body });

/** Stations the service can replay. Accepts a list of ids / objects, or { stations: [...] }. */
export async function getT2Stations(): Promise<T2Stations> {
  const raw = await call<unknown>('stations');
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { stations?: unknown })?.stations) ? ((raw as { stations: unknown[] }).stations) : [];
  const stations = list
    .map((x) => (typeof x === 'string' ? { id: x, name: x } : { id: String((x as { id?: string; station?: string }).id ?? (x as { station?: string }).station ?? ''), name: String((x as { name?: string }).name ?? (x as { station_name?: string }).station_name ?? (x as { id?: string }).id ?? '') }))
    .filter((s) => s.id !== '');
  return { stations };
}

/** The replayable period. Falls back to the documented test period when the service does not state it. */
export async function getT2Cases(): Promise<T2Cases> {
  const raw = await call<unknown>('cases');
  const o = (raw ?? {}) as Record<string, unknown>;
  const from = typeof o.from === 'string' ? o.from : typeof o.start === 'string' ? o.start : T2_TEST_PERIOD.from;
  const to = typeof o.to === 'string' ? o.to : typeof o.end === 'string' ? o.end : T2_TEST_PERIOD.to;
  return { from: from.slice(0, 10), to: to.slice(0, 10) };
}

// ---- guards ----

export const isT2Available = (p: unknown): p is T2Available => !!p && typeof p === 'object' && (p as { status?: unknown }).status === 'AVAILABLE' && typeof (p as T2Available).value === 'number';
export const isT2Unavailable = (p: unknown): p is T2Unavailable => !!p && typeof p === 'object' && (p as { status?: unknown }).status === 'UNAVAILABLE';
export const isT2Replay = (x: unknown): x is T2Replay =>
  !!x && typeof x === 'object' && (x as T2Replay).mode === 'HISTORICAL_REPLAY' && !!(x as T2Replay).input && !!(x as T2Replay).prediction && !!(x as T2Replay).configuration;

// ---- IST helpers ----

const IST_MIN = 330;
const pad = (n: number) => String(n).padStart(2, '0');

/** The UTC cutoff for an IST date and hour: 17:00 IST on 2025-06-30 is 2025-06-30T11:30:00+00:00. */
export function istCutoff(date: string, hour: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d, hour, 0) - IST_MIN * 60000;
  return new Date(utc).toISOString().replace('.000Z', '+00:00');
}

export interface IstParts {
  date: string;
  hour: number;
  minute: number;
  label: string;
}

export function istParts(iso: string): IstParts {
  const t = new Date(new Date(iso).getTime() + IST_MIN * 60000);
  const date = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  const hour = t.getUTCHours();
  const minute = t.getUTCMinutes();
  return { date, hour, minute, label: `${date} ${pad(hour)}:${pad(minute)} IST` };
}

export function shiftHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString().replace('.000Z', '+00:00');
}

/** "site_5766" -> "5766"; names stay as they are. */
export function shortName(id: string): string {
  return id.replace(/^site_/, '');
}

// ---- donors and AQI ----

export interface T2Donor {
  station: string;
  state: T2DonorState;
  /** hours between the reading and the cutoff */
  ageHours: number | null;
  value: number | null;
}

/** Donors seen in a replay's input: USED when the reading is at most 2 hours old, otherwise STALE. */
export function donorsOf(r: T2Replay): T2Donor[] {
  const cutoff = new Date(r.input.cutoff).getTime();
  const best = new Map<string, T2Observation>();
  for (const o of r.input.observations) {
    if (o.station === r.input.station) continue;
    const prev = best.get(o.station);
    if (!prev || new Date(o.timestamp) > new Date(prev.timestamp)) best.set(o.station, o);
  }
  return [...best.values()].map((o) => {
    const age = (cutoff - new Date(o.available_at).getTime()) / 3600000;
    return { station: o.station, state: age <= 2 ? 'USED' : 'STALE', ageHours: Math.max(0, Math.round(age * 10) / 10), value: o.value };
  });
}

/** Rank donors that are named in the request but have no reading as NO_READING. */
export function withMissingDonors(donors: T2Donor[], known: string[], off: string[] = []): T2Donor[] {
  const have = new Set(donors.map((d) => d.station));
  const extra = known
    .filter((s) => !have.has(s))
    .map((s): T2Donor => ({ station: s, state: off.includes(s) ? 'OUTAGE_SIMULATED' : 'NO_READING', ageHours: null, value: null }));
  return [...donors, ...extra];
}

export interface T2Aqi {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  value: number | null;
  dominant: T2Pollutant | null;
  reason: string | null;
  label: string;
}

const PM_LABEL = 'PM-based estimate on 24 h means; never an official CPCB AQI (that needs at least three pollutants)';

/**
 * Estimated PM-based AQI from recorded hourly values of the station plus the forecast hour.
 * Needs 16 valid hours per pollutant in the 24 h window; otherwise "AQI unavailable".
 */
export function estimatePmAqi(recorded: Partial<Record<T2Pollutant, Array<number | null>>>, forecast: Partial<Record<T2Pollutant, number>>): T2Aqi {
  const subs: Partial<Record<T2Pollutant, number>> = {};
  const why: string[] = [];
  for (const p of T2_POLLUTANTS) {
    const hours = recorded[p];
    if (!hours) continue;
    const window = [...hours.slice(-23)];
    if (typeof forecast[p] === 'number') window.push(forecast[p] as number);
    const valid = window.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (valid.length < 16) {
      why.push(`${T2_LABEL[p]} has ${valid.length} of the 16 valid hours needed`);
      continue;
    }
    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
    const s = subindexFor(p, mean);
    if (s.kind === 'ok') subs[p] = s.value;
  }
  const have = T2_POLLUTANTS.filter((p) => subs[p] !== undefined);
  if (have.length === 0) return { status: 'UNAVAILABLE', value: null, dominant: null, reason: why.join('; ') || 'No recorded hours were supplied', label: 'AQI unavailable' };
  let dom = have[0];
  for (const p of have) if ((subs[p] as number) > (subs[dom] as number)) dom = p;
  return { status: 'AVAILABLE', value: subs[dom] as number, dominant: dom, reason: null, label: PM_LABEL };
}
