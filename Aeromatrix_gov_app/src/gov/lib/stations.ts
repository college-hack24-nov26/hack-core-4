/**
 * Monitoring stations for the Commissioner app: the sourced coordinate list joined with the model-service readings.
 * A station is drawn only where a sourced coordinate exists. A station with no current reading is never given a
 * measured-looking value: its number, if any, is a labelled model estimate (D4).
 */
import { useMemo } from 'react';
import { useTwinStore } from '../../store/useTwinStore';
import { placePointId } from '../../services/liveData';
import { aqiForPoint } from '../../services/openMeteo';
import { aqiCategory, type AqiCategory } from '../../services/cpcbAqi';
import { API_POLLUTANT_LABEL, isMeasured, isMeasuredValue, isForecast, isPredicted, type ApiPollutantKey } from '../../services/aeromatrixApi';
import { liveValue } from '../../services/liveData';
import type { LiveAirPoint } from '../../services/liveState';
import type { ModelServiceState } from '../../services/modelService';
import type { PlacedStation, StationCatalog, UnlocatedStation } from '../../services/stations';
import { haversineKm } from '../../utils/geo';
import type { LonLat } from '../../types';

export const COVERAGE_RADIUS_KM = 3;
/** A reading older than this is not "current". */
export const CURRENT_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export type StationStatus = 'live' | 'outdated' | 'estimate' | 'no_feed';

export const STATUS_LABEL: Record<StationStatus, string> = {
  live: 'Measured',
  outdated: 'Outdated',
  estimate: 'Estimated',
  no_feed: 'No data feed',
};

export interface StationReading {
  key: ApiPollutantKey;
  label: string;
  value: number;
  unit: string;
  time: number;
}

export interface StationEstimate {
  aqi: number;
  category: AqiCategory;
  pm25: number | null;
  pm10: number | null;
  asOf: number;
}

export interface StationRow {
  id: string;
  name: string;
  agency: string | null;
  city: string | null;
  lat: number;
  lon: number;
  status: StationStatus;
  /** the service has this station (a data feed exists, even if its newest reading is old) */
  hasFeed: boolean;
  lastReadingAt: number | null;
  ageMs: number | null;
  readings: StationReading[];
  aqi: { value: number; category: AqiCategory; dominant: string | null; periodEnd: number | null; lowerBound: boolean } | null;
  /** model estimate for the station's location, shown when there is no current reading */
  estimate: StationEstimate | null;
  forecast: { pollutant: string; value: number; lower: number; upper: number; validAt: number; historical: boolean; kind: string } | null;
  coordSource: 'service' | 'verified' | null;
  sources: string[];
  singleSource: boolean;
  note: string | null;
}

export interface StationBuild {
  placed: StationRow[];
  notPlaced: UnlocatedStation[];
  /** why nothing can be drawn, when that is the case */
  notice: string | null;
  modelService: { status: ModelServiceState['status']; reason: string | null };
}

export const distKm = (a: LonLat, b: LonLat): number => haversineKm(a, b);

