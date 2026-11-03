/**
 * Hotspots: two honest rankings that are never blended. Zones use the live CAMS model estimate (one entry per model
 * grid point, because neighbouring zones often share a value); stations use their last reading, with its date.
 */
import { useMemo } from 'react';
import type { LonLat } from '../../types';
import { groupByGrid, useAirData, type AqiCategory, type CauseEvidence, type Trend, type ZoneRow } from './airdata';
import { useStations, type StationRow } from './stations';

export type HotspotKind = 'zone' | 'station';

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

export function zoneHotspots(zones: ZoneRow[]): Hotspot[] {
  return groupByGrid(zones)
    .map(({ zone, sharing }): Hotspot => ({
      id: `zone:${zone.id}`,
      kind: 'zone',
      name: zone.place,
      subtitle: sharing > 0 ? `CAMS model estimate; ${sharing} neighbouring zone${sharing === 1 ? '' : 's'} share this model value` : 'CAMS model estimate',
      location: zone.location,
      aqi: zone.aqi,
      category: zone.category,
      dominant: zone.dominant,
      pm25: zone.pm25,
      trend: zone.trend,
      trendPct: zone.trendPct,
      trendKnown: true,
      asOf: zone.time,
      outdated: false,
      causes: zone.causes,
      zone,
      station: null,
    }))
    .sort((a, b) => (b.aqi ?? 0) - (a.aqi ?? 0) || (b.pm25 ?? 0) - (a.pm25 ?? 0) || a.name.localeCompare(b.name));
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

export function stationHotspots(stations: StationRow[], zones: ZoneRow[]): Hotspot[] {
  return stations
    .filter((s) => s.readings.length > 0)
    .map((s): Hotspot => {
      const zone = nearestZone(zones, [s.lon, s.lat]);
      const pm = s.readings.find((r) => r.key === 'pm25');
      return {
        id: `station:${s.id}`,
        kind: 'station',
        name: s.name,
        subtitle: s.status === 'live' ? 'Monitoring station, current reading' : 'Monitoring station, last reading (outdated)',
        location: [s.lon, s.lat],
        aqi: s.aqi?.value ?? null,
        category: s.aqi?.category ?? null,
        dominant: s.aqi?.dominant ?? null,
        pm25: pm?.value ?? null,
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
    .sort((a, b) => (b.aqi ?? -1) - (a.aqi ?? -1) || (b.pm25 ?? -1) - (a.pm25 ?? -1) || a.name.localeCompare(b.name));
}

export interface HotspotSet {
  zones: Hotspot[];
  stations: Hotspot[];
  /** both lists one after the other, NOT ranked together */
  combined: Hotspot[];
}

export function useHotspots(): HotspotSet {
  const air = useAirData();
  const st = useStations();
  return useMemo(() => {
    const zones = zoneHotspots(air.zones);
    const stations = stationHotspots(st.placed, air.zones);
    return { zones, stations, combined: [...zones, ...stations] };
  }, [air.zones, st.placed]);
}
