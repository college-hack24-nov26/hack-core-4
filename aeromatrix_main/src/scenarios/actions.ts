import type { BaseState, Road, ScenarioParams, ScenarioResult } from '../types';
import { defaultParams, makeScenarioIndustry, runScenario, scenarioService } from '../services/scenarioService';
import { COEF, type Coefficients } from '../services/pollutionModel';
import { distanceToPathKm } from '../utils/geo';

export type ActionId =
  | 'traffic-restriction'
  | 'industrial-control'
  | 'green-expansion'
  | 'road-diversion'
  | 'industrial-relocation'
  | 'public-transport';

export interface ReductionAction {
  id: ActionId;
  name: string;
  /** Core actions are the three headline measures. */
  core: boolean;
  summary: string;
}

/** South-east periphery site used by the relocation action. */
export const RELOCATION_SITE: [number, number] = [73.972, 18.448];
/** A "major" road for diversion: volume proxy at or above this. */
export const MAJOR_ROAD_MIN_VOLUME = 60;

export const ACTIONS: ReductionAction[] = [
  { id: 'traffic-restriction', name: 'Traffic restriction', core: true, summary: 'Low-emission zone / odd-even in the core' },
  { id: 'industrial-control', name: 'Industrial emission control', core: true, summary: 'ESP / scrubbers on all units' },
  { id: 'green-expansion', name: 'Green expansion', core: true, summary: 'More tree cover in built-up zones' },
  { id: 'road-diversion', name: 'Road diversion', core: false, summary: 'Close the busiest road, divert traffic' },
  { id: 'industrial-relocation', name: 'Industrial relocation', core: false, summary: 'Move the largest emitter to the periphery' },
  { id: 'public-transport', name: 'Public transport shift', core: false, summary: 'Mode shift plus cleaner fleet' },
];

export interface ActionImplementation {
  params: ScenarioParams;
  /** Plain-language description of exactly what was applied. */
  text: string;
  feasible: boolean;
  note?: string;
  /** Roads / industries involved, for insights. */
  closedRoadId?: string;
  divertRoadId?: string;
  movedIndustryId?: string;
}

export interface ActionEvaluation {
  action: ReductionAction;
  implementation: ActionImplementation;
  /** null when the action is not feasible for this base state. */
  result: ScenarioResult | null;
}

const roadTraffic = (base: BaseState, id: string) =>
  base.cells.reduce((a, c) => a + (c.trafficByRoad[id] ?? 0), 0);

function sampleVertices(road: Road, max = 24): Array<[number, number]> {
  const pts = road.paths.flat();
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  return Array.from({ length: max }, (_, i) => pts[Math.floor(i * step)]);
}

/** Mean distance from a road's sample points to the nearest part of another road. */
function roadDistanceKm(from: Array<[number, number]>, to: Road): number {
  let sum = 0;
  for (const p of from) {
    let d = Infinity;
    for (const path of to.paths) d = Math.min(d, distanceToPathKm(p, path));
    sum += d;
  }
  return sum / Math.max(1, from.length);
}

export function findDiversionPair(base: BaseState): { closed: Road; target: Road } | null {
  const majors = base.roads.filter((r) => r.volume >= MAJOR_ROAD_MIN_VOLUME);
  if (majors.length < 2) return null;
  let closed: Road | null = null;
  let best = 0;
  for (const r of majors) {
    const t = roadTraffic(base, r.id);
    if (t > best) {
      best = t;
      closed = r;
    }
  }
  if (!closed) return null;
  const pts = sampleVertices(closed);
  let target: Road | null = null;
  let bestD = Infinity;
  for (const r of majors) {
    if (r.id === closed.id || r.volume < 0.6 * closed.volume) continue;
    if (roadTraffic(base, r.id) <= 0) continue;
    const d = roadDistanceKm(pts, r);
    if (d < bestD) {
      bestD = d;
      target = r;
    }
  }
  return target ? { closed, target } : null;
}

export function builtUpCells(base: BaseState): string[] {
  return base.cells.filter((c) => c.landUse === 'Urban core' || c.landUse === 'Residential').map((c) => c.id);
}

