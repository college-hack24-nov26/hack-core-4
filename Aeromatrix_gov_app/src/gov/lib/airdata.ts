/**
 * Zone-level air data for the Commissioner app, built ONLY from live Open-Meteo CAMS model data (CPCB AQI method) and
 * OpenStreetMap geometry. Nothing falls back to the prototype demo model: a zone with no model value is left out and
 * counted, never filled in.
 */
import { useMemo } from 'react';
import type { BaseState, GridCell, LonLat, Road } from '../../types';
import { useTwinStore } from '../../store/useTwinStore';
import { cityHourly, liveValue, zonePointId } from '../../services/liveData';
import type { LiveAirPoint } from '../../services/liveState';
import { aqiForPoint } from '../../services/openMeteo';
import { AQI_COLORS, METHOD_MODEL, aqiCategory, type AqiCategory, type AqiResult } from '../../services/cpcbAqi';
import { distanceToBBoxKm, haversineKm, polygonCentroid } from '../../utils/geo';
import { zoneLabel } from '../../utils/zones';
import { PUNE_LOCALITIES } from '../../data/geojson/puneLocalities';

export const CATEGORIES: AqiCategory[] = ['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe'];
export const categoryRank = (c: AqiCategory | null | undefined): number => (c ? CATEGORIES.indexOf(c) : -1);
export const CATEGORY_COLOR: Record<AqiCategory, string> = AQI_COLORS;
export const UNKNOWN_COLOR = '#9a8a80';
export const colorOf = (c: AqiCategory | null | undefined): string => (c ? CATEGORY_COLOR[c] : UNKNOWN_COLOR);
export const CATEGORY_FLOOR: Record<AqiCategory, number> = { Good: 0, Satisfactory: 51, Moderate: 101, Poor: 201, 'Very Poor': 301, Severe: 401 };

export type { AqiCategory };
export { aqiCategory };

export type PollutantKey = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';
export const POLLUTANT_KEYS: PollutantKey[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];
export const POLLUTANT_NAME: Record<PollutantKey, string> = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO₂', so2: 'SO₂', co: 'CO', o3: 'O₃' };
export const POLLUTANT_UNIT: Record<PollutantKey, string> = { pm25: 'µg/m³', pm10: 'µg/m³', no2: 'µg/m³', so2: 'µg/m³', co: 'mg/m³', o3: 'µg/m³' };

export type EvidenceKey = 'traffic' | 'industry' | 'dust';
export type Strength = 'Strong' | 'Moderate' | 'Weak';
export type Trend = 'up' | 'down' | 'flat';

export interface CauseEvidence {
  key: EvidenceKey;
  label: string;
  strength: Strength;
  evidence: string[];
}

export interface ForecastDay {
  /** YYYY-MM-DD in IST */
  date: string;
  hours: 24 | 48 | 72;
  aqi: number;
  category: AqiCategory;
  pm25: number | null;
}

export interface ZoneRow {
  id: string;
  place: string;
  location: LonLat;
  /** neighbouring zones that share one model grid point share this key */
  gridKey: string;
  aqi: number;
  category: AqiCategory;
  dominant: string | null;
  /** CPCB sub-index of each pollutant that entered the AQI, highest first */
  subindices: Array<{ pollutant: string; value: number; concentration: number }>;
  /** current model concentration of every pollutant that has a value (units in POLLUTANT_UNIT) */
  values: Partial<Record<PollutantKey, number>>;
  pm25: number | null;
  pm10: number | null;
  /** model hour the value is for (ms) */
  time: number;
  trend: Trend;
  trendPct: number;
  forecast: ForecastDay[];
  causes: CauseEvidence[];
}

/** Things no connected dataset can tell us (D6). Always listed next to the causes. */
export const NOT_ASSESSED = [
  'Construction sites (no registry or satellite layer is connected)',
  'Ready-mix concrete (RMC) plants (no dataset)',
  'Open waste burning (no dataset)',
  'Brick kilns (no dataset)',
];

export const TREND_THRESHOLD_PCT = 5;
export const MAJOR_ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary'];

