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
import type { ProjectionCuts } from './apportionment';

export type TrafficMeasure = 'off' | 'standard' | 'intensive';
export type TreeCount = 0 | 250 | 500 | 1000 | 2000;
export const TREE_CHOICES: TreeCount[] = [0, 250, 500, 1000, 2000];

export type IndustryMode = 'controls' | 'restrict';

/**
 * Fine-tuning sliders and weather what-ifs. Each one feeds the same rule engine as the measures above (no separate
 * model); a missing key means "no change". Percent values are percent, weather values are in their own units.
 */
export interface ExtraParams {
  /** change in vehicle traffic, -50 to +30 % */
  trafficChange?: number;
  /** share of vehicles that become electric or low-emission, 0 to 30 % */
  electric?: number;
  /** extra emission control on industry, 0 to 50 % */
  industryControl?: number;
  /** roadside and park greenery, extra percentage points of cover, 0 to 15 */
  greenCover?: number;
  windSpeed?: number;
  temperature?: number;
  humidity?: number;
  rainfall?: number;
}
export const EXTRA_KEYS: Array<keyof ExtraParams> = ['trafficChange', 'electric', 'industryControl', 'greenCover', 'windSpeed', 'temperature', 'humidity', 'rainfall'];
export const hasExtras = (e: ExtraParams | undefined): boolean => !!e && EXTRA_KEYS.some((k) => typeof e[k] === 'number');

export interface MeasureSelection {
  traffic: TrafficMeasure;
  trees: TreeCount;
  industry: 0 | 1 | 2 | 3;
  /** controls = bag filters fitted (costed); restrict = temporary restriction of output (no price exists) */
  industryMode: IndustryMode;
  closureRoadId: string | null;
  /** share of the closed road's traffic that diverts to a neighbouring road */
  closureDiversion: number;
  dust: boolean;
  extras?: ExtraParams;
}

export const NO_MEASURES: MeasureSelection = { traffic: 'off', trees: 0, industry: 0, industryMode: 'controls', closureRoadId: null, closureDiversion: 0.6, dust: false };

/** Share of a restricted unit's output that is assumed to stop (a planning assumption). */
export const RESTRICTION_CUT = 0.5;

export const hasMeasures = (s: MeasureSelection): boolean =>
  s.traffic !== 'off' || s.trees > 0 || s.industry > 0 || s.closureRoadId !== null || s.dust || hasExtras(s.extras);

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
  /** measures whose cost cannot be given, with the reason (never a made-up price) */
  costNotes: string[];
  /** how much each source falls, for projecting a source-contribution chart when a study exists */
  cuts: ProjectionCuts;
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
  const costNotes: string[] = [];
  let industryCut = 0;
  if (sel.industry > 0) {
    const sources = eligibleSources(base, target);
    if (sources.length === 0) notes.push('No industrial unit lies in this area, so no industrial measure was applied.');
    else {
      const k = Math.min(sel.industry, sources.length);
      if (sel.industryMode === 'restrict') {
        const chosen = sources.slice(0, k);
        const overrides: Record<string, number> = {};
        for (const s of chosen) overrides[s.id] = Math.round(s.emissionIntensity * (1 - RESTRICTION_CUT) * 10) / 10;
        options.push({
          key: `industry-restrict-${k}`,
          type: 'industry',
          label: `Restrict ${k} industrial unit${k === 1 ? '' : 's'} to half output`,
          quantity: k,
          quantityUnit: 'units',
          location: chosen.map((s) => s.name).join(', '),
          lines: [],
          oneTime: 0,
          recurring: 0,
          total: 0,
          patch: { industryIntensityOverrides: overrides },
          effect: `Cuts the modelled output of ${chosen.map((s) => s.name).join(', ')} by ${Math.round(RESTRICTION_CUT * 100)}% while the restriction lasts.`,
          limitations: ['The share of output that stops is an assumption; actual emissions of each unit are not known.', 'A restriction is temporary: the effect ends when it is lifted.'],
        });
        costNotes.push('Industrial restriction: no cost is given because no price exists for lost output or enforcement.');
        industryCut = (RESTRICTION_CUT * k) / sources.length;
      } else {
        options.push(industryOption(sources, k, DEFAULT_ASSUMPTIONS));
        industryCut = (DEFAULT_ASSUMPTIONS.bagFilterCapture * k) / sources.length;
      }
    }
  }

  const params = mergeParams(base, options);
  params.name = 'Commissioner simulation';
  let closure: ClosurePlan | null = null;
  if (sel.closureRoadId) {
    closure = closurePlan(base, cell, sel.closureRoadId, sel.closureDiversion);
    if (closure) params.roadClosures = [{ roadId: closure.roadId, divertToRoadId: closure.divertToRoadId, diversionShare: closure.divertToRoadId ? sel.closureDiversion : 0 }];
    else notes.push('The chosen road is not in the current map data, so the closure was not applied.');
  }
  const ex = sel.extras;
  const extrasOn = hasExtras(ex);
  if (ex && extrasOn) {
    if (typeof ex.trafficChange === 'number') params.trafficMultiplier = Math.max(0, params.trafficMultiplier * (1 + ex.trafficChange / 100));
    if (typeof ex.electric === 'number') params.vehicleEmissionControl = Math.min(0.9, params.vehicleEmissionControl + ex.electric / 100);
    if (typeof ex.industryControl === 'number') params.industrialControl = Math.min(0.95, params.industrialControl + ex.industryControl / 100);
    if (typeof ex.greenCover === 'number') params.greenCoverDelta = Math.min(60, params.greenCoverDelta + ex.greenCover);
    params.weather = {
      ...params.weather,
      ...(typeof ex.windSpeed === 'number' ? { windSpeed: ex.windSpeed } : {}),
      ...(typeof ex.temperature === 'number' ? { temperature: ex.temperature } : {}),
      ...(typeof ex.humidity === 'number' ? { humidity: ex.humidity } : {}),
      ...(typeof ex.rainfall === 'number' ? { rainfall: ex.rainfall } : {}),
    };
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
  const modelledEffect = options.length > 0 || closure !== null || extrasOn;
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
    costNotes,
    cuts: {
      traffic: sel.traffic === 'off' ? 0 : DEFAULT_ASSUMPTIONS.trafficReduction[sel.traffic],
      industry: industryCut,
    },
  };
}

