/**
 * Mathematical planning illustration for Sensor Intelligence predictions.
 *
 * Given a predicted value with an interval, a list of actions (cost >= 0, a fractional reduction in [0, 1], a source)
 * and a budget, it lists which subsets of actions are feasible: affordable AND bringing the predicted value to or
 * below a target. Fractions combine multiplicatively. This is arithmetic on assumed inputs: it makes NO causal claim
 * that any action reduces PM in reality.
 */
export interface PlanAction {
  id: string;
  /** INR, >= 0 */
  cost: number;
  /** share of the predicted value removed, 0..1 */
  fraction: number;
  /** where the cost and fraction come from */
  source: string;
}

export interface PredictionInput {
  value: number;
  lower: number;
  upper: number;
}

export type UncertaintyCase = 'lower' | 'point' | 'upper';

export interface SubsetResult {
  ids: string[];
  cost: number;
  /** value after the actions under each uncertainty case */
  resulting: Record<UncertaintyCase, number>;
  /** within budget and at or below the target, per uncertainty case */
  feasible: Record<UncertaintyCase, boolean>;
}

export interface FeasibilityCell {
  budget: number;
  uncertainty: UncertaintyCase;
  feasibleCount: number;
  cheapest: SubsetResult | null;
}

export interface Analysis {
  target: number;
  budget: number;
  subsets: SubsetResult[];
  /** how feasibility changes across uncertainty and budget scenarios */
  matrix: FeasibilityCell[];
  budgets: number[];
  note: string;
  errors: string[];
}

export const NO_CAUSAL_NOTE =
  'A mathematical illustration only: the fractions and costs are assumed inputs, and no causal claim is made that these actions reduce PM2.5 or PM10 in reality.';

export const BUDGET_SCENARIOS = [0.5, 1, 1.5];
export const UNCERTAINTY_CASES: UncertaintyCase[] = ['lower', 'point', 'upper'];

export function validateActions(actions: PlanAction[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const a of actions) {
    if (!a.id) errors.push('An action has no id.');
    if (seen.has(a.id)) errors.push(`Duplicate action id "${a.id}".`);
    seen.add(a.id);
    if (!Number.isFinite(a.cost) || a.cost < 0) errors.push(`Action "${a.id}": cost must be zero or more.`);
    if (!Number.isFinite(a.fraction) || a.fraction < 0 || a.fraction > 1) errors.push(`Action "${a.id}": fraction must be between 0 and 1.`);
    if (!a.source) errors.push(`Action "${a.id}": a source is required.`);
  }
  return errors;
}

function allSubsets(actions: PlanAction[]): PlanAction[][] {
  const out: PlanAction[][] = [];
  const n = actions.length;
  for (let mask = 1; mask < 1 << n; mask++) out.push(actions.filter((_, i) => mask & (1 << i)));
  return out;
}

export function analyze(prediction: PredictionInput, actions: PlanAction[], budget: number, target: number): Analysis {
  const errors = validateActions(actions);
  if (!Number.isFinite(budget) || budget < 0) errors.push('The budget must be zero or more.');
  if (!Number.isFinite(target) || target < 0) errors.push('The target must be zero or more.');
  if (!(prediction.lower <= prediction.value && prediction.value <= prediction.upper)) errors.push('The prediction interval must contain the value.');
  if (actions.length > 12) errors.push('At most 12 actions can be combined.');
  const base: Analysis = { target, budget, subsets: [], matrix: [], budgets: BUDGET_SCENARIOS.map((f) => budget * f), note: NO_CAUSAL_NOTE, errors };
  if (errors.length > 0) return base;

  const evaluate = (subset: PlanAction[], b: number): SubsetResult => {
    const cost = subset.reduce((a, x) => a + x.cost, 0);
    const keep = subset.reduce((a, x) => a * (1 - x.fraction), 1);
    const resulting = { lower: prediction.lower * keep, point: prediction.value * keep, upper: prediction.upper * keep };
    const feasible = {
      lower: cost <= b && resulting.lower <= target,
      point: cost <= b && resulting.point <= target,
      upper: cost <= b && resulting.upper <= target,
    };
    return { ids: subset.map((x) => x.id), cost, resulting, feasible };
  };

  const subsets = allSubsets(actions);
  base.subsets = subsets.map((s) => evaluate(s, budget)).sort((a, b) => a.cost - b.cost || a.ids.join().localeCompare(b.ids.join()));
  for (const b of base.budgets) {
    const evaluated = subsets.map((s) => evaluate(s, b)).sort((x, y) => x.cost - y.cost);
    for (const u of UNCERTAINTY_CASES) {
      const ok = evaluated.filter((e) => e.feasible[u]);
      base.matrix.push({ budget: b, uncertainty: u, feasibleCount: ok.length, cheapest: ok[0] ?? null });
    }
  }
  return base;
}

/** Bundled illustration inputs: clearly assumed numbers, not measured effects. */
export const ILLUSTRATIVE_ACTIONS: PlanAction[] = [
  { id: 'Action 1', cost: 100000, fraction: 0.1, source: 'Illustrative assumption (not a measured effect)' },
  { id: 'Action 2', cost: 250000, fraction: 0.2, source: 'Illustrative assumption (not a measured effect)' },
  { id: 'Action 3', cost: 600000, fraction: 0.35, source: 'Illustrative assumption (not a measured effect)' },
  { id: 'Action 4', cost: 50000, fraction: 0.05, source: 'Illustrative assumption (not a measured effect)' },
];