const IST = 'Asia/Kolkata';
const istDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/**
 * A readable name for a zone: the locality inside it, otherwise its direction from the nearest locality ("East of
 * Hadapsar"). The grid label is the last resort.
 */
export function placeFor(cell: GridCell, names: Record<string, string>): string {
  if (names[cell.id]) return names[cell.id];
  let best: { name: string; center: LonLat } | null = null;
  let bestKm = Infinity;
  for (const l of PUNE_LOCALITIES) {
    const d = haversineKm(l.center, cell.center);
    if (d < bestKm) {
      bestKm = d;
      best = l;
    }
  }
  if (!best || bestKm > 7) return zoneLabel(cell, names);
  const dx = cell.center[0] - best.center[0];
  const dy = cell.center[1] - best.center[1];
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const dir = DIRECTIONS[Math.round(((bearing + 360) % 360) / 45) % 8];
  return `${dir[0].toUpperCase()}${dir.slice(1)} of ${best.name}`;
}

export const gridKeyOf =(p: LiveAirPoint): string => `${p.grid[1].toFixed(2)},${p.grid[0].toFixed(2)}`;

// ---- OSM evidence ----

/** Length (km) of a road that lies inside a bounding box: segments whose midpoint is inside. */
export function roadLengthInBounds(road: Road, b: GridCell['bounds']): number {
  let km = 0;
  for (const path of road.paths) {
    for (let i = 1; i < path.length; i++) {
      const mx = (path[i - 1][0] + path[i][0]) / 2;
      const my = (path[i - 1][1] + path[i][1]) / 2;
      if (mx >= b.west && mx <= b.east && my >= b.south && my <= b.north) km += haversineKm(path[i - 1], path[i]);
    }
  }
  return km;
}

export interface RoadInZone {
  road: Road;
  lengthKm: number;
}

/** Named major roads through a zone, longest stretch first (D6, and the road list for dust control). */
export function majorRoadsInZone(base: Pick<BaseState, 'roads'>, cell: GridCell, limit = 3, requireName = true): RoadInZone[] {
  const out: RoadInZone[] = [];
  for (const r of base.roads) {
    if (!r.roadClass || !MAJOR_ROAD_CLASSES.includes(r.roadClass)) continue;
    if (requireName && /^Unnamed /.test(r.name)) continue;
    const km = roadLengthInBounds(r, cell.bounds);
    if (km >= 0.2) out.push({ road: r, lengthKm: km });
  }
  return out.sort((a, b) => b.lengthKm - a.lengthKm || a.road.name.localeCompare(b.road.name)).slice(0, limit);
}

const NEAR_INDUSTRY_KM = 1.5;

/**
 * Likely-cause evidence for one zone. Traffic and industry come from mapped OSM features near the zone; dust comes from
 * the PM2.5/PM10 ratio of the model data. A cause with no evidence is simply absent. These are indicators, not an
 * apportionment of the pollution (D7).
 */
