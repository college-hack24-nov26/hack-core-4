/**
 * What-if logic for the Industries panel. It acts on the MODELED sources of the prototype engine that lie in or
 * within 1 km of an estate or a mapped site. The dataset has estate boundaries and mapped sites but NO facility
 * emissions, so the intensity of every modeled source is an assumption, and this file says so wherever it reports.
 */
import type { BaseState, Industry, LonLat, ScenarioParams, Weather } from '../types';
import { makeScenarioIndustry } from './scenarioService';
import {
  EMISSION_SPECIES,
  distanceToAreaKm,
  type EmissionSpecies,
  type FuelFactor,
  type IndustryData,
  type MidcArea,
  type IndustrySite,
  type WeatherCase,
} from './industryData';
import { haversineKm } from '../utils/geo';

export const ASSUMPTION_NOTE =
  'Source intensities are assumptions: the industry dataset has MIDC boundaries and mapped sites but no facility emissions. The effect shown comes from the prototype engine.';

export type IndustryAction =
  | { kind: 'reduce'; percent: number }
  | { kind: 'shutdown' }
  | { kind: 'relocate'; to: LonLat };

export const NEAR_KM = 1;

/** Modeled sources in or within 1 km of an estate. */
export function modeledSourcesNearArea(base: BaseState, area: MidcArea, km = NEAR_KM): Industry[] {
  return base.industries.filter((i) => distanceToAreaKm(area, i.location) <= km);
}

/** Modeled sources within 1 km of a mapped site. */
export function modeledSourcesNearSite(base: BaseState, site: IndustrySite, km = NEAR_KM): Industry[] {
  return base.industries.filter((i) => haversineKm(i.location, site.location) <= km);
}

/** Parameters that apply the action to the given modeled sources (starting from `params`). */
export function applyIndustryAction(params: ScenarioParams, sources: Industry[], action: IndustryAction): ScenarioParams {
  if (sources.length === 0) return params;
  const ids = new Set(sources.map((s) => s.id));
  const overrides = { ...params.industryIntensityOverrides };
  switch (action.kind) {
    case 'reduce': {
      const f = Math.min(1, Math.max(0, action.percent / 100));
      for (const s of sources) {
        const current = overrides[s.id] ?? s.emissionIntensity;
        overrides[s.id] = Math.round(current * (1 - f) * 10) / 10;
      }
      return { ...params, industryIntensityOverrides: overrides };
    }
    case 'shutdown':
      return {
        ...params,
        removedIndustryIds: [...new Set([...params.removedIndustryIds, ...ids])],
      };
    case 'relocate': {
      const moved = sources.map((s) =>
        makeScenarioIndustry({
          name: `${s.name} (relocated)`,
          category: s.category,
          location: action.to,
          emissionIntensity: overrides[s.id] ?? s.emissionIntensity,
          controlEfficiency: s.controlEfficiency,
          mainPollutants: s.mainPollutants,
        }),
      );
      return {
        ...params,
        removedIndustryIds: [...new Set([...params.removedIndustryIds, ...ids])],
        addedIndustries: [...params.addedIndustries, ...moved],
      };
    }
  }
}

export interface FuelUse {
  fuel: string;
  /** in the unit of the factor's denominator: tonnes, kilolitres (KL) or m3 */
  quantity: number;
}

export interface EmissionEstimate {
  /** kg emitted per species; null when the source factor is missing for that species */
  kg: Record<EmissionSpecies, number | null>;
  /** fuels that were skipped, with the reason */
  skipped: string[];
  note: string;
}

/**
 * Emitted mass from fuel use with ARAI/TERI factors (source units preserved):
 * mass (kg) = quantity x kg per unit. Species with no factor stay null (never zero, never invented).
 */
export function estimateEmissions(uses: FuelUse[], factors: FuelFactor[]): EmissionEstimate {
  const kg: Record<EmissionSpecies, number | null> = { pm25: null, pm10: null, so2: null, nox: null, co: null, nmvoc: null };
  const skipped: string[] = [];
  for (const u of uses) {
    if (!(u.quantity > 0)) continue;
    const f = factors.find((x) => x.fuel === u.fuel);
    if (!f) {
      skipped.push(`${u.fuel}: no emission factor in the dataset`);
      continue;
    }
    for (const sp of EMISSION_SPECIES) {
      const per = f.kgPerUnit[sp];
      if (typeof per === 'number') kg[sp] = (kg[sp] ?? 0) + per * u.quantity;
    }
  }
  return {
    kg,
    skipped,
    note: 'Estimate = fuel quantity x ARAI/TERI emission factor for the Pune inventory. It excludes process emissions and abatement, and is not a reported emission.',
  };
}

/** ERA5 2024-25 seasonal weather case for an estate (modelled, not station data). null when the dataset has none. */
export function seasonalWeather(data: IndustryData, areaCode: number, season: string): { weather: Weather; case: WeatherCase } | null {
  const c = data.weatherCases.find((w) => w.areaCode === areaCode && w.season === season);
  if (!c) return null;
  const w = c.weather;
  const needed: Array<keyof Weather> = ['temperature', 'humidity', 'windSpeed', 'windDirection', 'rainfall', 'pressure'];
  if (!needed.every((k) => typeof w[k] === 'number')) return null;
  return { weather: w as Weather, case: c };
}

export function seasonsFor(data: IndustryData, areaCode: number): WeatherCase[] {
  return data.weatherCases.filter((w) => w.areaCode === areaCode);
}

/** District emission totals (2021 inventory) as one table; not allocated to estates or sites. */
export function districtTotals(data: IndustryData): Array<{ code: string; sector: string; tonnes: Partial<Record<EmissionSpecies, number | null>> }> {
  return data.districtEmissions.map((d) => ({ code: d.code, sector: d.sector, tonnes: d.tonnesPerYear }));
}
