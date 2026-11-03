/**
 * Plan-It engine: "I have a budget and a target. What is the best package of measures?"
 *
 * A deterministic exhaustive search over intervention quantity levels. Every candidate is costed from the cost model
 * and its PM2.5 effect comes from the same runScenario the What-If panel uses, so plan, map preview and applied
 * scenario agree exactly. Hard limits (budget, operational limits) are never relaxed.
 */
import type { BaseState, ScenarioParams, ScenarioResult } from '../types';
import { defaultParams, runScenario } from '../services/scenarioService';
import { cellAreaKm2 } from '../utils/geo';
import { zoneLabel, zonePlaceNames } from '../utils/zones';
import {
  DEFAULT_ASSUMPTIONS,
  INTERVENTION_LABEL,
  MIN_REDUCTION,
  MissingPriceError,
  PRICES,
  TREE_LEVELS,
  cloneAssumptions,
  eligibleSources,
  formatINR,
  industryOption,
  listJoin,
  pct,
  trafficOption,
  treeOption,
  type InterventionOption,
  type InterventionType,
  type PlanAssumptions,
  type PlanTarget,
  type PriceTable,
} from './costModel';

export type Objective = 'pm25' | 'efficiency' | 'coverage';
export const OBJECTIVE_LABEL: Record<Objective, string> = {
  pm25: 'Largest PM2.5 reduction in the target',
  efficiency: 'Most PM2.5 reduction per rupee',
  coverage: 'Most zones improved',
};

export interface PlanLimits {
  /** how many different measures a plan may combine (1-3) */
  maxInterventions: number;
  unavailable: InterventionType[];
  /** the most trees that can be planted */
  plantingCapacity: number;
}

export const DEFAULT_LIMITS: PlanLimits = { maxInterventions: 3, unavailable: [], plantingCapacity: 2000 };

export interface PlanInput {
  base: BaseState;
  budget: number;
  /** 'city' or a grid cell id */
  targetId: string;
  limits: PlanLimits;
  objective: Objective;
  assumptions?: PlanAssumptions;
  prices?: PriceTable;
}

export interface PlanImpact {
  /** mean PM2.5 over the target zones, ug/m3 */
  baseline: number;
  predicted: number;
  /** predicted - baseline (negative = cleaner) */
  abs: number;
  pct: number;
  cityBaseline: number;
  cityPredicted: number;
  /** target zones at least 0.5 ug/m3 lower */
  zonesImproved: number;
  affectedZones: number;
}

export interface Plan {
  id: 'A' | 'B' | 'C';
  options: InterventionOption[];
  oneTime: number;
  recurring: number;
  total: number;
  remaining: number;
  impact: PlanImpact;
  params: ScenarioParams;
  result: ScenarioResult;
  reason: string;
  tradeoff: string | null;
}

export interface PlanOutcome {
  status: 'OK' | 'INFEASIBLE' | 'INVALID';
  messages: string[];
  target: PlanTarget | null;
  plans: Plan[];
  notes: string[];
  evaluated: number;
  feasible: number;
  rejected: { overBudget: number; tooMany: number; noReduction: number };
  budget: number;
  objective: Objective;
  assumptions: PlanAssumptions;
  suggestedBudget?: number;
}

export function resolveTarget(base: BaseState, targetId: string): PlanTarget | null {
  if (targetId === 'city') {
    return { id: 'city', label: 'the whole city', cellIds: base.cells.map((c) => c.id), areaKm2: base.cells.reduce((a, c) => a + cellAreaKm2(c.bounds), 0) };
  }
  const cell = base.cells.find((c) => c.id === targetId);
  if (!cell) return null;
  return { id: cell.id, label: zoneLabel(cell, zonePlaceNames(base.cells)), cellIds: [cell.id], areaKm2: cellAreaKm2(cell.bounds) };
}

