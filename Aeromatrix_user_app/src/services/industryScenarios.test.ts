import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { defaultParams, runScenario } from './scenarioService';
import { normaliseIndustryData } from './industryData';
import {
  ASSUMPTION_NOTE,
  applyIndustryAction,
  districtTotals,
  estimateEmissions,
  modeledSourcesNearArea,
  modeledSourcesNearSite,
  seasonalWeather,
  seasonsFor,
} from './industryScenarios';
import { FIXTURE } from './__fixtures__/industryFixture';

let base: BaseState;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

/** An estate drawn around one of the modeled sources of the demo city (+/- 0.3 km). */
function estateAround(i: number) {
  const s = base.industries[i];
  const d = 0.003;
  const data = normaliseIndustryData({
    ...FIXTURE,
    areas: [{ code: 900, name: 'Around source', analysisArea: 'inside', era5: true, geometry: { type: 'Polygon', coordinates: [[[s.location[0] - d, s.location[1] - d], [s.location[0] + d, s.location[1] - d], [s.location[0] + d, s.location[1] + d], [s.location[0] - d, s.location[1] + d], [s.location[0] - d, s.location[1] - d]]] } }],
    sites: [{ id: 'node/9', name: 'On source', kind: 'works', location: s.location, midcCode: null, inAnalysisArea: true }],
    weatherCases: FIXTURE.weatherCases.map((w) => ({ ...w, areaCode: 900 })),
  })!;
  return { source: s, data, area: data.areas[0] };
}

describe('modeled sources near an estate or site', () => {
  it('finds the sources in or within 1 km, and only those', () => {
    const { source, area, data } = estateAround(0);
    const near = modeledSourcesNearArea(base, area).map((s) => s.id);
    expect(near).toContain(source.id);
    expect(near.length).toBeLessThan(base.industries.length);
    expect(modeledSourcesNearSite(base, data.sites[0]).map((s) => s.id)).toContain(source.id);
    expect(modeledSourcesNearSite(base, { ...data.sites[0], location: [73.75, 18.45] })).toEqual([]);
  });
});

describe('applyIndustryAction', () => {
  const ctx = () => estateAround(1);
  const near = () => modeledSourcesNearArea(base, ctx().area);

  it('reduces the modeled sources and lowers PM2.5 downwind', () => {
    const p = applyIndustryAction(defaultParams(base), near(), { kind: 'reduce', percent: 50 });
    const source = ctx().source;
    expect(p.industryIntensityOverrides[source.id]).toBeCloseTo(source.emissionIntensity / 2, 1);
    const r = runScenario(base, p);
    expect(r.summary.meanDelta).toBeLessThan(0);
  });

  it('shuts them down (removed, none left to re-add)', () => {
    const p = applyIndustryAction(defaultParams(base), near(), { kind: 'shutdown' });
    expect(p.removedIndustryIds).toContain(ctx().source.id);
    expect(runScenario(base, p).summary.meanDelta).toBeLessThan(0);
  });

  it('relocates them to a chosen point as scenario industries', () => {
    const to: [number, number] = [73.972, 18.448];
    const p = applyIndustryAction(defaultParams(base), near(), { kind: 'relocate', to });
    expect(p.removedIndustryIds).toContain(ctx().source.id);
    expect(p.addedIndustries).toHaveLength(near().length);
    expect(p.addedIndustries.every((i) => i.location[0] === to[0] && i.scenarioAdded)).toBe(true);
    expect(p.addedIndustries[0].name).toMatch(/relocated/);
  });

  it('keeps earlier edits and does nothing when no modeled source is nearby', () => {
    const start = { ...defaultParams(base), trafficMultiplier: 1.2 };
    expect(applyIndustryAction(start, [], { kind: 'shutdown' })).toBe(start);
    expect(applyIndustryAction(start, near(), { kind: 'shutdown' }).trafficMultiplier).toBe(1.2);
  });

  it('states that the source intensities are assumptions', () => {
    expect(ASSUMPTION_NOTE).toMatch(/assumptions/);
    expect(ASSUMPTION_NOTE).toMatch(/no facility emissions/);
  });
});

describe('estimateEmissions', () => {
  const data = normaliseIndustryData(FIXTURE)!;

  it('multiplies fuel quantity by the ARAI/TERI factor, per species', () => {
    const e = estimateEmissions([{ fuel: 'wood', quantity: 2 }], data.emissionFactors);
    expect(e.kg.pm25).toBeCloseTo(31.4, 8);
    expect(e.kg.co).toBeCloseTo(252, 8);
    expect(e.kg.nmvoc).toBeNull(); // no factor in the source: never zero, never invented
    expect(e.skipped).toEqual([]);
    expect(e.note).toMatch(/not a reported emission/);
  });

  it('adds several fuels and reports the ones with no factor', () => {
    const e = estimateEmissions([{ fuel: 'wood', quantity: 1 }, { fuel: 'wood', quantity: 1 }, { fuel: 'unobtainium', quantity: 5 }, { fuel: 'wood', quantity: 0 }], data.emissionFactors);
    expect(e.kg.pm25).toBeCloseTo(31.4, 8);
    expect(e.skipped).toEqual(['unobtainium: no emission factor in the dataset']);
  });
});

describe('ERA5 seasonal weather and district totals', () => {
  const data = normaliseIndustryData(FIXTURE)!;

  it('returns the case for an estate and season, or null (never a guess)', () => {
    const w = seasonalWeather(data, 501, 'winter')!;
    expect(w.weather).toMatchObject({ temperature: 21.9, windSpeed: 2.1, windDirection: 61 });
    expect(w.case.label).toBe('Winter');
    expect(seasonalWeather(data, 501, 'monsoon')).toBeNull();
    expect(seasonalWeather(data, 999, 'winter')).toBeNull();
    expect(seasonsFor(data, 501)).toHaveLength(1);
  });

  it('applied as scenario weather it changes the model', () => {
    const w = seasonalWeather(data, 501, 'winter')!.weather;
    const r = runScenario(base, { ...defaultParams(base), weather: w });
    expect(r.summary.meanDelta).not.toBe(0);
  });

  it('lists the district inventory as given', () => {
    expect(districtTotals(data)).toEqual([{ code: 'TRAN', sector: 'Transport', tonnes: { pm25: 6616, so2: 87 } }]);
  });
});