const ms = (iso: string | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

function readingsOf(measured: ModelServiceState['measured'][string] | undefined): StationReading[] {
  if (!measured || !isMeasured(measured)) return [];
  const out: StationReading[] = [];
  for (const [key, v] of Object.entries(measured.pollutants)) {
    if (!isMeasuredValue(v)) continue;
    const t = ms(v.time);
    if (t === null) continue;
    const k = key as ApiPollutantKey;
    out.push({ key: k, label: API_POLLUTANT_LABEL[k] ?? key, value: v.value, unit: v.unit, time: t });
  }
  return out.sort((a, b) => b.time - a.time);
}

function estimateOf(point: LiveAirPoint | undefined, nowMs: number): StationEstimate | null {
  if (!point) return null;
  const { aqi, idx } = aqiForPoint(point.times, point.hourly, nowMs);
  if (!aqi || aqi.value === null || idx < 0) return null;
  return {
    aqi: aqi.value,
    category: aqi.category ?? aqiCategory(aqi.value),
    pm25: liveValue(point, 'pm25', nowMs),
    pm10: liveValue(point, 'pm10', nowMs),
    asOf: point.times[idx] * 1000,
  };
}

export function buildStationRow(s: PlacedStation, svc: ModelServiceState, live: Record<string, LiveAirPoint>, nowMs: number): StationRow | null {
  if (s.lat === null || s.lon === null) return null;
  const measured = svc.measured[s.id];
  const readings = readingsOf(measured);
  const newest = readings.length > 0 ? readings[0].time : null;
  const historical = !!measured && isMeasured(measured) && measured.historical;
  const age = newest === null ? null : nowMs - newest;
  const current = newest !== null && !historical && age !== null && age <= CURRENT_MAX_AGE_MS;
  const estimate = estimateOf(live[placePointId(s.id)], nowMs);
  const status: StationStatus = readings.length > 0 ? (current ? 'live' : 'outdated') : estimate ? 'estimate' : 'no_feed';

  let aqi: StationRow['aqi'] = null;
  if (measured && isMeasured(measured) && measured.aqi && (measured.aqi.status === 'AVAILABLE' || measured.aqi.status === 'LOWER_BOUND') && typeof measured.aqi.value === 'number') {
    aqi = {
      value: measured.aqi.value,
      category: (measured.aqi.category as AqiCategory | null | undefined) ?? aqiCategory(measured.aqi.value),
      dominant: measured.aqi.dominant_pollutant ?? null,
      periodEnd: ms(measured.aqi.period_end),
      lowerBound: measured.aqi.status === 'LOWER_BOUND',
    };
  }

  let forecast: StationRow['forecast'] = null;
  const f = svc.forecasts[s.id];
  if (f && isForecast(f)) {
    const p = f.pollutants.pm25;
    if (isPredicted(p)) {
      forecast = { pollutant: 'PM2.5', value: p.value, lower: p.lower, upper: p.upper, validAt: ms(p.valid_at) ?? 0, historical: p.historical, kind: p.model.kind };
    }
  }

  return {
    id: s.id,
    name: s.name,
    agency: s.agency,
    city: s.city,
    lat: s.lat,
    lon: s.lon,
    status,
    hasFeed: s.api !== null && readings.length > 0,
    lastReadingAt: newest,
    ageMs: age,
    readings,
    aqi,
    estimate: status === 'live' ? null : estimate,
    forecast,
    coordSource: s.coordSource,
    sources: s.sources,
    singleSource: s.singleSource,
    note: s.note,
  };
}

export function buildStationRows(catalog: StationCatalog, svc: ModelServiceState, live: Record<string, LiveAirPoint>, nowMs: number): StationBuild {
  const placed: StationRow[] = [];
  for (const s of catalog.stations) {
    const r = buildStationRow(s, svc, live, nowMs);
    if (r) placed.push(r);
  }
  // Catalog stations with no coordinate are never drawn; they join the not-placed list.
  const noCoord = catalog.stations
    .filter((s) => s.lat === null || s.lon === null)
    .map((s): UnlocatedStation => ({ name: s.name, reason: 'The model service lists this station but gives no coordinate and the sourced list has none.' }));
  return {
    placed,
    notPlaced: [...catalog.unlocated, ...noCoord],
    notice: placed.length === 0 ? (catalog.notice ?? 'Station locations are not available.') : null,
    modelService: { status: svc.status, reason: svc.reason },
  };
}

export interface StationCounts {
  total: number;
  live: number;
  outdated: number;
  estimate: number;
  noFeed: number;
  notPlaced: number;
}

export function countStations(b: StationBuild): StationCounts {
  const c = { total: b.placed.length, live: 0, outdated: 0, estimate: 0, noFeed: 0, notPlaced: b.notPlaced.length };
  for (const s of b.placed) {
    if (s.status === 'live') c.live++;
    else if (s.status === 'outdated') c.outdated++;
    else if (s.status === 'estimate') c.estimate++;
    else c.noFeed++;
  }
  return c;
}

/** Stations ordered by distance from a point. */
export function nearestStations(stations: StationRow[], p: LonLat, limit = 3, maxKm = Infinity): Array<{ station: StationRow; km: number }> {
  return stations
    .map((station) => ({ station, km: distKm(p, [station.lon, station.lat]) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function useStations(): StationBuild {
  const catalog = useTwinStore((s) => s.catalog);
  const svc = useTwinStore((s) => s.modelService);
  const live = useTwinStore((s) => s.live);
  return useMemo(() => buildStationRows(catalog, svc, live.points, Date.now()), [catalog, svc, live.points]);
}