/** Merge the patches of the chosen options into scenario parameters (later options never overwrite earlier keys). */
export function mergeParams(base: BaseState, options: InterventionOption[]): ScenarioParams {
  const p = defaultParams(base);
  p.name = 'Plan-It';
  for (const o of options) {
    const patch = o.patch;
    if (patch.greenCoverByCell) p.greenCoverByCell = { ...(p.greenCoverByCell ?? {}), ...patch.greenCoverByCell };
    if (patch.industryIntensityOverrides) p.industryIntensityOverrides = { ...p.industryIntensityOverrides, ...patch.industryIntensityOverrides };
    if (patch.targetCells) p.targetCells = [...new Set([...p.targetCells, ...patch.targetCells])];
    if (patch.areaTrafficMultiplier !== undefined) p.areaTrafficMultiplier = patch.areaTrafficMultiplier;
  }
  return p;
}

function impactOf(result: ScenarioResult, target: PlanTarget): PlanImpact {
  const inT = new Set(target.cellIds);
  const mean = (states: ScenarioResult['baseline'], only?: Set<string>) => {
    let s = 0;
    let n = 0;
    for (const x of states) if (!only || only.has(x.cellId)) (s += x.pm25), n++;
    return n ? s / n : 0;
  };
  const baseline = mean(result.baseline, inT);
  const predicted = mean(result.scenario, inT);
  let improved = 0;
  for (const id of target.cellIds) if ((result.delta[id]?.pm25 ?? 0) <= -0.5) improved++;
  return {
    baseline,
    predicted,
    abs: predicted - baseline,
    pct: baseline > 0 ? ((predicted - baseline) / baseline) * 100 : 0,
    cityBaseline: mean(result.baseline),
    cityPredicted: mean(result.scenario),
    zonesImproved: improved,
    affectedZones: result.affectedZones.length,
  };
}

const typeKey = (o: InterventionOption) => o.type;

export function buildOptions(
  base: BaseState,
  target: PlanTarget,
  limits: PlanLimits,
  assumptions: PlanAssumptions,
  prices: PriceTable,
): { options: Record<InterventionType, InterventionOption[]>; notes: string[] } {
  const options: Record<InterventionType, InterventionOption[]> = { trees: [], industry: [], traffic: [] };
  const notes: string[] = [];
  const attempt = (type: InterventionType, build: () => InterventionOption) => {
    try {
      options[type].push(build());
    } catch (e) {
      if (e instanceof MissingPriceError) notes.push(`${INTERVENTION_LABEL[type]}: an option was left out because ${e.message}.`);
      else throw e;
    }
  };
  if (!limits.unavailable.includes('trees')) {
    for (const n of TREE_LEVELS) if (n <= limits.plantingCapacity) attempt('trees', () => treeOption(target, n, assumptions, prices));
  } else notes.push('Tree planting is marked unavailable.');
  if (!limits.unavailable.includes('industry')) {
    const sources = eligibleSources(base, target);
    if (sources.length === 0) notes.push('No modeled industrial source lies in the target, so industrial controls are not offered.');
    for (let k = 1; k <= Math.min(3, sources.length); k++) attempt('industry', () => industryOption(sources, k, assumptions, prices));
  } else notes.push('Industrial emission control is marked unavailable.');
  if (!limits.unavailable.includes('traffic')) {
    for (const lvl of ['standard', 'intensive'] as const) attempt('traffic', () => trafficOption(target, lvl, assumptions, prices));
  } else notes.push('Traffic enforcement is marked unavailable.');
  return { options, notes };
}

function* combinations(options: Record<InterventionType, InterventionOption[]>): Generator<InterventionOption[]> {
  const types: InterventionType[] = ['trees', 'industry', 'traffic'];
  const choices = types.map((t) => [null, ...options[t]] as Array<InterventionOption | null>);
  for (const a of choices[0]) for (const b of choices[1]) for (const c of choices[2]) {
    const pick = [a, b, c].filter((x): x is InterventionOption => x !== null);
    if (pick.length > 0) yield pick;
  }
}

function score(obj: Objective, plan: Pick<Plan, 'impact' | 'total'>): number {
  switch (obj) {
    case 'efficiency':
      return plan.total > 0 ? -plan.impact.abs / plan.total : 0;
    case 'coverage':
      return plan.impact.zonesImproved * 1000 - plan.impact.abs;
    default:
      return -plan.impact.abs;
  }
}