export function causeEvidence(base: BaseState, cell: GridCell, pm25: number | null, pm10: number | null): CauseEvidence[] {
  const out: CauseEvidence[] = [];
  if (base.geometrySource === 'osm') {
    const roads = majorRoadsInZone(base, cell, 5, false);
    const total = roads.reduce((a, r) => a + r.lengthKm, 0);
    const heavy = roads.filter((r) => r.road.roadClass === 'motorway' || r.road.roadClass === 'trunk').reduce((a, r) => a + r.lengthKm, 0);
    if (roads.length > 0 && total >= 0.5) {
      const strength: Strength = total >= 6 || heavy >= 2 ? 'Strong' : total >= 2.5 ? 'Moderate' : 'Weak';
      out.push({
        key: 'traffic',
        label: 'Road traffic',
        strength,
        evidence: [
          ...roads.slice(0, 3).map((r) => `${r.road.name} (${r.road.roadClass}) runs ${r.lengthKm.toFixed(1)} km through the area`),
          `${total.toFixed(1)} km of major road in the area`,
        ],
      });
    }

    const sources = base.industries.filter((i) => distanceToBBoxKm(i.location, cell.bounds) <= NEAR_INDUSTRY_KM);
    const areas = base.industrialAreas.filter((a) => {
      if (a.polygon.length === 0) return false;
      const c = polygonCentroid(a.polygon);
      return distanceToBBoxKm(c, cell.bounds) <= NEAR_INDUSTRY_KM || a.polygon.some((p) => distanceToBBoxKm(p, cell.bounds) === 0);
    });
    if (sources.length + areas.length > 0) {
      const n = sources.length + areas.length;
      const evidence = [
        ...sources.slice(0, 3).map((s) => `${s.name} (${s.category}), within ${NEAR_INDUSTRY_KM} km`),
        ...(areas.length > 0 ? [`${areas.length} industrial area${areas.length === 1 ? '' : 's'} in or near the area`] : []),
      ];
      out.push({ key: 'industry', label: 'Industry', strength: n >= 4 ? 'Strong' : n >= 2 ? 'Moderate' : 'Weak', evidence });
    }
  }

  if (pm25 !== null && pm10 !== null && pm10 > 0) {
    const ratio = pm25 / pm10;
    if (ratio < 0.55) {
      out.push({
        key: 'dust',
        label: 'Road and construction dust',
        strength: ratio < 0.35 ? 'Strong' : ratio < 0.45 ? 'Moderate' : 'Weak',
        evidence: [`PM2.5/PM10 is ${ratio.toFixed(2)}: a low ratio points to coarse dust from roads, soil and construction`],
      });
    }
  }
  return out;
}

// ---- zone rows ----

function meanOf(arr: Array<number | null>, from: number, to: number): number | null {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, from); i <= to && i < arr.length; i++) {
    const v = arr[i];
    if (v !== null && v !== undefined) (s += v), n++;
  }
  return n >= 2 ? s / n : null;
}

/** PM2.5 now against six hours earlier (3 h means), as a trend with its percentage. */
export function trendOf(point: LiveAirPoint, idx: number): { trend: Trend; pct: number } {
  const series = point.hourly.pm25;
  const now = meanOf(series, idx - 2, idx);
  const before = meanOf(series, idx - 8, idx - 6);
  if (now === null || before === null || before <= 0) return { trend: 'flat', pct: 0 };
  const pct = ((now - before) / before) * 100;
  return { trend: pct > TREND_THRESHOLD_PCT ? 'up' : pct < -TREND_THRESHOLD_PCT ? 'down' : 'flat', pct };
}

/** 24 / 48 / 72 h model outlook for one point's hourly series. A horizon the series does not reach is left out. */
export function forecastFor(times: number[], hourly: LiveAirPoint['hourly'], nowMs: number): ForecastDay[] {
  const out: ForecastDay[] = [];
  const lastEnd = times.length > 0 ? times[times.length - 1] * 1000 + 3_600_000 : 0;
  for (const h of [24, 48, 72] as const) {
    const t = nowMs + h * 3_600_000;
    if (t > lastEnd) continue;
    const { aqi, idx } = aqiForPoint(times, hourly, t);
    if (!aqi || aqi.value === null || idx < 0) continue;
    out.push({ date: istDay(t), hours: h, aqi: aqi.value, category: aqi.category ?? aqiCategory(aqi.value), pm25: hourly.pm25[idx] ?? null });
  }
  return out;
}

export interface ZoneBuild {
  rows: ZoneRow[];
  /** zones that have no usable model value right now */
  missing: number;
}

