/**
 * Industry dataset loader. public/data/industry/industry_data.json is a DROP-IN file (it is not created by this app):
 * when it is missing (HTTP 404 or an HTML fallback page) the loader returns a typed "not loaded" state and every
 * consumer shows an honest message and disables the MIDC / industry-site layers.
 *
 * File contents: MIDC industrial estates (boundaries and plot status, not a company or emissions registry), partial
 * OSM industry points (candidate sites, not a verified factory list), ARAI/TERI fuel emission factors, a 2021 district
 * emission inventory (not allocated to estates or sites) and ERA5 2024-25 seasonal weather cases (modelled).
 */
import type { LonLat, Weather } from '../types';
import { distanceToPathKm, pointInPolygon } from '../utils/geo';

export const INDUSTRY_DATA_URL = '/data/industry/industry_data.json';

export type EmissionSpecies = 'pm10' | 'pm25' | 'so2' | 'nox' | 'co' | 'nmvoc';
export const EMISSION_SPECIES: EmissionSpecies[] = ['pm25', 'pm10', 'so2', 'nox', 'co', 'nmvoc'];
export const SPECIES_LABEL: Record<EmissionSpecies, string> = { pm25: 'PM2.5', pm10: 'PM10', so2: 'SO2', nox: 'NOx', co: 'CO', nmvoc: 'NMVOC' };

export type GeoRings = LonLat[][]; // outer rings only (holes are ignored for matching)

export interface MidcArea {
  code: number;
  name: string;
  category: string | null;
  fieldType: string | null;
  district: string | null;
  areaHa: number | null;
  mappedAreaHa: number | null;
  plots: Record<string, number> | null;
  centroid: LonLat | null;
  bbox: { west: number; south: number; east: number; north: number } | null;
  /** how much of the estate lies in the analysis area: inside | partial | outside */
  analysisArea: string;
  era5: boolean;
  /** outer rings of the boundary */
  rings: GeoRings;
}

export interface IndustrySite {
  id: string;
  name: string;
  kind: string;
  operator: string | null;
  location: LonLat;
  midcCode: number | null;
  inAnalysisArea: boolean;
}

export interface FuelFactor {
  fuel: string;
  /** source units are preserved, e.g. "kg/tonnes" or "kg/KL" */
  denominator: string;
  kgPerUnit: Partial<Record<EmissionSpecies, number | null>>;
}

export interface DistrictSector {
  code: string;
  sector: string;
  tonnesPerYear: Partial<Record<EmissionSpecies, number | null>>;
}

export type Season = 'winter' | 'premonsoon' | 'monsoon' | 'postmonsoon';
export const SEASON_LABEL: Record<Season, string> = {
  winter: 'Winter (Dec-Feb)',
  premonsoon: 'Pre-monsoon',
  monsoon: 'Monsoon',
  postmonsoon: 'Post-monsoon',
};

export interface WeatherCase {
  areaCode: number;
  areaName: string;
  season: string;
  label: string;
  hours: number;
  weather: Partial<Weather>;
}

export interface IndustryData {
  version: number | null;
  builtAt: string | null;
  provenance: Record<string, string | number>;
  warnings: string[];
  areas: MidcArea[];
  sites: IndustrySite[];
  emissionFactors: FuelFactor[];
  districtEmissions: DistrictSector[];
  weatherCases: WeatherCase[];
}

export type IndustryLoad = { status: 'loaded'; data: IndustryData } | { status: 'not-loaded'; reason: string };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string | null => (typeof x === 'string' ? x : null);
const lonlat = (x: unknown): LonLat | null =>
  Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number' ? [x[0], x[1]] : null;

/** Outer rings of a GeoJSON Polygon / MultiPolygon. */
export function ringsOf(geometry: unknown): GeoRings {
  if (!isObj(geometry)) return [];
  const toRing = (r: unknown): LonLat[] => (Array.isArray(r) ? r.map(lonlat).filter((p): p is LonLat => p !== null) : []);
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    const outer = toRing(geometry.coordinates[0]);
    return outer.length >= 3 ? [outer] : [];
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.map((poly) => toRing(Array.isArray(poly) ? poly[0] : null)).filter((r) => r.length >= 3);
  }
  return [];
}