export function planProject(input: PlanInput): PlanOutcome {
  const assumptions = input.assumptions ?? cloneAssumptions(DEFAULT_ASSUMPTIONS);
  const prices = input.prices ?? PRICES;
  const empty = (status: PlanOutcome['status'], messages: string[], target: PlanTarget | null): PlanOutcome => ({
    status,
    messages,
    target,
    plans: [],
    notes: [],
    evaluated: 0,
    feasible: 0,
    rejected: { overBudget: 0, tooMany: 0, noReduction: 0 },
    budget: input.budget,
    objective: input.objective,
    assumptions,
  });

  if (!Number.isFinite(input.budget) || input.budget <= 0) return empty('INVALID', ['Enter a budget greater than zero.'], null);
  if (!Number.isInteger(input.limits.maxInterventions) || input.limits.maxInterventions < 1 || input.limits.maxInterventions > 3) {
    return empty('INVALID', ['The number of measures allowed must be between 1 and 3.'], null);
  }
  const target = resolveTarget(input.base, input.targetId);
  if (!target) return empty('INVALID', ['The chosen target zone is not in the current grid. Pick the target again.'], null);

  const { options, notes } = buildOptions(input.base, target, input.limits, assumptions, prices);
  const rejected = { overBudget: 0, tooMany: 0, noReduction: 0 };
  let evaluated = 0;
  const candidates: Plan[] = [];

  for (const combo of combinations(options)) {
    evaluated++;
    if (new Set(combo.map(typeKey)).size > input.limits.maxInterventions) {
      rejected.tooMany++;
      continue;
    }
    const oneTime = combo.reduce((a, o) => a + o.oneTime, 0);
    const recurring = combo.reduce((a, o) => a + o.recurring, 0);
    const total = oneTime + recurring;
    if (total > input.budget) {
      rejected.overBudget++;
      continue;
    }
    const params = mergeParams(input.base, combo);
    const result = runScenario(input.base, params);
    const impact = impactOf(result, target);
    if (-impact.abs < MIN_REDUCTION) {
      rejected.noReduction++;
      continue;
    }
    candidates.push({
      id: 'A',
      options: combo,
      oneTime,
      recurring,
      total,
      remaining: input.budget - total,
      impact,
      params,
      result,
      reason: '',
      tradeoff: null,
    });
  }

  candidates.sort(
    (a, b) =>
      score(input.objective, b) - score(input.objective, a) ||
      a.total - b.total ||
      a.options.map((o) => o.key).join('+').localeCompare(b.options.map((o) => o.key).join('+')),
  );

  const feasible = candidates.length;
  const top = candidates.slice(0, 3);
  const ids = ['A', 'B', 'C'] as const;
  const plans = top.map((p, i): Plan => {
    const names = listJoin(p.options.map((o) => INTERVENTION_LABEL[o.type].toLowerCase()));
    const reason =
      i === 0
        ? `Best of ${feasible} feasible plans for "${OBJECTIVE_LABEL[input.objective]}": ${names}.`
        : `Ranks #${i + 1} of ${feasible} feasible plans for "${OBJECTIVE_LABEL[input.objective]}": ${names}.`;
    return { ...p, id: ids[i], reason };
  });
  for (let i = 1; i < plans.length; i++) {
    const a = plans[0];
    const p = plans[i];
    const dCost = p.total - a.total;
    const dRed = -(p.impact.abs - a.impact.abs); // positive = this plan reduces more than A
    plans[i].tradeoff =
      `Compared with Plan A: costs ${formatINR(Math.abs(dCost))} ${dCost <= 0 ? 'less' : 'more'}, ` +
      `reduces target PM2.5 by ${Math.abs(dRed).toFixed(2)} ug/m3 ${dRed <= 0 ? 'less' : 'more'}, ` +
      `improves ${p.impact.zonesImproved} zone${p.impact.zonesImproved === 1 ? '' : 's'} (Plan A: ${a.impact.zonesImproved}).`;
  }

  const outNotes = [
    ...notes,
    'Prices are planning inputs from the price table; quantities marked "assumed" are planner assumptions, not quotations.',
    'Effects are MODELED_SCENARIO results from the uncalibrated prototype rule model on DEMO inputs, not forecasts.',
  ];

  if (plans.length === 0) {
    const out = empty('INFEASIBLE', [], target);
    out.notes = outNotes;
    out.evaluated = evaluated;
    out.rejected = rejected;
    out.messages = [
      `No package of measures fits ${formatINR(input.budget)} for ${target.label} within the limits${
        rejected.noReduction > 0 && rejected.overBudget === 0 ? ' and gives a measurable PM2.5 reduction' : ''
      }.`,
    ];
    // Cheapest single measure (within the limits) that does reduce PM2.5, ignoring the budget.
    let cheapest: number | undefined;
    for (const list of Object.values(options)) {
      for (const o of list) {
        const impact = impactOf(runScenario(input.base, mergeParams(input.base, [o])), target);
        if (-impact.abs >= MIN_REDUCTION && (cheapest === undefined || o.total < cheapest)) cheapest = o.total;
      }
    }
    if (cheapest !== undefined) {
      out.suggestedBudget = cheapest;
      out.messages.push(`The cheapest single measure that reduces PM2.5 costs ${formatINR(cheapest)} (one-time plus first-year running costs).`);
    } else {
      out.messages.push('None of the measures allowed by the limits reduces PM2.5 in this target, whatever the budget.');
    }
    return out;
  }

  return { status: 'OK', messages: [], target, plans, notes: outNotes, evaluated, feasible, rejected, budget: input.budget, objective: input.objective, assumptions };
}

