import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { computeCellStates, meteoFactor, plumeKernel } from './pollutionModel';
import { defaultParams, makeScenarioIndustry, runScenario, validateParams } from './scenarioService';

let base: BaseState;

beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

const meanPm25 = (states: { pm25: number }[]) => states.reduce((a, s) => a + s.pm25, 0) / states.length;

describe('pollution engine', () => {
  it('is deterministic', () => {
    const p = defaultParams(base);
    const a = computeCellStates(base, p);
    const b = computeCellStates(base, p);
    expect(a).toEqual(b);
    const base2 =  // rebuilding the demo city yields identical cells too
      structuredClone(base);
    expect(computeCellStates(base2, p)).toEqual(a);
  });

  it('gives zero delta when nothing changes', () => {
    const r = runScenario(base, defaultParams(base));
    for (const d of Object.values(r.delta)) {
      for (const v of Object.values(d)) expect(Math.abs(v)).toBeLessThan(1e-9);
    }
    expect(r.summary.affectedCount).toBe(0);
    expect(r.metadata.status).toBe('MODELED_SCENARIO');
  });

  it('raises PM2.5 when traffic rises', () => {
    const p = { ...defaultParams(base), trafficMultiplier: 1.5 };
    const r = runScenario(base, p);
    expect(r.summary.meanDelta).toBeGreaterThan(0);
  });

  it('lowers a closed road corridor and raises its diversion target', () => {
    const closed = 'road-pune-solapur';
    const target = 'road-old-mumbai-pune';
    const p = {
      ...defaultParams(base),
      roadClosures: [{ roadId: closed, divertToRoadId: target, diversionShare: 0.8 }],
    };
    const r = runScenario(base, p);
    // Pick an unsaturated corridor cell (the engine clamps traffic at 140 in the busiest core).
    const unsaturated = new Set(
      r.baseline.filter((s) => s.trafficIntensity < 100).map((s) => s.cellId),
    );
    const corridor = base.cells
      .filter((c) => unsaturated.has(c.id) && (c.trafficByRoad[closed] ?? 0) > 5)
      .reduce((best, c) => ((c.trafficByRoad[closed] ?? 0) > (best.trafficByRoad[closed] ?? 0) ? c : best));
    expect(r.delta[corridor.id].pm25).toBeLessThan(0);
    const targetCells = base.cells.filter(
      (c) =>
        unsaturated.has(c.id) && (c.trafficByRoad[target] ?? 0) > 5 && (c.trafficByRoad[closed] ?? 0) === 0,
    );
    expect(targetCells.length).toBeGreaterThan(0);
    for (const c of targetCells) expect(r.delta[c.id].pm25).toBeGreaterThan(0);
  });

  it('shifts the plume downwind', () => {
    const src: [number, number] = [73.86, 18.53];
    const east: [number, number] = [73.88, 18.53];
    const west: [number, number] = [73.84, 18.53];
    const windToEast = { ...base.weather, windDirection: 270, windSpeed: 4 };
    expect(plumeKernel(src, east, windToEast)).toBeGreaterThan(plumeKernel(src, west, windToEast));
    const windToWest = { ...windToEast, windDirection: 90 };
    expect(plumeKernel(src, west, windToWest)).toBeGreaterThan(plumeKernel(src, east, windToWest));

    // Same effect through the full engine with an added industry.
    const industry = makeScenarioIndustry({
      name: 'Test stack',
      category: 'Power',
      location: src,
      emissionIntensity: 100,
      controlEfficiency: 0,
    });
    const run = (dir: number) => {
      const params = {
        ...defaultParams(base),
        addedIndustries: [industry],
        weather: { ...base.weather, windDirection: dir, windSpeed: 4 },
      };
      const states = computeCellStates(base, params);
      const at = (p: [number, number]) =>
        states[base.cells.findIndex((c) => p[0] >= c.bounds.west && p[0] < c.bounds.east && p[1] >= c.bounds.south && p[1] < c.bounds.north)];
      return { east: at([73.9, 18.53]).contributionAbs.industry, west: at([73.82, 18.53]).contributionAbs.industry };
    };
    const towardsEast = run(270);
    expect(towardsEast.east).toBeGreaterThan(towardsEast.west);
  });

  it('keeps source contributions summing to PM2.5', () => {
    const states = computeCellStates(base, defaultParams(base));
    for (const s of states) {
      const c = s.contributionAbs;
      expect(c.traffic + c.industry + c.background + c.other).toBeCloseTo(s.pm25, 8);
    }
    expect(meanPm25(states)).toBeGreaterThan(20);
  });

  it('responds to weather in the expected direction', () => {
    const calm = meteoFactor({ ...base.weather, windSpeed: 0.5 });
    const windy = meteoFactor({ ...base.weather, windSpeed: 8 });
    expect(calm).toBeGreaterThan(windy);
  });

  it('rejects out-of-range input', () => {
    expect(validateParams(defaultParams(base))).toEqual([]);
    const bad = {
      ...defaultParams(base),
      trafficMultiplier: 4,
      vehicleEmissionControl: 0.95,
      weather: { ...base.weather, windSpeed: 40, humidity: 120, pressure: 800 },
    };
    const errs = validateParams(bad);
    expect(errs.length).toBeGreaterThanOrEqual(5);
    expect(errs.join(' ')).toMatch(/Traffic multiplier/);
  });
});

describe('demo data', () => {
  it('builds all supported grid sizes', async () => {
    for (const n of [5, 10, 20]) {
      const b = await demoDataProvider.getBaseState(n);
      expect(b.cells).toHaveLength(n * n);
      expect(b.status).toBe('DEMO');
    }
  });
});
