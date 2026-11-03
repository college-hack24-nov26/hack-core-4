/**
 * Real city geometry from OpenStreetMap.
 *
 * Only GEOMETRY is real (road lines, parks/forests, industrial zones). Everything derived from it is a
 * documented DEMO assumption: road volumes are a PROXY from the road class, and the emission point sources
 * placed on the largest industrial zones carry DEMO intensities.
 */
import type { CityGeometry, GreenArea, IndustrialArea, Industry, IndustryCategory, LonLat, Pollutant, Road } from '../types';
import { pathLengthKm, polygonAreaKm2, polygonCentroid } from '../utils/geo';
import { hashSeed } from '../utils/prng';
import { PUNE } from '../data/geojson/puneDemoGeometry';

export const OSM_ATTRIBUTION = 'OSM data (c) OpenStreetMap contributors, ODbL 1.0';
export const SNAPSHOT_URL = '/data/pune-osm-snapshot.json';

/** PROXY: road volume (0-100) assumed from the OSM highway class. Not a traffic count. */
export const ROAD_VOLUME_PROXY: Record<string, number> = {
  motorway: 95,
  trunk: 88,
  primary: 72,
  secondary: 52,
};

const MIN_GREEN_KM2 = 0.006;
const MIN_INDUSTRIAL_KM2 = 0.02;
const MIN_ROAD_KM = 0.8;
const MAX_POINT_SOURCES = 12;

export interface OsmElement {
  id: number;
  kind: 'road' | 'green' | 'industrial';
  tags: Record<string, string>;
  coords: LonLat[];
}

export interface OsmSnapshot {
  meta?: { generated?: string; attribution?: string; license?: string };
  elements: OsmElement[];
}

export interface OsmLoadResult {
  geometry: CityGeometry;
  generated: string | null;
  attribution: string;
}

const CATEGORIES: IndustryCategory[] = ['Manufacturing', 'Chemical', 'Power', 'Metal', 'Processing'];
const CATEGORY_POLLUTANTS: Record<IndustryCategory, Pollutant[]> = {
  Manufacturing: ['pm25', 'pm10', 'no2'],
  Chemical: ['pm25', 'so2', 'no2'],
  Power: ['pm25', 'so2', 'no2'],
  Metal: ['pm25', 'pm10', 'so2'],
  Processing: ['pm25', 'pm10'],
};

const roadKey = (el: OsmElement) => `${el.tags.name ?? el.tags.ref ?? `way-${el.id}`}|${el.tags.highway}`;

/** Convert simplified OSM elements into engine geometry. */
export function elementsToGeometry(elements: OsmElement[]): CityGeometry {
  const groups = new Map<string, Road>();
  for (const el of elements) {
    if (el.kind !== 'road') continue;
    const cls = el.tags.highway;
    const volume = ROAD_VOLUME_PROXY[cls];
    if (volume === undefined || el.coords.length < 2) continue;
    const key = roadKey(el);
    let road = groups.get(key);
    if (!road) {
      road = {
        id: `osm-road-${el.id}`,
        name: el.tags.name ?? el.tags.ref ?? `Unnamed ${cls} road`,
        volume,
        paths: [],
        roadClass: cls,
        lengthKm: 0,
      };
      groups.set(key, road);
    }
    road.paths.push(el.coords);
    road.lengthKm = (road.lengthKm ?? 0) + pathLengthKm(el.coords);
  }
  const roads = [...groups.values()]
    .filter((r) => (r.lengthKm ?? 0) >= MIN_ROAD_KM)
    .map((r) => ({ ...r, lengthKm: Math.round((r.lengthKm ?? 0) * 100) / 100 }))
    .sort((a, b) => b.volume - a.volume || (b.lengthKm ?? 0) - (a.lengthKm ?? 0));

  const greenAreas: GreenArea[] = [];
  const industrialAreas: IndustrialArea[] = [];
  for (const el of elements) {
    if (el.kind === 'green') {
      greenAreas.push({ id: `osm-green-${el.id}`, name: el.tags.name ?? 'Green area', polygon: el.coords });
    } else if (el.kind === 'industrial') {
      industrialAreas.push({ id: `osm-ind-${el.id}`, name: el.tags.name ?? 'Industrial zone', polygon: el.coords });
    }
  }

  // Emission point sources on the largest industrial zones. Intensities are DEMO assumptions.
  const largest = [...industrialAreas]
    .map((z) => ({ z, area: polygonAreaKm2(z.polygon) }))
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_POINT_SOURCES);
  const industries: Industry[] = largest.map(({ z, area }, i) => {
    const h = hashSeed(z.id);
    const category = CATEGORIES[h % CATEGORIES.length];
    const intensity = Math.round(28 + 57 * (1 - Math.exp(-area / 0.6)));
    return {
      id: `osm-industry-${z.id.replace('osm-ind-', '')}`,
      name: z.name === 'Industrial zone' ? `Industrial area ${i + 1}` : z.name,
      category,
      location: polygonCentroid(z.polygon),
      emissionIntensity: intensity,
      controlEfficiency: Math.round((0.45 + (h % 30) / 100) * 100) / 100,
      mainPollutants: CATEGORY_POLLUTANTS[category],
      emissionProfile: 'Assumed source placed on a mapped industrial zone',
      status: 'Assumed source (mapped industrial zone)',
    };
  });

  return { source: 'osm', roads, greenAreas, industrialAreas, industries };
}