// ---- sensitivity analysis ----

export interface SensitivityRow {
  label: string;
  planKeys: string[];
  topTotal: number | null;
  topAbs: number | null;
  /** the top plan differs from the baseline assumptions */
  changed: boolean;
  status: PlanOutcome['status'];
}

const planKey = (p: Plan) => p.options.map((o) => o.key).join('+');

/** Re-run the plan under changed cost multipliers and response assumptions and show how the ranking moves. */
export function sensitivity(input: PlanInput): { base: SensitivityRow; rows: SensitivityRow[] } {
  const mk = (label: string, mutate: (a: PlanAssumptions) => void, ref?: SensitivityRow): SensitivityRow => {
    const a = cloneAssumptions(input.assumptions ?? DEFAULT_ASSUMPTIONS);
    mutate(a);
    const o = planProject({ ...input, assumptions: a });
    const keys = o.plans.map(planKey);
    return {
      label,
      planKeys: keys,
      topTotal: o.plans[0]?.total ?? null,
      topAbs: o.plans[0]?.impact.abs ?? null,
      changed: ref ? keys[0] !== ref.planKeys[0] : false,
      status: o.status,
    };
  };
  const base = mk('Your assumptions', () => undefined);
  const rows: SensitivityRow[] = [];
  for (const f of [0.75, 1.25]) {
    rows.push(mk(`All costs x${f}`, (a) => { for (const t of Object.keys(a.costMultiplier) as InterventionType[]) a.costMultiplier[t] *= f; }, base));
  }
  for (const t of ['trees', 'industry', 'traffic'] as InterventionType[]) {
    for (const f of [0.75, 1.25]) rows.push(mk(`${INTERVENTION_LABEL[t]} cost x${f}`, (a) => { a.costMultiplier[t] *= f; }, base));
  }
  for (const c of [30, 50]) rows.push(mk(`Tree canopy ${c} m2`, (a) => { a.treeCanopyM2 = c; }, base));
  for (const c of [0.8, 0.95]) rows.push(mk(`Bag-filter capture ${Math.round(c * 100)}%`, (a) => { a.bagFilterCapture = c; }, base));
  for (const f of [0.75, 1.25]) {
    rows.push(mk(`Traffic reduction x${f}`, (a) => { a.trafficReduction = { standard: a.trafficReduction.standard * f, intensive: a.trafficReduction.intensive * f }; }, base));
  }
  return { base, rows };
}

export { formatINR, pct };