export function buildImplementation(base: BaseState, action: ReductionAction): ActionImplementation {
  const p = defaultParams(base);
  switch (action.id) {
    case 'traffic-restriction': {
      const cells = builtUpCells(base);
      return {
        params: { ...p, name: action.name, targetCells: cells, areaTrafficMultiplier: 0.7 },
        text: '-30% vehicle-km in urban-core & residential zones (LEZ / odd-even)',
        feasible: cells.length > 0,
        note: cells.length === 0 ? 'No urban-core or residential zones in the current grid.' : undefined,
      };
    }
    case 'industrial-control':
      return {
        params: { ...p, name: action.name, industrialControl: 0.4 },
        text: '+40% additional control efficiency on all units (ESP / scrubbers)',
        feasible: base.industries.length > 0,
        note: base.industries.length === 0 ? 'No industries in the current geometry.' : undefined,
      };
    case 'green-expansion': {
      const cells = builtUpCells(base);
      return {
        params: { ...p, name: action.name, targetCells: cells, greenCoverDelta: 12 },
        text: '+12 pts green cover in urban-core & residential zones',
        feasible: cells.length > 0,
        note: cells.length === 0 ? 'No urban-core or residential zones in the current grid.' : undefined,
      };
    }
    case 'road-diversion': {
      const pair = findDiversionPair(base);
      if (!pair) {
        return { params: { ...p, name: action.name }, text: 'No suitable road pair found', feasible: false, note: 'No suitable road pair found' };
      }
      return {
        params: {
          ...p,
          name: action.name,
          roadClosures: [{ roadId: pair.closed.id, divertToRoadId: pair.target.id, diversionShare: 0.7 }],
        },
        text: `Close ${pair.closed.name} and divert 70% of its traffic to ${pair.target.name}`,
        feasible: true,
        closedRoadId: pair.closed.id,
        divertRoadId: pair.target.id,
      };
    }
    case 'industrial-relocation': {
      const top = [...base.industries].sort((a, b) => b.emissionIntensity - a.emissionIntensity)[0];
      if (!top) {
        return { params: { ...p, name: action.name }, text: 'No industries to relocate', feasible: false, note: 'No industries in the current geometry.' };
      }
      const moved = makeScenarioIndustry({
        name: `${top.name} (relocated)`,
        category: top.category,
        location: RELOCATION_SITE,
        emissionIntensity: top.emissionIntensity,
        controlEfficiency: top.controlEfficiency,
        mainPollutants: top.mainPollutants,
      });
      return {
        params: { ...p, name: action.name, removedIndustryIds: [top.id], addedIndustries: [moved] },
        text: `Relocate ${top.name} (highest-intensity unit) to the south-east periphery [${RELOCATION_SITE[0]}, ${RELOCATION_SITE[1]}]`,
        feasible: true,
        movedIndustryId: top.id,
      };
    }
    case 'public-transport':
      return {
        params: { ...p, name: action.name, publicTransportShift: 0.15, vehicleEmissionControl: 0.1 },
        text: '15% mode shift to transit + 10% cleaner fleet (e-buses)',
        feasible: true,
      };
  }
}

export const meanReduction = (e: ActionEvaluation): number => (e.result ? -e.result.summary.meanDelta : -Infinity);

/** Highest PM2.5 reduction first; infeasible actions last. */
export function rankActions(evals: ActionEvaluation[]): ActionEvaluation[] {
  return [...evals].sort((a, b) => {
    const ra = meanReduction(a);
    const rb = meanReduction(b);
    if (ra === rb) return ACTIONS.indexOf(a.action) - ACTIONS.indexOf(b.action);
    return rb - ra;
  });
}

/** Run all six actions through the scenario service. */
export async function evaluateActions(base: BaseState): Promise<ActionEvaluation[]> {
  const out: ActionEvaluation[] = [];
  for (const action of ACTIONS) {
    const implementation = buildImplementation(base, action);
    const result = implementation.feasible ? await scenarioService.run(base, implementation.params) : null;
    out.push({ action, implementation, result });
  }
  return out;
}

/** Synchronous variant used by the stability check (it needs engine coefficient overrides). */
export function evaluateActionsSync(
  base: BaseState,
  coef: Coefficients = COEF,
  implementations?: ActionImplementation[],
): ActionEvaluation[] {
  return ACTIONS.map((action, i) => {
    const implementation = implementations?.[i] ?? buildImplementation(base, action);
    return {
      action,
      implementation,
      result: implementation.feasible ? runScenario(base, implementation.params, coef) : null,
    };
  });
}
