import type { BaseState } from '../types';
import { COEF, type Coefficients } from '../services/pollutionModel';
import {
  ACTIONS,
  buildImplementation,
  evaluateActionsSync,
  rankActions,
  type ActionEvaluation,
  type ActionId,
} from './actions';

/** Illustrative coefficients that can change which action ranks first. */
export const PERTURBED_COEFFICIENTS: Array<keyof Coefficients> = [
  'trafficPmAtFull',
  'industryPmAtFull',
  'plumeLengthKm',
  'regionalBackground',
  'dustBase',
  'greenPerPoint',
];

export interface StabilityVariant {
  coefficient: keyof Coefficients;
  factor: number;
  ranking: ActionId[];
  changed: boolean;
}

export interface StabilityReport {
  stable: boolean;
  baseRanking: ActionId[];
  variants: StabilityVariant[];
  /** Coefficient changes that reorder the ranking. */
  sensitiveTo: Array<keyof Coefficients>;
  message: string | null;
}

export const UNSTABLE_MESSAGE = 'ranking changes under assumption changes';

const rankingOf = (evals: ActionEvaluation[]): ActionId[] => rankActions(evals).map((e) => e.action.id);

/**
 * Re-rank the six actions with each illustrative engine coefficient scaled by -/+ `spread` (default 20%).
 * The ranking is "stable" only when no single change reorders it.
 */
export function checkRankingStability(base: BaseState, spread = 0.2): StabilityReport {
  const implementations = ACTIONS.map((a) => buildImplementation(base, a));
  const baseRanking = rankingOf(evaluateActionsSync(base, COEF, implementations));
  const variants: StabilityVariant[] = [];
  for (const key of PERTURBED_COEFFICIENTS) {
    for (const factor of [1 - spread, 1 + spread]) {
      const coef: Coefficients = { ...COEF, [key]: COEF[key] * factor };
      const ranking = rankingOf(evaluateActionsSync(base, coef, implementations));
      variants.push({
        coefficient: key,
        factor,
        ranking,
        changed: ranking.some((id, i) => id !== baseRanking[i]),
      });
    }
  }
  const sensitiveTo = [...new Set(variants.filter((v) => v.changed).map((v) => v.coefficient))];
  const stable = sensitiveTo.length === 0;
  return { stable, baseRanking, variants, sensitiveTo, message: stable ? null : UNSTABLE_MESSAGE };
}
