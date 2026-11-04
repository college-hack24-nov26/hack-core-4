/**
 * Typed client for the trained station-forecast service (FastAPI, default http://127.0.0.1:8000).
 *
 * The service is an EXTERNAL dependency that may not exist: every call can fail with ApiError (kind 'offline' for
 * connection refused / timeout). HTTP 200 with status UNAVAILABLE is a normal state that carries a reason.
 * Shapes follow docs/contracts/trained_model_API_CONTRACT.json and trained_model_RESPONSE_EXAMPLES.json. Routes whose
 * response schema the contract leaves open (/health, /regions, /model/metrics, /boundaries, /location, /industry,
 * /industry/district-emissions, /aqi/history) are typed loosely and read defensively.
 */
import type { AqiPollutant } from './cpcbAqi';

const env = import.meta.env as Record<string, string | undefined>;
export const API_BASE = (env.VITE_AEROMATRIX_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const API_TIMEOUT_MS = 8000;

/** Every operation in the contract, so a test can prove the client covers them all. */
export const ENDPOINTS = [
  '/health',
  '/regions',
  '/pollution',
  '/forecast',
  '/model/metrics',
  '/location',
  '/boundaries',
  '/industry',
  '/industry/district-emissions',
  '/aqi/history',
] as const;

export type ApiPollutantKey =
  | 'pm25'
  | 'pm10'
  | 'no2'
  | 'no'
  | 'nox'
  | 'so2'
  | 'co'
  | 'o3'
  | 'nh3'
  | 'benzene'
  | 'toluene'
  | 'xylene';

export const API_POLLUTANT_KEYS: ApiPollutantKey[] = [
  'pm25', 'pm10', 'no2', 'no', 'nox', 'so2', 'co', 'o3', 'nh3', 'benzene', 'toluene', 'xylene',
];

export const API_POLLUTANT_LABEL: Record<ApiPollutantKey, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO2',
  no: 'NO',
  nox: 'NOx',
  so2: 'SO2',
  co: 'CO',
  o3: 'O3',
  nh3: 'NH3',
  benzene: 'Benzene',
  toluene: 'Toluene',
  xylene: 'Xylene',
};

/** The six pollutants the map engine and Open-Meteo share. */
export const ENGINE_POLLUTANT_KEYS: AqiPollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

export interface ApiStation {
  station: string;
  station_name: string;
  name: string;
  aliases: string[];
  latitude: number | null;
  longitude: number | null;
  source_files: string;
  [k: string]: unknown;
}

export interface ApiUnavailable {
  status: 'UNAVAILABLE';
  reason: string;
  pollutant?: string;
  [k: string]: unknown;
}

export interface ApiWindow {
  start: string;
  end: string;
  statistic?: string;
}

export interface ApiMeasuredValue {
  status: 'MEASURED';
  value: number;
  unit: string;
  /** hour start; different pollutants can have different times */
  time: string;
  historical: boolean;
  source: string;
  window: ApiWindow;
}

export interface ApiAqi {
  status: 'AVAILABLE' | 'LOWER_BOUND' | 'UNAVAILABLE';
  value?: number | null;
  category?: string | null;
  dominant_pollutant?: string | null;
  reason?: string | null;
  subindices?: Record<string, { value: number; bounded: boolean; concentration: number; averaging_hours: number }>;
  coverage_hours?: Record<string, number>;
  excluded?: Record<string, string>;
  period_end?: string;
  method?: string;
  timestamp_semantics?: string;
  [k: string]: unknown;
}

export interface ApiMeasured {
  status: 'MEASURED';
  region: ApiStation;
  pollutants: Partial<Record<ApiPollutantKey, ApiMeasuredValue | ApiUnavailable>>;
  aqi: ApiAqi;
  historical: boolean;
  snapshot_end: string;
  source_files: string;
  notice: string;
  snapshot_window_end: string;
  [k: string]: unknown;
}

