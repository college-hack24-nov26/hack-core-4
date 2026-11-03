/**
 * Shared live-data service (Open-Meteo CAMS model data + weather). Components read the results from the store;
 * none of them call the API. Request points are snapped to a 0.1 degree lattice because CAMS resolves about 0.4
 * degrees and Open-Meteo counts every coordinate as a call: a few dozen distinct points serve the whole grid.
 */
import type { BaseState, LonLat, Pollutant } from '../types';
import { useTwinStore } from '../store/useTwinStore';
import { fetchAirQuality, fetchWeather, currentHourIndex, OM_POLLUTANTS, type OmAirPoint, type OmWeatherPoint, type FetchOptions } from './openMeteo';
import { placedStations } from './stations';
import { initialLive, type LiveAirPoint, type LiveState, type LiveStatus } from './liveState';

export { initialLive };
export type { LiveAirPoint, LiveState, LiveStatus };

const env = import.meta.env as Record<string, string | undefined>;
const configured = Number(env.VITE_LIVE_REFRESH_MINUTES);
/** Never refresh more often than every 5 minutes. */
export const LIVE_REFRESH_MINUTES = Math.max(5, Number.isFinite(configured) && configured > 0 ? configured : 60);
export const MODEL_POINT_STEP = 0.1;

export const zonePointId = (cellId: string) => `zone:${cellId}`;
export const placePointId = (stationId: string) => `place:${stationId}`;
export const localityPointId = (name: string) => `locality:${name}`;

export interface LiveTarget {
  id: string;
  lon: number;
  lat: number;
}

/** Snap a coordinate to the 0.1 degree lattice. */
export const snapCoord = (v: number): number => Math.round(Math.round(v / MODEL_POINT_STEP) * MODEL_POINT_STEP * 1000) / 1000;
export const snapPoint = (p: LonLat): LonLat => [snapCoord(p[0]), snapCoord(p[1])];
const latticeKey = (p: LonLat) => `${p[1].toFixed(1)},${p[0].toFixed(1)}`;

/** Every zone centre plus any extra places (verified stations). */
export function buildTargets(base: BaseState, places: LiveTarget[] = []): LiveTarget[] {
  return [
    ...base.cells.map((c) => ({ id: zonePointId(c.id), lon: c.center[0], lat: c.center[1] })),
    ...places,
  ];
}

export interface LiveSnapshot {
  points: Record<string, LiveAirPoint>;
  weather: OmWeatherPoint | null;
  errors: string[];
  /** distinct points actually requested (after snapping) */
  requestedPoints: number;
}

/** Fetch live model data for the targets; snapped duplicates share one request point. */
export async function loadLive(targets: LiveTarget[], center: LonLat, opts: FetchOptions = {}): Promise<LiveSnapshot> {
  const lattice = new Map<string, LonLat>();
  for (const t of targets) {
    const s = snapPoint([t.lon, t.lat]);
    lattice.set(latticeKey(s), s);
  }
  const unique = [...lattice.values()];
  const errors: string[] = [];
  const points: Record<string, LiveAirPoint> = {};
  let air: OmAirPoint[] = [];
  try {
    air = await fetchAirQuality(unique, opts);
  } catch (e) {
    errors.push(`Air quality: ${e instanceof Error ? e.message : 'failed'}`);
  }
  if (air.length === unique.length) {
    const byKey = new Map<string, OmAirPoint>();
    unique.forEach((p, i) => byKey.set(latticeKey(p), air[i]));
    for (const t of targets) {
      const hit = byKey.get(latticeKey(snapPoint([t.lon, t.lat])));
      if (hit) points[t.id] = { ...hit, targetId: t.id, requested: [t.lon, t.lat] };
    }
  }
  let weather: OmWeatherPoint | null = null;
  try {
    [weather] = await fetchWeather([snapPoint(center)], opts);
  } catch (e) {
    errors.push(`Weather: ${e instanceof Error ? e.message : 'failed'}`);
  }
  return { points, weather, errors, requestedPoints: unique.length };
}

/** On-demand point for a locality (not part of the periodic refresh). */
export async function fetchLocalityPoint(name: string, lon: number, lat: number, opts: FetchOptions = {}): Promise<LiveAirPoint> {
  const [p] = await fetchAirQuality([snapPoint([lon, lat])], opts);
  return { ...p, targetId: localityPointId(name), requested: [lon, lat] };
}

/** The live value of a pollutant at a target for the current hour, or null. */
export function liveValue(point: OmAirPoint | undefined, p: Pollutant, nowMs: number = Date.now()): number | null {
  if (!point) return null;
  const idx = currentHourIndex(point.times, nowMs);
  if (idx < 0) return null;
  return point.hourly[p][idx] ?? null;
}

/** Live data is "fresh" for twice the refresh interval; after that it must not be shown as current. */
export function isLiveFresh(live: Pick<LiveState, 'lastUpdated' | 'status'>, nowMs: number = Date.now()): boolean {
  return live.lastUpdated !== null && live.status !== 'offline' && nowMs - live.lastUpdated < 2 * LIVE_REFRESH_MINUTES * 60 * 1000;
}

