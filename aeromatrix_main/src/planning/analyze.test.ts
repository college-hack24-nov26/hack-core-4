import { describe, expect, it } from 'vitest';
import { ILLUSTRATIVE_ACTIONS, NO_CAUSAL_NOTE, analyze, validateActions, type PlanAction } from './analyze';

const pred = { value: 80, lower: 60, upper: 100 };
const acts: PlanAction[] = [
  { id: 'a', cost: 100, fraction: 0.2, source: 's' },
  { id: 'b', cost: 300, fraction: 0.5, source: 's' },
];

describe('planning.analyze', () => {
  it('lists every non-empty subset with cost and multiplicative effect', () => {
    const r = analyze(pred, acts, 1000, 50);
    expect(r.errors).toEqual([]);
    expect(r.subsets).toHaveLength(3);
    const both = r.subsets.find((s) => s.ids.join() === 'a,b')!;
    expect(both.cost).toBe(400);
    expect(both.resulting.point).toBeCloseTo(80 * 0.8 * 0.5, 10);
    expect(both.resulting.lower).toBeCloseTo(60 * 0.4, 10);
    expect(both.resulting.upper).toBeCloseTo(100 * 0.4, 10);
  });

  it('feasible means affordable and at or below the target, per uncertainty case', () => {
    const r = analyze(pred, acts, 400, 40);
    const both = r.subsets.find((s) => s.ids.join() === 'a,b')!;
    expect(both.feasible).toEqual({ lower: true, point: true, upper: true }); // 24 / 32 / 40 <= 40 and cost 400 <= 400
    const onlyB = r.subsets.find((s) => s.ids.join() === 'b')!;
    expect(onlyB.feasible).toEqual({ lower: true, point: true, upper: false }); // 30 / 40 / 50
    const tight = analyze(pred, acts, 399, 40);
    expect(tight.subsets.find((s) => s.ids.join() === 'a,b')!.feasible.point).toBe(false); // over budget by one rupee
  });

  it('shows how feasibility changes across budget and uncertainty scenarios', () => {
    const r = analyze(pred, acts, 400, 40);
    expect(r.budgets).toEqual([200, 400, 600]);
    expect(r.matrix).toHaveLength(9);
    const cell = (b: number, u: string) => r.matrix.find((m) => m.budget === b && m.uncertainty === u)!;
    expect(cell(200, 'point').feasibleCount).toBe(0); // nothing affordable that reaches 40
    expect(cell(200, 'point').cheapest).toBeNull();
    expect(cell(400, 'point').cheapest?.ids).toEqual(['b']);
    expect(cell(400, 'upper').cheapest?.ids).toEqual(['a', 'b']);
    // more budget never makes fewer subsets feasible
    for (const u of ['lower', 'point', 'upper']) expect(cell(600, u).feasibleCount).toBeGreaterThanOrEqual(cell(400, u).feasibleCount);
    // a higher upper bound never makes more subsets feasible
    expect(cell(400, 'upper').feasibleCount).toBeLessThanOrEqual(cell(400, 'lower').feasibleCount);
  });

  it('rejects invalid inputs with readable errors instead of computing', () => {
    expect(validateActions([{ id: 'x', cost: -1, fraction: 0.5, source: 's' }])[0]).toMatch(/cost must be zero or more/);
    expect(validateActions([{ id: 'x', cost: 1, fraction: 1.5, source: 's' }])[0]).toMatch(/fraction must be between 0 and 1/);
    expect(validateActions([{ id: 'x', cost: 1, fraction: 0.5, source: '' }])[0]).toMatch(/source is required/);
    expect(validateActions([acts[0], acts[0]]).join(' ')).toMatch(/Duplicate/);
    const bad = analyze({ value: 80, lower: 90, upper: 100 }, acts, 100, 50);
    expect(bad.errors.join(' ')).toMatch(/interval must contain the value/);
    expect(bad.subsets).toEqual([]);
    expect(analyze(pred, acts, -5, 50).errors.join(' ')).toMatch(/budget/);
    expect(analyze(pred, Array.from({ length: 13 }, (_, i) => ({ id: `x${i}`, cost: 1, fraction: 0.1, source: 's' })), 100, 50).errors.join(' ')).toMatch(/At most 12/);
  });

  it('states that it is a mathematical illustration with no causal claim', () => {
    expect(analyze(pred, acts, 100, 50).note).toBe(NO_CAUSAL_NOTE);
    expect(NO_CAUSAL_NOTE).toMatch(/no causal claim/);
    for (const a of ILLUSTRATIVE_ACTIONS) expect(a.source).toMatch(/Illustrative/);
    expect(validateActions(ILLUSTRATIVE_ACTIONS)).toEqual([]);
  });
});
