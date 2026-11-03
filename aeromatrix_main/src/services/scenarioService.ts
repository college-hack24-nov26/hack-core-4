import type {
  BaseState,
  CellState,
  DeltaMap,
  Industry,
  IndustryCategory,
  LonLat,
  Pollutant,
  ScenarioParams,
  ScenarioResult,
} from '../types';
import {
  COEF,
  computeCellStates,
  MODEL_ID,
  MODEL_VERSION,
  POLLUTANTS,
  meanContribution,
  type Coefficients,
} from './pollutionModel';
import { uid } from '../utils/format';

/** A cell counts as affected when PM2.5 changes by at least this much (ug/m3). */
export const AFFECTED_THRESHOLD = 0.5;

export const SCENARIO_DISCLAIMER =
  'Prototype modeled estimate from an uncalibrated rule-based model on DEMO inputs. Not an observation or validated prediction.';

export function defaultParams(base: BaseState): ScenarioParams {
  return {
    name: 'Baseline',
    targetCells: [],
    trafficMultiplier: 1,
    areaTrafficMultiplier: 1,
    vehicleEmissionControl: 0,
    publicTransportShift: 0,
    roadClosures: [],
    addedIndustries: [],
    removedIndustryIds: [],
    industryIntensityOverrides: {},
    industrialControl: 0,
    greenCoverDelta: 0,
    greenBuffer: false,
    buildingDensityDelta: 0,
    buildingHeightMultiplier: 1,
    weather: { ...base.weather },
  };
}

function range(errors: string[], label: string, v: number, lo: number, hi: number) {
  if (!Number.isFinite(v) || v < lo || v > hi) errors.push(`${label} must be between ${lo} and ${hi} (got ${v}).`);
}

export function validateParams(p: ScenarioParams): string[] {
  const e: string[] = [];
  range(e, 'Traffic multiplier', p.trafficMultiplier, 0, 3);
  range(e, 'Area traffic multiplier', p.areaTrafficMultiplier, 0, 3);
  range(e, 'Vehicle emission control', p.vehicleEmissionControl, 0, 0.9);
  range(e, 'Public transport shift', p.publicTransportShift, 0, 0.6);
  range(e, 'Industrial control', p.industrialControl, 0, 0.95);
  range(e, 'Green cover change', p.greenCoverDelta, -60, 60);
  range(e, 'Building density change', p.buildingDensityDelta, -0.6, 0.6);
  range(e, 'Building height multiplier', p.buildingHeightMultiplier, 0.2, 5);
  range(e, 'Wind speed', p.weather.windSpeed, 0, 25);
  range(e, 'Wind direction', p.weather.windDirection, 0, 360);
  range(e, 'Rainfall', p.weather.rainfall, 0, 300);
  range(e, 'Temperature', p.weather.temperature, -5, 50);
  range(e, 'Humidity', p.weather.humidity, 0, 100);
  range(e, 'Pressure', p.weather.pressure, 900, 1100);
  for (const c of p.roadClosures) range(e, `Diversion share for ${c.roadId}`, c.diversionShare, 0, 1);
  return e;
}

export function runScenario(base: BaseState, params: ScenarioParams, coef: Coefficients = COEF): ScenarioResult {
  const baseline = computeCellStates(base, defaultParams(base), coef);
  const scenario = computeCellStates(base, withDefaultTarget(base, params), coef);
  return buildResult(base, params, baseline, scenario);
}

/** An empty target area means "the whole city" for the area controls (the engine itself only knows explicit cells). */
export function withDefaultTarget(base: BaseState, p: ScenarioParams): ScenarioParams {
  if (p.targetCells.length > 0 || p.areaTrafficMultiplier === 1) return p;
  return { ...p, targetCells: base.cells.map((c) => c.id) };
}