export interface ApiModelInfo {
  algorithm: string;
  version: string;
  artifact_sha256: string;
  /** "fitted_ml_model" or "statistical_baseline" (SO2 uses a persistence baseline, not an ML model) */
  kind: string;
}

export interface ApiPrediction {
  status: 'PREDICTED';
  pollutant: string;
  value: number;
  unit: string;
  issued_at: string;
  valid_at: string;
  generated_at: string;
  horizon_hours: number;
  historical: boolean;
  observation_window: { start: string; end: string };
  prediction_window: { start: string; end: string; statistic: 'hourly_mean' };
  model: ApiModelInfo;
  lower: number;
  upper: number;
  uncertainty: { method: string; radius: number; test_coverage: number; [k: string]: unknown };
  test_metrics: { mae?: number; rmse?: number; r2?: number; n?: number; [k: string]: unknown };
  reliability_warnings: string[];
  imputed_features: string[];
  source: string;
  spatial_scope: string;
}

export interface ApiForecast {
  status: 'PREDICTED' | 'PARTIAL' | 'UNAVAILABLE';
  region: ApiStation;
  pollutants: Partial<Record<ApiPollutantKey, ApiPrediction | ApiUnavailable>>;
  aqi: ApiUnavailable;
  scenario_note: string;
  input_observed_aqi?: ApiAqi;
  [k: string]: unknown;
}

export type ApiForecastResponse = ApiForecast | ApiUnavailable;

export interface ApiHealth {
  status?: string;
  [k: string]: unknown;
}

export interface ApiRegions {
  station_locations: ApiStation[];
  wards: unknown[];
  [k: string]: unknown;
}

export interface ApiAqiHistory {
  status?: string;
  reason?: string;
  [k: string]: unknown;
}

export interface HourlyObservation {
  time: string;
  values: Record<string, number | null>;
}

export interface ForecastRequest {
  region: string;
  pollutants?: string[] | null;
  allow_historical?: boolean;
  units: Record<string, string>;
  observations: HourlyObservation[];
}

export type ApiErrorKind = 'offline' | 'http' | 'parse';

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isUnavailable(x: unknown): x is ApiUnavailable {
  return !!x && typeof x === 'object' && (x as { status?: unknown }).status === 'UNAVAILABLE';
}
export function isMeasured(x: unknown): x is ApiMeasured {
  return !!x && typeof x === 'object' && (x as { status?: unknown }).status === 'MEASURED' && 'pollutants' in (x as object);
}
export function isMeasuredValue(x: unknown): x is ApiMeasuredValue {
  return !!x && typeof x === 'object' && (x as { status?: unknown }).status === 'MEASURED' && typeof (x as ApiMeasuredValue).value === 'number';
}
export function isPredicted(x: unknown): x is ApiPrediction {
  return !!x && typeof x === 'object' && (x as { status?: unknown }).status === 'PREDICTED' && typeof (x as ApiPrediction).value === 'number';
}
/** A whole forecast response that carries per-pollutant results (PREDICTED or PARTIAL). */
export function isForecast(x: unknown): x is ApiForecast {
  return !!x && typeof x === 'object' && 'pollutants' in (x as object) && 'region' in (x as object);
}

type Params = Record<string, string | number | boolean | null | undefined>;

async function request<T>(path: string, init?: { params?: Params; method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number }): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(init?.params ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init?.timeoutMs ?? API_TIMEOUT_MS),
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : 'network error';
    throw new ApiError('offline', `The model service at ${API_BASE} is not reachable (${why}).`);
  }
  if (!res.ok) throw new ApiError('http', `The model service answered HTTP ${res.status} for ${path}.`, res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('parse', `The model service returned something that is not JSON for ${path}.`);
  }
}

export const getHealth = () => request<ApiHealth>('/health');

