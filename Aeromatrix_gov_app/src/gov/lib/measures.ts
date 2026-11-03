/**
 * The Simulator's brain: turns the Commissioner's chosen measures into costs (Plan-It price table) and a RELATIVE change
 * from the existing uncalibrated rule engine, applied to the zone's current model value (D8). Dust control is costed
 * and scheduled but its effect is NOT modelled.
 */
import type { BaseState, GridCell, ScenarioParams, ScenarioResult } from '../../types';
import { runScenario } from '../../services/scenarioService';
import { mergeParams, resolveTarget } from '../../plan/planEngine';
import {
  DEFAULT_ASSUMPTIONS,
  PRICES,
  SIGN_SQFT,
  eligibleSources,
  industryOption,
  line,
  sumLines,
  trafficOption,
  treeOption,
  type CostLine,
  type InterventionOption,
  type PlanTarget,
} from '../../plan/costModel';
import { distanceToPathKm } from '../../utils/geo';
import { dustPlan, type DustPlan } from './dustControl';
import { majorRoadsInZone } from './airdata';

export type TrafficMeasure = 'off' | 'standard' | 'intensive';
export type TreeCount = 0 | 250 | 500 | 1000 | 2000;
export const TREE_CHOICES: TreeCount[] = [0, 250, 500, 1000, 2000];

export interface MeasureSelection {
  traffic: TrafficMeasure;
  trees: TreeCount;
  industry: 0 | 1 | 2 | 3;
  closureRoadId: string | null;
  /** share of the closed road's traffic that diverts to a neighbouring road */
  closureDiversion: number;
  dust: boolean;
}

export const NO_MEASURES: MeasureSelection = { traffic: 'off', trees: 0, industry: 0, closureRoadId: null, closureDiversion: 0.6, dust: false };

export const hasMeasures = (s: MeasureSelection): boolean =>
  s.traffic !== 'off' || s.trees > 0 || s.industry > 0 || s.closureRoadId !== null || s.dust;

/** Implementation periods in weeks. These are planning assumptions of this app, not quotations. */
export const WEEKS = { traffic: { standard: 6, intensive: 10 }, trees: 8, industry: 12, closure: 1 } as const;

export interface ClosurePlan {
  roadId: string;
  roadName: string;
  diversion: number;
  divertToRoadId: string | null;
  divertToName: string | null;
  lines: CostLine[];
  oneTime: number;
  recurring: number;
}

export interface SimOutcome {
  target: PlanTarget;
  zoneName: string;
  selection: MeasureSelection;
  options: InterventionOption[];
  closure: ClosurePlan | null;
  dust: DustPlan | null;
  params: ScenarioParams;
  result: ScenarioResult;
  /** engine PM2.5 for the zone before and after (ug/m3, prototype scale) */
  protoBefore: number;
  protoAfter: number;
  /** relative change of the engine PM2.5 (negative = improvement) */
  relative: number;
  /** the same if only half of the assumed effect is achieved */
  relativeHalf: number;
  /** the zone's current live model value, when known */
  currentPm25: number | null;
  projectedPm25: number | null;
  lowPm25: number | null;
  changePct: number;
  lowPct: number;
  lines: CostLine[];
  oneTime: number;
  recurring: number;
  total: number;
  weeks: number;
  zonesImproved: number;
  /** true when at least one selected measure has a modelled effect */
  modelledEffect: boolean;
  measures: string[];
  notes: string[];
}

/** The road closure options for a zone: named major roads through it. */
export function closureChoices(base: Pick<BaseState, 'roads'>, cell: GridCell) {
  return majorRoadsInZone(base, cell, 6, true);
}

/** How many modelled industrial sources lie in the zone (the most industrial units that can be controlled). */
export function industryUnitsAvailable(base: BaseState, cell: GridCell): number {
  const target = resolveTarget(base, cell.id);
  return target ? eligibleSources(base, target).length : 0;
}

function diversionRoad(base: BaseState, closedId: string, cell: GridCell) {
  const closed = base.roads.find((r) => r.id === closedId);
  if (!closed) return null;
  let best: { id: string; name: string; d: number } | null = null;
  for (const r of base.roads) {
    if (r.id === closedId) continue;
    let d = Infinity;
    for (const p of r.paths) d = Math.min(d, distanceToPathKm(cell.center, p));
    if (!best || d < best.d) best = { id: r.id, name: r.name, d };
  }
  return best;
}

function closurePlan(base: BaseState, cell: GridCell, roadId: string, diversion: number): ClosurePlan | null {
  const road = base.roads.find((r) => r.id === roadId);
  if (!road) return null;
  const div = diversionRoad(base, roadId, cell);
  const lines = [
    line(PRICES, 'signBoard', Math.round(4 * SIGN_SQFT * 100) / 100, 'Materials', false, 1, '4 boards of 900 mm at the closure and the diversion (assumed)'),
    line(PRICES, 'labourDay', 60, 'Labour', true, 1, '2 traffic marshals for 30 days (assumed)'),
  ];
  const sums = sumLines(lines);
  return {
    roadId,
    roadName: road.name,
    diversion,
    divertToRoadId: div?.id ?? null,
    divertToName: div?.name ?? null,
    lines,
    oneTime: sums.oneTime,
    recurring: sums.recurring,
  };
}