export function geometryCounts(g: CityGeometry) {
  return {
    roads: g.roads.length,
    roadKm: Math.round(g.roads.reduce((a, r) => a + (r.lengthKm ?? 0), 0)),
    green: g.greenAreas.length,
    industrialZones: g.industrialAreas.length,
    industries: g.industries.length,
  };
}

/** Bundled snapshot: works offline. Throws a readable error when the file is absent. */
export async function loadOsmSnapshot(url: string = SNAPSHOT_URL): Promise<OsmLoadResult> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    throw new Error('OSM snapshot not available (could not read the bundled file).');
  }
  if (!res.ok) throw new Error(`OSM snapshot not available (HTTP ${res.status}).`);
  let data: OsmSnapshot;
  try {
    data = (await res.json()) as OsmSnapshot;
  } catch {
    throw new Error('OSM snapshot not available (the bundled file is missing or unreadable).');
  }
  if (!data || !Array.isArray(data.elements) || data.elements.length === 0) {
    throw new Error('OSM snapshot not available (the bundled file has no features).');
  }
  return {
    geometry: elementsToGeometry(data.elements),
    generated: data.meta?.generated ?? null,
    attribution: data.meta?.attribution ?? OSM_ATTRIBUTION,
  };
}

// ---- Live Overpass ----

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export function overpassQuery(): string {
  const { south, west, north, east } = { ...PUNE.bbox };
  const b = `${south},${west},${north},${east}`;
  return `[out:json][timeout:90];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](${b});
  way["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"](${b});
  way["landuse"~"^(forest|grass|recreation_ground|village_green|meadow|orchard)$"](${b});
  way["natural"~"^(wood|scrub|grassland)$"](${b});
  way["landuse"="industrial"](${b});
);
out geom tags;`;
}

interface OverpassWay {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

const isClosed = (c: LonLat[]) => c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];

/** Overpass JSON -> simplified elements (same filters as the snapshot script). */
export function overpassToElements(json: { elements?: OverpassWay[] }): OsmElement[] {
  const out: OsmElement[] = [];
  const roadLength = new Map<string, number>();
  for (const el of json.elements ?? []) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const t = el.tags ?? {};
    const coords: LonLat[] = el.geometry.map((p) => [p.lon, p.lat]);
    const tags: Record<string, string> = {};
    for (const k of ['name', 'ref', 'highway', 'leisure', 'landuse', 'natural']) if (t[k]) tags[k] = t[k];
    if (t.highway) {
      const e: OsmElement = { id: el.id, kind: 'road', tags, coords };
      out.push(e);
      const key = roadKey(e);
      roadLength.set(key, (roadLength.get(key) ?? 0) + pathLengthKm(coords));
    } else if (t.landuse === 'industrial') {
      if (isClosed(coords) && polygonAreaKm2(coords) >= MIN_INDUSTRIAL_KM2) out.push({ id: el.id, kind: 'industrial', tags, coords });
    } else if (isClosed(coords) && polygonAreaKm2(coords) >= MIN_GREEN_KM2) {
      out.push({ id: el.id, kind: 'green', tags, coords });
    }
  }
  return out.filter((e) => e.kind !== 'road' || (roadLength.get(roadKey(e)) ?? 0) >= MIN_ROAD_KM);
}

/** Live Overpass query with timeout and retry across mirrors. */
export async function fetchOsmGeometry(
  mirrors: string[] = MIRRORS,
  timeoutMs = 60000,
  retryDelayMs = 800,
): Promise<OsmLoadResult> {
  const errors: string[] = [];
  let busy = false;
  for (const url of mirrors) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(overpassQuery()),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 429 || res.status === 504 || res.status === 503) {
          busy = true;
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { elements?: OverpassWay[] };
        const elements = overpassToElements(json);
        if (elements.length === 0) throw new Error('no features returned');
        return { geometry: elementsToGeometry(elements), generated: new Date().toISOString(), attribution: OSM_ATTRIBUTION };
      } catch (e) {
        errors.push(`${new URL(url).host}: ${e instanceof Error ? e.message : 'failed'}`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }
  }
  throw new Error(
    busy
      ? 'The Overpass API is busy right now. Try again in a minute, or use the bundled snapshot.'
      : `Could not reach the Overpass API (${errors.slice(-2).join('; ')}). Check your connection or use the bundled snapshot.`,
  );
}