/** /regions: 12 station_locations and 58 wards. Accepts a bare array of stations too. */
export async function getRegions(): Promise<ApiRegions> {
  const raw = await request<unknown>('/regions');
  if (Array.isArray(raw)) return { station_locations: raw as ApiStation[], wards: [] };
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    ...o,
    station_locations: Array.isArray(o.station_locations) ? (o.station_locations as ApiStation[]) : [],
    wards: Array.isArray(o.wards) ? o.wards : [],
  };
}

export const getPollution = (region: string) => request<ApiMeasured | ApiUnavailable>('/pollution', { params: { region } });

export const getForecast = (region: string, pollutant?: string, allowHistorical = false) =>
  request<ApiForecastResponse>('/forecast', { params: { region, pollutant, allow_historical: allowHistorical } });

export const postForecast = (body: ForecastRequest) => request<ApiForecastResponse>('/forecast', { method: 'POST', body, timeoutMs: 20000 });

export const getModelMetrics = (pollutant?: string) => request<Record<string, unknown>>('/model/metrics', { params: { pollutant } });

export const getBoundaries = (version?: string) => request<unknown>('/boundaries', { params: { version } });

export const getLocation = (longitude: number, latitude: number) => request<Record<string, unknown>>('/location', { params: { longitude, latitude } });

export const getIndustry = (longitude: number, latitude: number, radiusKm = 5) =>
  request<Record<string, unknown>>('/industry', { params: { longitude, latitude, radius_km: radiusKm } });

export const getDistrictEmissions = () => request<Record<string, unknown>>('/industry/district-emissions');

export const getAqiHistory = (region: string) => request<ApiAqiHistory>('/aqi/history', { params: { region } });

/** The value the service wants for ?region=: the short station name. */
export const regionKey = (s: Pick<ApiStation, 'name'>) => s.name;

export interface ModelQuality {
  label: 'Baseline only' | 'Reasonable fit' | 'Moderate fit' | 'Weak fit';
  /** 0-1, from test R2 (descriptive, not a guarantee) */
  score: number;
  reasons: string[];
}

/**
 * A small descriptive label from the held-out test metrics and the model kind.
 * It says how well the model fitted its test period; it is not a promise about tomorrow.
 */
export function modelQuality(p: Pick<ApiPrediction, 'model' | 'test_metrics' | 'reliability_warnings' | 'uncertainty'>): ModelQuality {
  const reasons: string[] = [];
  const r2 = p.test_metrics.r2;
  const n = p.test_metrics.n;
  if (p.model.kind === 'statistical_baseline') {
    return { label: 'Baseline only', score: 0, reasons: [`Statistical baseline (${p.model.algorithm}), not a fitted ML model`, ...p.reliability_warnings] };
  }
  if (typeof r2 === 'number') reasons.push(`Test R2 ${r2.toFixed(2)}${typeof n === 'number' ? ` on ${n.toLocaleString('en-IN')} hours` : ''}`);
  if (typeof p.test_metrics.mae === 'number') reasons.push(`Test MAE ${p.test_metrics.mae.toFixed(1)}`);
  if (typeof p.uncertainty.test_coverage === 'number') reasons.push(`Interval covered ${Math.round(p.uncertainty.test_coverage * 100)}% of test cases`);
  reasons.push(...p.reliability_warnings);
  const score = typeof r2 === 'number' ? Math.max(0, Math.min(1, r2)) : 0;
  const penalised = p.reliability_warnings.length > 0 ? score - 0.1 : score;
  const label = penalised >= 0.7 ? 'Reasonable fit' : penalised >= 0.4 ? 'Moderate fit' : 'Weak fit';
  return { label, score, reasons };
}

/** Plain-English text for a reliability warning code from the service. */
export function describeWarning(code: string): string {
  if (code.startsWith('EMPIRICAL_INTERVAL_TEST_COVERAGE_BELOW')) return 'The prediction interval covered fewer test cases than its nominal level';
  if (code === 'WEAK_MODEL_NEGATIVE_OR_UNDEFINED_TEST_R2') return 'The model did not beat a simple baseline on test data';
  return code.replace(/_/g, ' ').toLowerCase();
}
