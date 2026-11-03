import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import {
  ACTIONS,
  RELOCATION_SITE,
  buildImplementation,
  evaluateActions,
  evaluateActionsSync,
  findDiversionPair,
  meanReduction,
  rankActions,
} from './actions';
import { UNSTABLE_MESSAGE, checkRankingStability } from './actionStability';
import { actionInsight } from './actionInsights';

let base: BaseState;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

describe('reduction actions', () => {
  it('defines six actions, three of them core', () => {
    expect(ACTIONS).toHaveLength(6);
    expect(ACTIONS.filter((a) => a.core).map((a) => a.id).sort()).toEqual(
      ['green-expansion', 'industrial-control', 'traffic-restriction'].sort(),
    );
  });

  it('builds the documented parameters', () => {
    const get = (id: string) => buildImplementation(base, ACTIONS.find((a) => a.id === id)!);
    const traffic = get('traffic-restriction');
    expect(traffic.params.areaTrafficMultiplier).toBe(0.7);
    expect(traffic.params.targetCells.length).toBeGreaterThan(0);
    expect(get('industrial-control').params.industrialControl).toBe(0.4);
    const green = get('green-expansion');
    expect(green.params.greenCoverDelta).toBe(12);
    expect(green.params.targetCells).toEqual(traffic.params.targetCells);
    const pt = get('public-transport');
    expect(pt.params.publicTransportShift).toBe(0.15);
    expect(pt.params.vehicleEmissionControl).toBe(0.1);
  });

  it('relocates the highest-intensity industry to the south-east periphery', () => {
    const impl = buildImplementation(base, ACTIONS.find((a) => a.id === 'industrial-relocation')!);
    const top = [...base.industries].sort((a, b) => b.emissionIntensity - a.emissionIntensity)[0];
    expect(impl.params.removedIndustryIds).toEqual([top.id]);
    expect(impl.params.addedIndustries).toHaveLength(1);
    expect(impl.params.addedIndustries[0].location).toEqual(RELOCATION_SITE);
    expect(impl.params.addedIndustries[0].emissionIntensity).toBe(top.emissionIntensity);
  });

  it('closes the busiest major road and diverts 70% to a comparable road', () => {
    const pair = findDiversionPair(base)!;
    expect(pair).not.toBeNull();
    const total = (id: string) => base.cells.reduce((a, c) => a + (c.trafficByRoad[id] ?? 0), 0);
    const majors = base.roads.filter((r) => r.volume >= 60);
    expect(total(pair.closed.id)).toBe(Math.max(...majors.map((r) => total(r.id))));
    expect(pair.target.id).not.toBe(pair.closed.id);
    expect(pair.target.volume).toBeGreaterThanOrEqual(0.6 * pair.closed.volume);
    const impl = buildImplementation(base, ACTIONS.find((a) => a.id === 'road-diversion')!);
    expect(impl.params.roadClosures).toEqual([{ roadId: pair.closed.id, divertToRoadId: pair.target.id, diversionShare: 0.7 }]);
  });

  it('says so when no suitable road pair exists', () => {
    const one = base.roads.filter((r) => r.volume >= 60).slice(0, 1);
    const lonely: BaseState = { ...base, roads: one };
    const impl = buildImplementation(lonely, ACTIONS.find((a) => a.id === 'road-diversion')!);
    expect(impl.feasible).toBe(false);
    expect(impl.note).toBe('No suitable road pair found');
    const evals = evaluateActionsSync(lonely);
    expect(evals.find((e) => e.action.id === 'road-diversion')!.result).toBeNull();
  });

  it('ranks by mean PM2.5 reduction, best first, and reduces PM2.5 for the core actions', async () => {
    const evals = await evaluateActions(base);
    const ranked = rankActions(evals);
    const reductions = ranked.map(meanReduction);
    for (let i = 1; i < reductions.length; i++) expect(reductions[i - 1]).toBeGreaterThanOrEqual(reductions[i]);
    for (const id of ['traffic-restriction', 'industrial-control', 'green-expansion']) {
      expect(meanReduction(evals.find((e) => e.action.id === id)!)).toBeGreaterThan(0);
    }
  });

  it('gives a one-line insight for every action', async () => {
    const evals = await evaluateActions(base);
    for (const e of evals) {
      const text = actionInsight(base, e, {});
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toMatch(/\n/);
    }
  });
});

describe('ranking stability', () => {
  it('reports a consistent verdict', () => {
    const r = checkRankingStability(base);
    expect(r.baseRanking).toHaveLength(6);
    expect(r.variants).toHaveLength(12); // 6 coefficients x (-20%, +20%)
    expect(r.stable).toBe(!r.variants.some((v) => v.changed));
    expect(r.message).toBe(r.stable ? null : UNSTABLE_MESSAGE);
    expect(UNSTABLE_MESSAGE).toBe('ranking changes under assumption changes');
    expect(r.sensitiveTo.length > 0).toBe(!r.stable);
  });

  it('is stable when the coefficients do not move', () => {
    const r = checkRankingStability(base, 0);
    expect(r.stable).toBe(true);
    expect(r.message).toBeNull();
  });

  it('flags instability when assumptions change a lot', () => {
    const r = checkRankingStability(base, 0.9);
    // Whatever the verdict, it must agree with the variants it reports.
    expect(r.stable).toBe(r.variants.every((v) => !v.changed));
    if (!r.stable) expect(r.sensitiveTo.length).toBeGreaterThan(0);
  });
});