export function buildZoneRows(args: {
  base: BaseState;
  points: Record<string, LiveAirPoint>;
  placeNames: Record<string, string>;
  nowMs: number;
}): ZoneBuild {
  const { base, points, placeNames, nowMs } = args;
  const rows: ZoneRow[] = [];
  let missing = 0;
  for (const cell of base.cells) {
    const p = points[zonePointId(cell.id)];
    if (!p) {
      missing++;
      continue;
    }
    const { aqi, idx } = aqiForPoint(p.times, p.hourly, nowMs);
    if (!aqi || aqi.value === null || idx < 0) {
      missing++;
      continue;
    }
    const pm25 = liveValue(p, 'pm25', nowMs);
    const pm10 = liveValue(p, 'pm10', nowMs);
    const values: ZoneRow['values'] = {};
    for (const k of POLLUTANT_KEYS) {
      const v = liveValue(p, k, nowMs);
      if (v !== null) values[k] = v;
    }
    const t = trendOf(p, idx);
    rows.push({
      id: cell.id,
      place: placeFor(cell, placeNames),
      location: cell.center,
      gridKey: gridKeyOf(p),
      aqi: aqi.value,
      category: aqi.category ?? aqiCategory(aqi.value),
      dominant: aqi.dominant_pollutant,
      subindices: Object.entries(aqi.subindices)
        .map(([pollutant, s]) => ({ pollutant, value: s.value, concentration: s.concentration }))
        .sort((a, b) => b.value - a.value),
      values,
      pm25,
      pm10,
      time: p.times[idx] * 1000,
      trend: t.trend,
      trendPct: t.pct,
      forecast: forecastFor(p.times, p.hourly, nowMs),
      causes: causeEvidence(base, cell, pm25, pm10),
    });
  }
  return { rows, missing };
}

// ---- city ----

export interface CitySummary {
  aqi: AqiResult;
  value: number;
  category: AqiCategory;
  pm25: number | null;
  pm10: number | null;
  method: string;
  asOf: number;
  forecast: ForecastDay[];
}

/** The honest city aggregate: the mean of the distinct model grid points, hour by hour. */
export function buildCitySummary(points: Record<string, LiveAirPoint>, nowMs: number): CitySummary | null {
  const c = cityHourly(points);
  if (!c) return null;
  const { aqi, idx } = aqiForPoint(c.times, c.hourly, nowMs);
  if (!aqi || aqi.value === null || idx < 0) return null;
  return {
    aqi,
    value: aqi.value,
    category: aqi.category ?? aqiCategory(aqi.value),
    pm25: c.hourly.pm25[idx] ?? null,
    pm10: c.hourly.pm10[idx] ?? null,
    method: `${METHOD_MODEL}. Mean of the distinct model grid points covering the city (about 40 km resolution).`,
    asOf: c.times[idx] * 1000,
    forecast: forecastFor(c.times, c.hourly, nowMs),
  };
}

// ---- hook ----

export interface AirData {
  status: 'idle' | 'loading' | 'ready' | 'offline';
  reason: string | null;
  zones: ZoneRow[];
  missingZones: number;
  city: CitySummary | null;
  lastUpdated: number | null;
}

/** Live zone rows and the city summary. Re-derived when the live data or the geometry changes. */
export function useAirData(): AirData {
  const base = useTwinStore((s) => s.base);
  const live = useTwinStore((s) => s.live);
  const placeNames = useTwinStore((s) => s.placeNames);
  return useMemo(() => {
    const now = Date.now();
    if (!base || Object.keys(live.points).length === 0) {
      return { status: live.status, reason: live.reason, zones: [], missingZones: base?.cells.length ?? 0, city: null, lastUpdated: live.lastUpdated };
    }
    const built = buildZoneRows({ base, points: live.points, placeNames, nowMs: now });
    return { status: live.status, reason: live.reason, zones: built.rows, missingZones: built.missing, city: buildCitySummary(live.points, now), lastUpdated: live.lastUpdated };
    // `live.lastUpdated` changes whenever new points arrive; the current hour moves slowly enough that a refresh re-derives it.
  }, [base, live, placeNames]);
}

/** One representative zone per model grid point (neighbouring zones often share a value). */
export function groupByGrid(zones: ZoneRow[]): Array<{ zone: ZoneRow; sharing: number }> {
  const groups = new Map<string, ZoneRow[]>();
  for (const z of zones) {
    const g = groups.get(z.gridKey);
    if (g) g.push(z);
    else groups.set(z.gridKey, [z]);
  }
  return [...groups.values()].map((g) => ({ zone: g[0], sharing: g.length - 1 }));
}
