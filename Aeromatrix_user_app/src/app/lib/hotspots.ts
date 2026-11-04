/**
 * Hotspots: two rankings that are never blended. Areas use the live model estimate (one entry per model grid point,
 * because neighbouring areas often share a value); stations use their last reading, with its date. Either can be ranked
 * by the overall AQI or by the concentration of one pollutant.
 */
import { useMemo } from 'react';
import type { LonLat } from '../../types';
import { POLLUTANT_NAME, POLLUTANT_UNIT, groupByGrid, useAirData, type AqiCategory, type CauseEvidence, type PollutantKey, type Trend, type ZoneRow } from './airdata';
import { useStations, type StationRow } from './stations';

export type HotspotKind = 'zone' | 'station';

/** What a list is ranked by: the overall AQI, or the concentration of one pollutant. */
export type Metric = 'aqi' | PollutantKey;

export interface Hotspot {
  /** zone:<cell id> or station:<station id> */
  id: string;
  kind: HotspotKind;
  name: string;
  subtitle: string;
  location: LonLat;
  aqi: number | null;
  category: AqiCategory | null;
  dominant: string | null;
  pm25: number | null;
  /** the value the list is ranked by, with its unit (AQI has none) */
  metricValue: number | null;
  metricUnit: string;
  metricLabel: string;
  trend: Trend;
  trendPct: number;
  /** a station has one reading only, so its trend is unknown */
  trendKnown: boolean;
  /** when the value is from (ms) */
  asOf: number | null;
  /** a station reading that is not current */
  outdated: boolean;
  causes: CauseEvidence[];
  zone: ZoneRow | null;
  station: StationRow | null;
}

const metricInfo = (m: Metric) => ({ unit: m === 'aqi' ? '' : POLLUTANT_UNIT[m], label: m === 'aqi' ? 'AQI' : POLLUTANT_NAME[m] });

export function zoneHotspots(zones: ZoneRow[], metric: Metric = 'aqi'): Hotspot[] {
  const info = metricInfo(metric);
  return groupByGrid(zones)
    .map(({ zone, sharing }): Hotspot => ({
      id: `zone:${zone.id}`,
      kind: 'zone',
      name: zone.place,
      subtitle: sharing > 0 ? `Also covers ${sharing} nearby area${sharing === 1 ? '' : 's'}` : 'Area estimate',
      location: zone.location,
      aqi: zone.aqi,
      category: zone.category,
      dominant: zone.dominant,
      pm25: zone.pm25,
      metricValue: metric === 'aqi' ? zone.aqi : (zone.values[metric] ?? null),
      metricUnit: info.unit,
      metricLabel: info.label,
      trend: zone.trend,
      trendPct: zone.trendPct,
      trendKnown: true,
      asOf: zone.time,
      outdated: false,
      causes: zone.causes,
      zone,
      station: null,
    }))
    .filter((h) => h.metricValue !== null)
    .sort((a, b) => (b.metricValue ?? 0) - (a.metricValue ?? 0) || (b.aqi ?? 0) - (a.aqi ?? 0) || a.name.localeCompare(b.name));
}

/** Nearest zone to a point (its causes are the best available evidence for a station). */
export function nearestZone(zones: ZoneRow[], p: LonLat): ZoneRow | null {
  let best: ZoneRow | null = null;
  let bestD = Infinity;
  for (const z of zones) {
    const d = (z.location[0] - p[0]) ** 2 + (z.location[1] - p[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

export function stationHotspots(stations: StationRow[], zones: ZoneRow[], metric: Metric = 'aqi'): Hotspot[] {
  const info = metricInfo(metric);
  return stations
    .filter((s) => s.readings.length > 0)
    .map((s): Hotspot => {
      const zone = nearestZone(zones, [s.lon, s.lat]);
      const pm = s.readings.find((r) => r.key === 'pm25');
      const chosen = metric === 'aqi' ? null : s.readings.find((r) => r.key === metric);
      return {
        id: `station:${s.id}`,
        kind: 'station',
        name: s.name,
        subtitle: s.status === 'live' ? 'Station, current reading' : 'Station, last reading',
        location: [s.lon, s.lat],
        aqi: s.aqi?.value ?? null,
        category: s.aqi?.category ?? null,
        dominant: s.aqi?.dominant ?? null,
        pm25: pm?.value ?? null,
        metricValue: metric === 'aqi' ? (s.aqi?.value ?? null) : (chosen?.value ?? null),
        metricUnit: info.unit,
        metricLabel: info.label,
        trend: 'flat',
        trendPct: 0,
        trendKnown: false,
        asOf: s.lastReadingAt,
        outdated: s.status !== 'live',
        causes: zone?.causes ?? [],
        zone,
        station: s,
      };
    })
    .filter((h) => metric === 'aqi' || h.metricValue !== null)
    .sort((a, b) => (b.metricValue ?? -1) - (a.metricValue ?? -1) || (b.aqi ?? -1) - (a.aqi ?? -1) || (b.pm25 ?? -1) - (a.pm25 ?? -1) || a.name.localeCompare(b.name));
}

export interface HotspotSet {
  zones: Hotspot[];
  stations: Hotspot[];
  /** both lists one after the other, NOT ranked together */
  combined: Hotspot[];
}

export function useHotspots(metric: Metric = 'aqi'): HotspotSet {
  const air = useAirData();
  const st = useStations();
  return useMemo(() => {
    const zones = zoneHotspots(air.zones, metric);
    const stations = stationHotspots(st.placed, air.zones, metric);
    return { zones, stations, combined: [...zones, ...stations] };
  }, [air.zones, st.placed, metric]);
}
