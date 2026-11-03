import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { computeCellStates } from './pollutionModel';
import { defaultParams, makeScenarioIndustry, runScenario, sanitizeParams, validateParams, withDefaultTarget } from './scenarioService';

let base: BaseState;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

const corridorCell = (road: string, r: ReturnType<typeof runScenario>) => {
  const open = new Set(r.baseline.filter((s) => s.trafficIntensity < 100).map((s) => s.cellId));
  return base.cells
    .filter((c) => open.has(c.id) && (c.trafficByRoad[road] ?? 0) > 5)
    .reduce((best, c) => ((c.trafficByRoad[road] ?? 0) > (best.trafficByRoad[road] ?? 0) ? c : best));
};

describe('road closure and diversion', () => {
  const closed = 'road-pune-solapur';
  const target = 'road-old-mumbai-pune';
  const run = (divertToRoadId: string | null, share: number) =>
    runScenario(base, { ...defaultParams(base), roadClosures: [{ roadId: closed, divertToRoadId, diversionShare: share }] });

  it('spills undiverted traffic onto local streets, so a full diversion cleans the corridor more', () => {
    const none = run(null, 0);
    const full = run(target, 1);
    const cell = corridorCell(closed, none);
    expect(none.delta[cell.id].pm25).toBeLessThan(0);
    expect(full.delta[cell.id].pm25).toBeLessThan(none.delta[cell.id].pm25);
  });

  it('raises the diversion target in proportion to the share', () => {
    const half = run(target, 0.5);
    const most = run(target, 0.9);
    const cell = base.cells
      .filter((c) => (c.trafficByRoad[target] ?? 0) > 5 && (c.trafficByRoad[closed] ?? 0) === 0 && half.baseline.find((s) => s.cellId === c.id)!.trafficIntensity < 90)
      .at(0)!;
    expect(half.delta[cell.id].pm25).toBeGreaterThan(0);
    expect(most.delta[cell.id].pm25).toBeGreaterThan(half.delta[cell.id].pm25);
  });
});

describe('green buffer', () => {
  const industry = makeScenarioIndustry({
    name: 'Buffered unit',
    category: 'Power',
    location: [73.9, 18.55],
    emissionIntensity: 90,
    controlEfficiency: 0,
  });

  it('has no effect when no industry was added', () => {
    const r = runScenario(base, { ...defaultParams(base), greenBuffer: true });
    expect(r.summary.affectedCount).toBe(0);
    expect(Math.abs(r.summary.meanDelta)).toBeLessThan(1e-9);
  });

  it('lowers the added unit impact and adds green cover nearby', () => {
    const base0 = { ...defaultParams(base), addedIndustries: [industry] };
    const plain = computeCellStates(base, base0);
    const buffered = computeCellStates(base, { ...base0, greenBuffer: true });
    const sum = (s: typeof plain) => s.reduce((a, x) => a + x.contributionAbs.industry, 0);
    expect(sum(buffered)).toBeLessThan(sum(plain));
    const near = base.cells.reduce((b, c) => (Math.hypot(c.center[0] - 73.9, c.center[1] - 18.55) < Math.hypot(b.center[0] - 73.9, b.center[1] - 18.55) ? c : b));
    const i = base.cells.indexOf(near);
    expect(buffered[i].greenCover).toBeGreaterThan(plain[i].greenCover);
  });
});

describe('area selection', () => {
  it('an empty target means the whole city for the area traffic control', () => {
    const p = { ...defaultParams(base), areaTrafficMultiplier: 0.5 };
    expect(withDefaultTarget(base, p).targetCells).toHaveLength(base.cells.length);
    expect(withDefaultTarget(base, defaultParams(base)).targetCells).toHaveLength(0);
    const whole = runScenario(base, p);
    expect(whole.summary.meanDelta).toBeLessThan(0);
  });

  it('limits the control to the selected cells', () => {
    const some = base.cells.slice(0, 20).map((c) => c.id);
    const part = runScenario(base, { ...defaultParams(base), areaTrafficMultiplier: 0.5, targetCells: some });
    const whole = runScenario(base, { ...defaultParams(base), areaTrafficMultiplier: 0.5 });
    expect(Math.abs(part.summary.meanDelta)).toBeLessThan(Math.abs(whole.summary.meanDelta));
    const outside = base.cells.slice(40).every((c) => Math.abs(part.delta[c.id].pm25) < 1e-9);
    expect(outside).toBe(true);
  });
});

describe('sanitizeParams and validation', () => {
  it('drops references that do not exist', () => {
    const p = {
      ...defaultParams(base),
      targetCells: ['nope', base.cells[0].id],
      removedIndustryIds: ['ghost'],
      industryIntensityOverrides: { ghost: 50 },
      roadClosures: [
        { roadId: 'road-karve', divertToRoadId: 'ghost-road', diversionShare: 0.5 },
        { roadId: 'ghost-road', divertToRoadId: null, diversionShare: 0 },
      ],
    };
    const s = sanitizeParams(base, p);
    expect(s.targetCells).toEqual([base.cells[0].id]);
    expect(s.removedIndustryIds).toEqual([]);
    expect(s.industryIntensityOverrides).toEqual({});
    expect(s.roadClosures).toEqual([{ roadId: 'road-karve', divertToRoadId: null, diversionShare: 0.5 }]);
  });

  it('validates the new area multiplier and closure shares', () => {
    const e = validateParams({ ...defaultParams(base), areaTrafficMultiplier: 5, roadClosures: [{ roadId: 'x', divertToRoadId: null, diversionShare: 2 }] });
    expect(e.some((m) => m.startsWith('Area traffic multiplier'))).toBe(true);
    expect(e.some((m) => /Diversion share/.test(m))).toBe(true);
    expect(validateParams({ ...defaultParams(base), trafficMultiplier: Number.NaN }).length).toBe(1);
  });
});