/** Drop references that do not exist in this base state (e.g. after the geometry or grid changed). */
export function sanitizeParams(base: BaseState, p: ScenarioParams): ScenarioParams {
  const roadIds = new Set(base.roads.map((r) => r.id));
  const industryIds = new Set(base.industries.map((i) => i.id));
  const cellIds = new Set(base.cells.map((c) => c.id));
  const overrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.industryIntensityOverrides)) if (industryIds.has(k)) overrides[k] = v;
  return {
    ...p,
    targetCells: p.targetCells.filter((c) => cellIds.has(c)),
    roadClosures: p.roadClosures
      .filter((c) => roadIds.has(c.roadId))
      .map((c) => (c.divertToRoadId && !roadIds.has(c.divertToRoadId) ? { ...c, divertToRoadId: null } : c)),
    removedIndustryIds: p.removedIndustryIds.filter((i) => industryIds.has(i)),
    industryIntensityOverrides: overrides,
  };
}

function buildResult(
  base: BaseState,
  params: ScenarioParams,
  baseline: CellState[],
  scenario: CellState[],
): ScenarioResult {
  const delta: DeltaMap = {};
  const affectedZones: string[] = [];
  let exposedPopulation = 0;
  let sumB = 0;
  let sumS = 0;
  let maxIncrease = 0;
  let maxDecrease = 0;
  let highB = 0;
  let highS = 0;
  const popById = new Map(base.cells.map((c) => [c.id, c.population]));

  baseline.forEach((b, i) => {
    const s = scenario[i];
    const d = {} as Record<Pollutant, number>;
    for (const p of POLLUTANTS) d[p] = s[p] - b[p];
    delta[b.cellId] = d;
    sumB += b.pm25;
    sumS += s.pm25;
    maxIncrease = Math.max(maxIncrease, d.pm25);
    maxDecrease = Math.min(maxDecrease, d.pm25);
    if (Math.abs(d.pm25) >= AFFECTED_THRESHOLD) affectedZones.push(b.cellId);
    if (d.pm25 >= AFFECTED_THRESHOLD) exposedPopulation += popById.get(b.cellId) ?? 0;
    if (b.risk === 'HIGH' || b.risk === 'VERY_HIGH') highB++;
    if (s.risk === 'HIGH' || s.risk === 'VERY_HIGH') highS++;
  });

  const n = Math.max(1, baseline.length);
  const meanBaseline = sumB / n;
  const meanScenario = sumS / n;
  return {
    id: uid('scn'),
    params,
    baseline,
    scenario,
    delta,
    affectedZones,
    sourceContribution: { baseline: meanContribution(baseline), scenario: meanContribution(scenario) },
    summary: {
      meanBaseline,
      meanScenario,
      meanDelta: meanScenario - meanBaseline,
      meanDeltaPct: meanBaseline === 0 ? 0 : ((meanScenario - meanBaseline) / meanBaseline) * 100,
      maxIncrease,
      maxDecrease,
      affectedCount: affectedZones.length,
      exposedPopulation,
      highRiskBaseline: highB,
      highRiskScenario: highS,
    },
    metadata: {
      status: 'MODELED_SCENARIO',
      engine: MODEL_ID,
      engineVersion: MODEL_VERSION,
      createdAt: new Date().toISOString(),
      disclaimer: SCENARIO_DISCLAIMER,
    },
  };
}

export interface ScenarioService {
  id: string;
  label: string;
  run(base: BaseState, params: ScenarioParams): Promise<ScenarioResult>;
  baseline(base: BaseState): CellState[];
}

const demoScenarioService: ScenarioService = {
  id: 'demo-rule-engine',
  label: 'Prototype rule-based engine (MODELED_SCENARIO)',
  async run(base, params) {
    return runScenario(base, params);
  },
  baseline(base) {
    return computeCellStates(base, defaultParams(base));
  },
};

/** The single swap line: replace with a validated model service later. */
export const scenarioService: ScenarioService = demoScenarioService;

export function makeScenarioIndustry(input: {
  name: string;
  category: IndustryCategory;
  location: LonLat;
  emissionIntensity: number;
  controlEfficiency?: number;
  mainPollutants?: Pollutant[];
}): Industry {
  return {
    id: uid('industry-new'),
    name: input.name,
    category: input.category,
    location: input.location,
    emissionIntensity: input.emissionIntensity,
    controlEfficiency: input.controlEfficiency ?? 0.5,
    mainPollutants: input.mainPollutants ?? ['pm25', 'no2'],
    emissionProfile: 'User-defined scenario source',
    status: 'Scenario (added)',
    scenarioAdded: true,
  };
}
