import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { runScenario } from '../services/scenarioService';
import {
  ACCESSED,
  DEFAULT_ASSUMPTIONS,
  MIN_REDUCTION,
  MissingPriceError,
  PRICES,
  SIGN_SQFT,
  TREE_LEVELS,
  cloneAssumptions,
  eligibleSources,
  formatINR,
  formatINRPdf,
  industryOption,
  line,
  listJoin,
  sumLines,
  trafficOption,
  treeOption,
} from './costModel';
import { DEFAULT_LIMITS, buildOptions, mergeParams, planProject, resolveTarget, sensitivity, type PlanInput } from './planEngine';

let base: BaseState;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  base,
  budget: 5_000_000,
  targetId: 'city',
  limits: { ...DEFAULT_LIMITS },
  objective: 'pm25',
  ...over,
});

describe('price table (verbatim from the brief)', () => {
  it('has every id with sourced prices carrying a source and estimates carrying a basis', () => {
    const ids = ['sapling', 'treeGuard', 'labourDay', 'labourMonth', 'compost', 'tankerTrip', 'truckTrip', 'bagFilter', 'filterBag', 'ductInstall', 'stackTest', 'power', 'anprCamera', 'cameraInstall', 'signBoard', 'anprSoftware', 'awareness'];
    expect(Object.keys(PRICES).sort()).toEqual([...ids].sort());
    for (const p of Object.values(PRICES)) {
      expect(p.id).toBe(Object.keys(PRICES).find((k) => PRICES[k] === p));
      if (p.kind === 'sourced') {
        expect(p.source?.url).toMatch(/^https:\/\//);
        expect(p.source?.accessed).toBe(ACCESSED);
        expect(p.source?.note.length).toBeGreaterThan(5);
      } else {
        expect(p.basis?.length).toBeGreaterThan(10);
        expect(p.source).toBeUndefined();
      }
    }
    expect(ACCESSED).toBe('10 Oct 2026');
  });

  it('holds the exact values and kinds', () => {
    expect(PRICES.sapling).toMatchObject({ unitPrice: 199, kind: 'sourced', unit: 'sapling' });
    expect(PRICES.treeGuard.unitPrice).toBe(900);
    expect(PRICES.labourDay.unitPrice).toBe(524.42);
    expect(PRICES.labourMonth.unitPrice).toBe(13635);
    expect(PRICES.compost).toMatchObject({ unitPrice: 12, kind: 'estimate' });
    expect(PRICES.tankerTrip).toMatchObject({ unitPrice: 1200, kind: 'sourced' });
    expect(PRICES.truckTrip).toMatchObject({ unitPrice: 4000, kind: 'estimate' });
    expect(PRICES.bagFilter.unitPrice).toBe(600000);
    expect(PRICES.filterBag.unitPrice).toBe(500);
    expect(PRICES.ductInstall).toMatchObject({ unitPrice: 150000, kind: 'estimate' });
    expect(PRICES.stackTest.unitPrice).toBe(25000);
    expect(PRICES.power).toMatchObject({ unitPrice: 10, kind: 'estimate' });
    expect(PRICES.anprCamera.unitPrice).toBe(55000);
    expect(PRICES.cameraInstall.unitPrice).toBe(20000);
    expect(PRICES.signBoard.unitPrice).toBe(250);
    expect(PRICES.anprSoftware.unitPrice).toBe(12000);
    expect(PRICES.awareness.unitPrice).toBe(50000);
    expect(SIGN_SQFT).toBe(8.72);
    expect(TREE_LEVELS).toEqual([250, 500, 1000, 2000]);
    expect(DEFAULT_ASSUMPTIONS.treeCanopyM2).toBe(40);
    expect(DEFAULT_ASSUMPTIONS.bagFilterCapture).toBe(0.9);
    expect(DEFAULT_ASSUMPTIONS.trafficReduction).toEqual({ standard: 0.1, intensive: 0.2 });
  });

  it('rounds line totals to whole rupees and reconciles every option', () => {
    expect(line(PRICES, 'labourDay', 3, 'Labour', false).total).toBe(1573); // 3 x 524.42 = 1573.26
    const target = resolveTarget(base, 'city')!;
    const opts = [treeOption(target, 250), treeOption(target, 2000), industryOption(eligibleSources(base, target), 2), trafficOption(target, 'standard'), trafficOption(target, 'intensive')];
    for (const o of opts) {
      for (const l of o.lines) expect(Number.isInteger(l.total)).toBe(true);
      expect(o.oneTime + o.recurring).toBe(o.total);
      expect(o.lines.filter((l) => !l.recurring).reduce((a, l) => a + l.total, 0)).toBe(o.oneTime);
      expect(o.lines.filter((l) => l.recurring).reduce((a, l) => a + l.total, 0)).toBe(o.recurring);
      expect(sumLines(o.lines).total).toBe(o.total);
    }
  });

  it('throws MissingPriceError and the option is left out with a note, never guessed', () => {
    expect(() => line({}, 'sapling', 1, 'Materials', false)).toThrow(MissingPriceError);
    const noSapling = { ...PRICES };
    delete noSapling.sapling;
    const target = resolveTarget(base, 'city')!;
    const { options, notes } = buildOptions(base, target, DEFAULT_LIMITS, cloneAssumptions(DEFAULT_ASSUMPTIONS), noSapling);
    expect(options.trees).toHaveLength(0);
    expect(notes.join(' ')).toMatch(/left out because No price for "sapling"/);
    expect(options.traffic.length).toBeGreaterThan(0);
    const out = planProject(input({ prices: noSapling }));
    expect(out.notes.join(' ')).toMatch(/sapling/);
  });

  it('applies cost multipliers', () => {
    const t = resolveTarget(base, 'city')!;
    const a = cloneAssumptions(DEFAULT_ASSUMPTIONS);
    a.costMultiplier.traffic = 2;
    expect(trafficOption(t, 'standard', a).total).toBeGreaterThan(trafficOption(t, 'standard').total * 1.95);
  });
});

describe('formatting', () => {
  it('groups rupees the Indian way and has a PDF-safe form', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINRPdf(1234567)).toBe('Rs 12,34,567');
    expect(formatINRPdf(1234567)).not.toContain('₹');
    expect(listJoin(['a'])).toBe('a');
    expect(listJoin(['a', 'b'])).toBe('a and b');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('planProject', () => {
  it('respects the budget to the rupee and reconciles totals with the lines', () => {
    for (const budget of [900_000, 2_000_000, 5_000_000, 20_000_000]) {
      const out = planProject(input({ budget }));
      if (out.status !== 'OK') continue;
      for (const p of out.plans) {
        expect(p.total).toBeLessThanOrEqual(budget);
        expect(p.remaining).toBe(budget - p.total);
        const lineSum = p.options.flatMap((o) => o.lines).reduce((a, l) => a + l.total, 0);
        expect(lineSum).toBe(p.total);
        expect(p.oneTime + p.recurring).toBe(p.total);
      }
    }
  });

  it('returns up to three ranked plans A, B, C with reasons, tradeoffs and impacts', () => {
    const out = planProject(input());
    expect(out.status).toBe('OK');
    expect(out.plans.length).toBeGreaterThanOrEqual(2);
    expect(out.plans.map((p) => p.id)).toEqual(['A', 'B', 'C'].slice(0, out.plans.length));
    const [a, b] = out.plans;
    expect(a.reason).toMatch(/^Best of \d+ feasible plans/);
    expect(a.tradeoff).toBeNull();
    expect(b.reason).toMatch(/^Ranks #2 of/);
    expect(b.tradeoff).toMatch(/Compared with Plan A: costs ₹/);
    for (const p of out.plans) {
      expect(p.impact.abs).toBeLessThan(-MIN_REDUCTION + 1e-9);
      expect(p.impact.predicted).toBeLessThan(p.impact.baseline);
      expect(p.impact.pct).toBeLessThan(0);
      expect(p.impact.zonesImproved).toBeGreaterThanOrEqual(0);
    }
    expect(out.feasible).toBeGreaterThanOrEqual(out.plans.length);
    expect(out.evaluated).toBeGreaterThan(out.feasible);
    expect(out.notes.join(' ')).toMatch(/MODELED_SCENARIO/);
  });

  it('is deterministic', () => {
    const a = planProject(input());
    const b = planProject(input());
    expect(a.plans.map((p) => [p.id, p.total, p.impact.abs, p.options.map((o) => o.key)])).toEqual(b.plans.map((p) => [p.id, p.total, p.impact.abs, p.options.map((o) => o.key)]));
  });

  it('the plan numbers equal what the same scenario gives in What-If (plan, preview and applied scenario agree)', () => {
    const out = planProject(input());
    const p = out.plans[0];
    const rerun = runScenario(base, p.params);
    expect(rerun.summary.meanDelta).toBeCloseTo(p.result.summary.meanDelta, 10);
    expect(rerun.summary.meanScenario).toBeCloseTo(p.result.summary.meanScenario, 10);
    expect(mergeParams(base, p.options)).toEqual(p.params);
  });

  it('ranks by the chosen objective', () => {
    const pm = planProject(input({ objective: 'pm25' }));
    const eff = planProject(input({ objective: 'efficiency' }));
    const cov = planProject(input({ objective: 'coverage' }));
    for (let i = 1; i < pm.plans.length; i++) expect(pm.plans[i - 1].impact.abs).toBeLessThanOrEqual(pm.plans[i].impact.abs + 1e-12);
    const per = (p: (typeof eff.plans)[number]) => -p.impact.abs / p.total;
    for (let i = 1; i < eff.plans.length; i++) expect(per(eff.plans[i - 1])).toBeGreaterThanOrEqual(per(eff.plans[i]) - 1e-12);
    for (let i = 1; i < cov.plans.length; i++) expect(cov.plans[i - 1].impact.zonesImproved).toBeGreaterThanOrEqual(cov.plans[i].impact.zonesImproved);
    // The best plan for efficiency is at least as efficient as the best plan for raw reduction.
    expect(per(eff.plans[0])).toBeGreaterThanOrEqual(per(pm.plans[0]) - 1e-12);
  });

  it('never relaxes operational limits', () => {
    const one = planProject(input({ limits: { ...DEFAULT_LIMITS, maxInterventions: 1 } }));
    for (const p of one.plans) expect(new Set(p.options.map((o) => o.type)).size).toBe(1);
    const noTraffic = planProject(input({ limits: { ...DEFAULT_LIMITS, unavailable: ['traffic'] } }));
    for (const p of noTraffic.plans) expect(p.options.some((o) => o.type === 'traffic')).toBe(false);
    expect(noTraffic.notes.join(' ')).toMatch(/Traffic enforcement is marked unavailable/);
    const few = planProject(input({ limits: { ...DEFAULT_LIMITS, plantingCapacity: 300 } }));
    for (const p of few.plans) for (const o of p.options) if (o.type === 'trees') expect(o.quantity).toBeLessThanOrEqual(300);
  });

  it('says INFEASIBLE with a suggested budget when nothing fits', () => {
    const out = planProject(input({ budget: 1000 }));
    expect(out.status).toBe('INFEASIBLE');
    expect(out.plans).toEqual([]);
    expect(out.rejected.overBudget).toBeGreaterThan(0);
    expect(out.messages[0]).toMatch(/No package of measures fits ₹1,000/);
    expect(out.suggestedBudget).toBeGreaterThan(1000);
    // the suggested budget really does fit a plan
    const again = planProject(input({ budget: out.suggestedBudget! }));
    expect(again.status).toBe('OK');
    expect(again.plans[0].total).toBeLessThanOrEqual(out.suggestedBudget!);
  });

  it('reports invalid input rather than guessing', () => {
    expect(planProject(input({ budget: 0 })).status).toBe('INVALID');
    expect(planProject(input({ budget: Number.NaN })).status).toBe('INVALID');
    expect(planProject(input({ targetId: 'nope' })).status).toBe('INVALID');
    expect(planProject(input({ limits: { ...DEFAULT_LIMITS, maxInterventions: 0 } })).status).toBe('INVALID');
    expect(planProject(input({ limits: { ...DEFAULT_LIMITS, maxInterventions: 4 } })).messages[0]).toMatch(/between 1 and 3/);
  });

  it('plans for one zone and measures the effect in that zone', () => {
    const zone = base.cells.reduce((best, c) => (c.trafficByRoad && Object.keys(c.trafficByRoad).length > Object.keys(best.trafficByRoad).length ? c : best));
    const out = planProject(input({ targetId: zone.id, budget: 20_000_000 }));
    expect(out.target?.cellIds).toEqual([zone.id]);
    if (out.status === 'OK') {
      for (const p of out.plans) {
        expect(p.impact.baseline).toBeCloseTo(p.result.baseline.find((s) => s.cellId === zone.id)!.pm25, 8);
        expect(p.impact.cityBaseline).not.toBeCloseTo(p.impact.baseline, 3);
      }
    }
  });

  it('offers no industrial controls where the target has no modeled source', () => {
    const empty: BaseState = { ...base, industries: [] };
    const out = planProject(input({ base: empty }));
    expect(out.notes.join(' ')).toMatch(/No modeled industrial source lies in the target/);
    for (const p of out.plans) expect(p.options.some((o) => o.type === 'industry')).toBe(false);
  });
});

describe('sensitivity analysis', () => {
  it('re-runs the plan under changed assumptions and flags when the ranking moves', () => {
    const s = sensitivity(input());
    expect(s.base.planKeys.length).toBeGreaterThan(0);
    expect(s.rows.length).toBeGreaterThanOrEqual(12);
    for (const r of s.rows) expect(r.changed).toBe(r.planKeys[0] !== s.base.planKeys[0]);
    const cheaper = s.rows.find((r) => r.label === 'All costs x0.75')!;
    expect(cheaper.topTotal!).toBeLessThanOrEqual(input().budget); // a cheaper price list may buy a bigger package, never an over-budget one
  });
});