/** What each chosen change contributes on its own (the same engine, one change at a time). Largest improvement first. */
export function contributions(args: { base: BaseState; cell: GridCell; zoneName: string; currentPm25: number | null; selection: MeasureSelection }): Array<{ label: string; changePct: number }> {
  const { selection: s } = args;
  const parts: Array<{ label: string; sel: MeasureSelection }> = [];
  const one = (label: string, patch: Partial<MeasureSelection>) => parts.push({ label, sel: { ...NO_MEASURES, ...patch } });
  if (s.traffic !== 'off') one(`Traffic enforcement (${s.traffic})`, { traffic: s.traffic });
  if (s.closureRoadId) one('Road closure', { closureRoadId: s.closureRoadId, closureDiversion: s.closureDiversion });
  if (s.industry > 0) one('Industrial controls', { industry: s.industry, industryMode: s.industryMode });
  if (s.trees > 0) one(`${s.trees.toLocaleString('en-IN')} trees`, { trees: s.trees });
  const ex = s.extras ?? {};
  const ext = (label: string, keys: Array<keyof ExtraParams>) => {
    const picked: ExtraParams = {};
    for (const k of keys) if (typeof ex[k] === 'number') picked[k] = ex[k];
    if (hasExtras(picked)) one(label, { extras: picked });
  };
  ext('Traffic volume', ['trafficChange']);
  ext('Cleaner vehicles', ['electric']);
  ext('Industry emission control', ['industryControl']);
  ext('Roadside greenery', ['greenCover']);
  ext('Weather', ['windSpeed', 'temperature', 'humidity', 'rainfall']);
  return parts
    .map((p) => ({ label: p.label, out: runMeasures({ ...args, selection: p.sel }) }))
    .filter((p): p is { label: string; out: SimOutcome } => !!p.out && p.out.modelledEffect)
    .map((p) => ({ label: p.label, changePct: p.out.changePct }))
    .sort((a, b) => a.changePct - b.changePct);
}

export function measureLabels(sel: MeasureSelection): string[] {
  return [
    ...(sel.traffic !== 'off' ? [`Traffic enforcement (${sel.traffic})`] : []),
    ...(sel.closureRoadId ? ['Road closure'] : []),
    ...(sel.industry > 0 ? [`Industrial controls (${sel.industry})`] : []),
    ...(sel.trees > 0 ? [`${sel.trees} trees`] : []),
    ...(sel.dust ? ['Dust control'] : []),
    ...(hasExtras(sel.extras) ? ['Fine-tuned conditions'] : []),
  ];
}