export function runMeasures(args: {
  base: BaseState;
  cell: GridCell;
  zoneName: string;
  /** the zone's current CAMS model PM2.5, when there is one */
  currentPm25: number | null;
  selection: MeasureSelection;
}): SimOutcome | null {
  const { base, cell, zoneName, currentPm25, selection: sel } = args;
  if (!hasMeasures(sel)) return null;
  const target = resolveTarget(base, cell.id);
  if (!target) return null;

  const options: InterventionOption[] = [];
  const notes: string[] = [];
  if (sel.traffic !== 'off') options.push(trafficOption(target, sel.traffic, DEFAULT_ASSUMPTIONS));
  if (sel.trees > 0) options.push(treeOption(target, sel.trees, DEFAULT_ASSUMPTIONS));
  if (sel.industry > 0) {
    const sources = eligibleSources(base, target);
    if (sources.length === 0) notes.push('No modelled industrial source lies in this zone, so industrial controls were not applied.');
    else options.push(industryOption(sources, Math.min(sel.industry, sources.length), DEFAULT_ASSUMPTIONS));
  }

  const params = mergeParams(base, options);
  params.name = 'Commissioner simulation';
  let closure: ClosurePlan | null = null;
  if (sel.closureRoadId) {
    closure = closurePlan(base, cell, sel.closureRoadId, sel.closureDiversion);
    if (closure) params.roadClosures = [{ roadId: closure.roadId, divertToRoadId: closure.divertToRoadId, diversionShare: closure.divertToRoadId ? sel.closureDiversion : 0 }];
    else notes.push('The chosen road is not in the current map data, so the closure was not applied.');
  }
  const dust = sel.dust ? dustPlan(base, cell, zoneName) : null;

  const result = runScenario(base, params);
  const before = result.baseline.find((s) => s.cellId === cell.id)?.pm25 ?? 0;
  const after = result.scenario.find((s) => s.cellId === cell.id)?.pm25 ?? 0;
  const relative = before > 0 ? (after - before) / before : 0;
  const projected = currentPm25 === null ? null : currentPm25 * (1 + relative);
  const low = currentPm25 === null ? null : currentPm25 * (1 + relative / 2);

  const lines: CostLine[] = [...options.flatMap((o) => o.lines), ...(closure?.lines ?? []), ...(dust?.lines ?? [])];
  const sums = sumLines(lines);
  const weeks = Math.max(
    0,
    sel.traffic === 'off' ? 0 : WEEKS.traffic[sel.traffic],
    sel.trees > 0 ? WEEKS.trees : 0,
    options.some((o) => o.type === 'industry') ? WEEKS.industry : 0,
    closure ? WEEKS.closure : 0,
    dust?.weeks ?? 0,
  );
  const measures = [
    ...options.map((o) => o.label),
    ...(closure ? [`Close ${closure.roadName} (${Math.round(sel.closureDiversion * 100)}% diverted)`] : []),
    ...(dust ? ['Dust control by water sprinkling'] : []),
  ];
  const zonesImproved = target.cellIds.length > 0 ? Object.values(result.delta).filter((d) => d.pm25 <= -0.5).length : 0;
  const modelledEffect = options.length > 0 || closure !== null;
  if (!modelledEffect && dust) notes.push('Only dust control is selected: its effect is not modelled, so no change in PM2.5 is shown.');
  if (dust) notes.push('Dust control is costed and scheduled; its effect is checked by readings on Day 7 and Day 14, not simulated.');

  return {
    target,
    zoneName,
    selection: sel,
    options,
    closure,
    dust,
    params,
    result,
    protoBefore: before,
    protoAfter: after,
    relative,
    relativeHalf: relative / 2,
    currentPm25,
    projectedPm25: modelledEffect ? projected : currentPm25,
    lowPm25: modelledEffect ? low : currentPm25,
    changePct: modelledEffect ? relative * 100 : 0,
    lowPct: modelledEffect ? (relative / 2) * 100 : 0,
    lines,
    oneTime: sums.oneTime,
    recurring: sums.recurring,
    total: sums.total,
    weeks,
    zonesImproved,
    modelledEffect,
    measures,
    notes,
  };
}

export function measureLabels(sel: MeasureSelection): string[] {
  return [
    ...(sel.traffic !== 'off' ? [`Traffic enforcement (${sel.traffic})`] : []),
    ...(sel.closureRoadId ? ['Road closure'] : []),
    ...(sel.industry > 0 ? [`Industrial controls (${sel.industry})`] : []),
    ...(sel.trees > 0 ? [`${sel.trees} trees`] : []),
    ...(sel.dust ? ['Dust control'] : []),
  ];
}
