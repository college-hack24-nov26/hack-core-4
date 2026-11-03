/**
 * Monitoring-station coordinates, in this order: station_locations from the model service (/regions, when the
 * coordinate is non-null), then the drop-in file public/data/station_coordinates_verified.json. If neither has a
 * coordinate the station is NOT drawn and the UI says why. "unlocated" rows are listed, never drawn.
 */
import type { ApiStation } from './aeromatrixApi';

export const VERIFIED_STATIONS_URL = '/data/station_coordinates_verified.json';

export interface VerifiedStation {
  station: string;
  name: string;
  agency: string;
  city: string;
  latitude: number;
  longitude: number;
  sources: string[];
  single_source?: boolean;
  note?: string;
}

export interface UnlocatedStation {
  name: string;
  reason: string;
}

export interface VerifiedStationFile {
  _about?: string;
  _sources?: Record<string, string>;
  stations: VerifiedStation[];
  unlocated: UnlocatedStation[];
}

export type VerifiedLoad =
  | { status: 'loaded'; file: VerifiedStationFile }
  | { status: 'not-loaded'; reason: string };

export type CoordSource = 'service' | 'verified';

export interface PlacedStation {
  id: string;
  name: string;
  agency: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  coordSource: CoordSource | null;
  /** names of the sources a verified coordinate was read from */
  sources: string[];
  singleSource: boolean;
  note: string | null;
  /** the model-service entry, when the service knows this station (it has a data feed) */
  api: ApiStation | null;
}

export interface StationCatalog {
  stations: PlacedStation[];
  unlocated: UnlocatedStation[];
  /** why nothing can be drawn, when that is the case */
  notice: string | null;
  sourcesText: Record<string, string>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

function validFile(x: unknown): x is VerifiedStationFile {
  return !!x && typeof x === 'object' && Array.isArray((x as VerifiedStationFile).stations);
}

/** Reads the drop-in file; a missing file (404 or HTML fallback) is a normal "not loaded" state. */
export async function loadVerifiedStations(url: string = VERIFIED_STATIONS_URL): Promise<VerifiedLoad> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    return { status: 'not-loaded', reason: 'The verified station coordinate file could not be read.' };
  }
  if (!res.ok) return { status: 'not-loaded', reason: 'The sourced station coordinate list (station_coordinates_verified.json) is not loaded.' };
  try {
    const json: unknown = await res.json();
    if (!validFile(json)) return { status: 'not-loaded', reason: 'station_coordinates_verified.json is not in the expected format.' };
    return { status: 'loaded', file: { ...json, unlocated: Array.isArray(json.unlocated) ? json.unlocated : [] } };
  } catch {
    return { status: 'not-loaded', reason: 'The sourced station coordinate list (station_coordinates_verified.json) is not loaded.' };
  }
}

const keysOf = (s: { station?: string; name?: string; station_name?: string; aliases?: string[] }) =>
  [s.station, s.name, s.station_name, ...(s.aliases ?? [])].filter((x): x is string => !!x).map(norm);

/** Merge service stations with the verified file into one catalog. */
export function buildStationCatalog(apiStations: ApiStation[], verified: VerifiedLoad | null): StationCatalog {
  const file = verified?.status === 'loaded' ? verified.file : null;
  const used = new Set<string>();
  const out: PlacedStation[] = [];

  for (const api of apiStations) {
    const keys = new Set(keysOf(api));
    const v = file?.stations.find((s) => keysOf(s).some((k) => keys.has(k)));
    if (v) used.add(v.station);
    const svc = typeof api.latitude === 'number' && typeof api.longitude === 'number';
    out.push({
      id: api.station,
      name: api.name,
      agency: v?.agency ?? null,
      city: v?.city ?? null,
      lat: svc ? (api.latitude as number) : (v?.latitude ?? null),
      lon: svc ? (api.longitude as number) : (v?.longitude ?? null),
      coordSource: svc ? 'service' : v ? 'verified' : null,
      sources: v?.sources ?? [],
      singleSource: !!v?.single_source,
      note: v?.note ?? null,
      api,
    });
  }
  // Verified stations the service does not know: drawn, but with no data feed.
  for (const v of file?.stations ?? []) {
    if (used.has(v.station)) continue;
    out.push({
      id: v.station,
      name: v.name,
      agency: v.agency,
      city: v.city,
      lat: v.latitude,
      lon: v.longitude,
      coordSource: 'verified',
      sources: v.sources,
      singleSource: !!v.single_source,
      note: v.note ?? null,
      api: null,
    });
  }

  const placed = out.filter((s) => s.lat !== null && s.lon !== null).length;
  let notice: string | null = null;
  if (out.length === 0) {
    notice = verified?.status === 'not-loaded' ? `${verified.reason} The model service is not reporting stations either, so no station is drawn.` : 'No stations are known yet.';
  } else if (placed === 0) {
    notice = `The model service gave no coordinates and ${verified?.status === 'not-loaded' ? 'the sourced coordinate list is not loaded' : 'the sourced list has none for these stations'}, so no station is drawn.`;
  }
  return { stations: out, unlocated: file?.unlocated ?? [], notice, sourcesText: file?._sources ?? {} };
}

/** Stations that can be drawn. */
export const placedStations = (c: StationCatalog) => c.stations.filter((s) => s.lat !== null && s.lon !== null);