/** Validate and normalise the raw JSON. Returns null when it does not look like the industry dataset at all. */
export function normaliseIndustryData(raw: unknown): IndustryData | null {
  if (!isObj(raw) || !Array.isArray(raw.areas) || !Array.isArray(raw.sites)) return null;
  const areas: MidcArea[] = [];
  for (const a of raw.areas) {
    if (!isObj(a) || num(a.code) === null || !str(a.name)) continue;
    const bbox = isObj(a.bbox) && num(a.bbox.west) !== null && num(a.bbox.south) !== null && num(a.bbox.east) !== null && num(a.bbox.north) !== null
      ? { west: a.bbox.west as number, south: a.bbox.south as number, east: a.bbox.east as number, north: a.bbox.north as number }
      : null;
    areas.push({
      code: a.code as number,
      name: a.name as string,
      category: str(a.category),
      fieldType: str(a.fieldType),
      district: str(a.district),
      areaHa: num(a.areaHa),
      mappedAreaHa: num(a.mappedAreaHa),
      plots: isObj(a.plots) ? (a.plots as Record<string, number>) : null,
      centroid: lonlat(a.centroid),
      bbox,
      analysisArea: str(a.analysisArea) ?? 'outside',
      era5: a.era5 === true,
      rings: ringsOf(a.geometry),
    });
  }
  const sites: IndustrySite[] = [];
  for (const s of raw.sites) {
    if (!isObj(s)) continue;
    const loc = lonlat(s.location);
    if (!loc || !str(s.id)) continue;
    sites.push({
      id: s.id as string,
      name: str(s.name) ?? 'Unnamed site',
      kind: str(s.kind) ?? 'industrial',
      operator: str(s.operator),
      location: loc,
      midcCode: num(s.midcCode),
      inAnalysisArea: s.inAnalysisArea === true,
    });
  }
  const factors: FuelFactor[] = Array.isArray(raw.emissionFactors)
    ? raw.emissionFactors.filter(isObj).filter((f) => str(f.fuel) && isObj(f.kgPerUnit)).map((f) => ({
        fuel: f.fuel as string,
        denominator: str(f.denominator) ?? '',
        kgPerUnit: f.kgPerUnit as FuelFactor['kgPerUnit'],
      }))
    : [];
  const district: DistrictSector[] = Array.isArray(raw.districtEmissions)
    ? raw.districtEmissions.filter(isObj).filter((d) => str(d.code) && isObj(d.tonnesPerYear)).map((d) => ({
        code: d.code as string,
        sector: str(d.sector) ?? (d.code as string),
        tonnesPerYear: d.tonnesPerYear as DistrictSector['tonnesPerYear'],
      }))
    : [];
  const cases: WeatherCase[] = Array.isArray(raw.weatherCases)
    ? raw.weatherCases.filter(isObj).filter((w) => num(w.areaCode) !== null && str(w.season) && isObj(w.weather)).map((w) => ({
        areaCode: w.areaCode as number,
        areaName: str(w.areaName) ?? '',
        season: w.season as string,
        label: str(w.label) ?? (w.season as string),
        hours: num(w.hours) ?? 0,
        weather: w.weather as Partial<Weather>,
      }))
    : [];
  return {
    version: num(raw.version),
    builtAt: str(raw.builtAt),
    provenance: isObj(raw.provenance) ? (raw.provenance as Record<string, string | number>) : {},
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
    areas,
    sites,
    emissionFactors: factors,
    districtEmissions: district,
    weatherCases: cases,
  };
}

/** Loads the drop-in file. Missing file, HTML fallback or bad JSON all give a "not loaded" state with the reason. */
export async function loadIndustryData(url: string = INDUSTRY_DATA_URL): Promise<IndustryLoad> {
  const notLoaded = (reason: string): IndustryLoad => ({ status: 'not-loaded', reason });
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-cache' });
  } catch {
    return notLoaded('Industry dataset not loaded (the file could not be read).');
  }
  if (!res.ok) return notLoaded('Industry dataset not loaded.');
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return notLoaded('Industry dataset not loaded.');
  }
  const data = normaliseIndustryData(json);
  if (!data) return notLoaded('Industry dataset not loaded: the file is not in the expected format.');
  return { status: 'loaded', data };
}

export function areaContains(area: MidcArea, p: LonLat): boolean {
  return area.rings.some((r) => pointInPolygon(p, r));
}

/** Distance from a point to an estate: 0 inside, otherwise to the nearest boundary (km). Infinity without a boundary. */
export function distanceToAreaKm(area: MidcArea, p: LonLat): number {
  if (area.rings.length === 0) return Infinity;
  if (areaContains(area, p)) return 0;
  return Math.min(...area.rings.map((r) => distanceToPathKm(p, r)));
}

/** Items located in or within `km` of an estate (1 km by default). */
export function sourcesInOrNear<T extends { location: LonLat }>(area: MidcArea, items: T[], km = 1): T[] {
  return items.filter((i) => distanceToAreaKm(area, i.location) <= km);
}

/** Mapped industry sites that belong to an estate (by MIDC code) or lie inside its boundary. */
export function sitesInArea(data: IndustryData, area: MidcArea): IndustrySite[] {
  return data.sites.filter((s) => s.midcCode === area.code || areaContains(area, s.location));
}

export const midcInAnalysisArea = (data: IndustryData) => data.areas.filter((a) => a.analysisArea !== 'outside');