export function nextRefreshAt(lastUpdated: number | null): number {
  return lastUpdated === null ? 0 : lastUpdated + LIVE_REFRESH_MINUTES * 60 * 1000;
}

/** Whole-grid current field for one pollutant: every cell must have a value, otherwise there is no field. */
export function currentFieldValues(base: BaseState, points: Record<string, LiveAirPoint>, p: Pollutant, nowMs: number = Date.now()): number[] | null {
  const out: number[] = [];
  for (const c of base.cells) {
    const v = liveValue(points[zonePointId(c.id)], p, nowMs);
    if (v === null) return null;
    out.push(v);
  }
  return out.length > 0 ? out : null;
}

export function pollutantsWithData(points: Record<string, LiveAirPoint>): Pollutant[] {
  const any = Object.values(points)[0];
  if (!any) return [];
  return (OM_POLLUTANTS as Pollutant[]).filter((p) => !any.missing[p]);
}

let inFlight: Promise<void> | null = null;

/** Refresh now. Without `force` the minimum interval is respected. */
export async function refreshLiveNow(force = false): Promise<void> {
  const s = useTwinStore.getState();
  if (!s.base) return;
  if (!force && s.live.lastUpdated !== null && Date.now() < nextRefreshAt(s.live.lastUpdated) && s.live.status === 'ready') return;
  if (inFlight) return inFlight;
  const base = s.base;
  inFlight = (async () => {
    useTwinStore.setState({ live: { ...useTwinStore.getState().live, status: 'loading', reason: null } });
    const places = placedStations(useTwinStore.getState().catalog).map((st) => ({ id: placePointId(st.id), lon: st.lon as number, lat: st.lat as number }));
    // Four forecast days so the Commissioner app can show 24 / 48 / 72 h model outlooks.
    const snap = await loadLive(buildTargets(base, places), base.city.center, { forecastDays: 4 });
    const now = Date.now();
    if (Object.keys(snap.points).length === 0) {
      const prev = useTwinStore.getState().live;
      useTwinStore.setState({
        live: {
          ...prev,
          status: 'offline',
          points: isLiveFresh({ lastUpdated: prev.lastUpdated, status: 'ready' }, now) ? prev.points : {},
          errors: snap.errors,
          reason: snap.errors[0] ?? 'Open-Meteo returned no data.',
        },
      });
    } else {
      useTwinStore.setState({
        live: { status: 'ready', points: snap.points, weather: snap.weather, lastUpdated: now, errors: snap.errors, reason: null },
      });
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Starts live data once the grid exists, through a store subscription (not a timer that background-tab throttling
 * can delay), and refreshes on the interval, when the tab becomes visible again and when the grid changes.
 */
export function startLiveDataWhenReady(): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastKey = '';

  const maybeStart = () => {
    const { base } = useTwinStore.getState();
    if (!base) return;
    // A calibration replaces the base object but not the grid: only a new grid needs new live points.
    const key = `${base.gridSize}|${base.cells.length}|${base.geometrySource}`;
    if (key !== lastKey) {
      lastKey = key;
      void refreshLiveNow(true);
      if (!timer) timer = setInterval(() => void refreshLiveNow(false), LIVE_REFRESH_MINUTES * 60 * 1000);
    }
  };
  const unsub = useTwinStore.subscribe((s, prev) => {
    if (s.base !== prev.base) maybeStart();
  });
  const onVisible = () => {
    if (document.visibilityState === 'visible') void refreshLiveNow(false);
  };
  document.addEventListener('visibilitychange', onVisible);
  maybeStart();
  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onVisible);
    if (timer) clearInterval(timer);
  };
}

// ---- City-level estimate from the live points ----

import { calculateAqi, METHOD_MODEL, type AqiResult } from './cpcbAqi';
import { aqiForPoint, type HourlyValues } from './openMeteo';

/**
 * Hourly model series for the whole city: the mean over the distinct model grid points, hour by hour. An hour only
 * counts when every point has a value for that pollutant (nothing is filled in).
 */
export function cityHourly(points: Record<string, LiveAirPoint>): { times: number[]; hourly: HourlyValues } | null {
  const distinct = new Map<string, LiveAirPoint>();
  for (const p of Object.values(points)) distinct.set(`${p.grid[1].toFixed(3)},${p.grid[0].toFixed(3)}`, p);
  const list = [...distinct.values()];
  if (list.length === 0) return null;
  const times = list[0].times;
  if (!list.every((p) => p.times.length === times.length)) return null;
  const hourly = {} as HourlyValues;
  for (const pol of OM_POLLUTANTS as Pollutant[]) {
    hourly[pol] = times.map((_, i) => {
      let sum = 0;
      for (const p of list) {
        const v = p.hourly[pol][i];
        if (v === null || v === undefined) return null;
        sum += v;
      }
      return sum / list.length;
    });
  }
  return { times, hourly };
}

/** Estimated CPCB AQI for the city from CAMS model data (about 40 km resolution; not an official station AQI). */
export function cityAqiEstimate(points: Record<string, LiveAirPoint>, nowMs: number = Date.now()): AqiResult | null {
  const c = cityHourly(points);
  if (!c) return null;
  return aqiForPoint(c.times, c.hourly, nowMs).aqi;
}

export { calculateAqi, METHOD_MODEL };
