/**
 * PROTOTYPE rule-based pollution model. UNCALIBRATED.
 *
 * This engine is illustrative only: simple, transparent rules (traffic, industry plumes, street
 * canyons, green cover, weather) that produce plausible-looking relative behaviour on DEMO inputs.
 * It is NOT validated against observations and must be replaced by a validated model.
 *
 * The engine is pure and deterministic: the same input always gives the same output. It never
 * uses Math.random (see utils/prng.ts for the seeded PRNG used by the demo data).
 */
import type {
  BaseState,
  CellState,
  Industry,
  LonLat,
  Pollutant,
  ScenarioParams,
  SourceContribution,
  Weather,
} from '../types';
import { haversineKm, offsetKm } from '../utils/geo';
import { riskFromPm25 } from '../utils/colors';

export const MODEL_ID = 'prototype-rule-model';
export const MODEL_VERSION = '0.1.0-demo';

export const POLLUTANTS: Pollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

export interface Coefficients {
  trafficPmAtFull: number;
  industryPmAtFull: number;
  plumeLengthKm: number;
  regionalBackground: number;
  dustBase: number;
  dustPerDensity: number;
  greenPerPoint: number;
  greenBufferBoostPts: number;
  greenBufferEmissionFactor: number;
  greenBufferRadiusKm: number;
}

export const COEF: Coefficients = {
  trafficPmAtFull: 42,
  industryPmAtFull: 62,
  plumeLengthKm: 2.0,
  regionalBackground: 26,
  dustBase: 6,
  dustPerDensity: 8,
  greenPerPoint: 0.004,
  greenBufferBoostPts: 8,
  greenBufferEmissionFactor: 0.85,
  greenBufferRadiusKm: 2.0,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function meteoFactor(w: Weather): number {
  const disp = clamp(1.45 / (0.55 + 0.38 * w.windSpeed), 0.55, 1.7);
  const washout = Math.exp(-0.05 * w.rainfall);
  const humid = 1 + 0.004 * (w.humidity - 55);
  const temp = clamp(1 - 0.012 * (w.temperature - 27), 0.8, 1.2);
  const pressure = 1 + 0.004 * (w.pressure - 1010);
  return disp * washout * humid * temp * pressure;
}

/** Plume weight of a source at a receptor: decays with distance, stretched and boosted downwind. */
export function plumeKernel(src: LonLat, rcp: LonLat, w: Weather, coef: Coefficients = COEF): number {
  const d = Math.max(0.35, haversineKm(src, rcp));
  const towards = ((w.windDirection + 180) * Math.PI) / 180;
  const wx = Math.sin(towards);
  const wy = Math.cos(towards);
  const [ex, ny] = offsetKm(src, rcp);
  const norm = Math.hypot(ex, ny);
  const cos = norm === 0 ? 0 : (wx * ex + wy * ny) / norm;
  const ws = Math.min(w.windSpeed, 6) / 6;
  const length = coef.plumeLengthKm * (1 + 0.8 * Math.max(0, cos) * (w.windSpeed / 3));
  const directional = cos > 0 ? 1 + 1.1 * cos * ws : Math.max(0.35, 1 + 0.7 * cos * ws);
  return Math.exp(-d / length) * directional;
}

function activeIndustries(base: BaseState, p: ScenarioParams): Industry[] {
  const removed = new Set(p.removedIndustryIds);
  const kept = base.industries
    .filter((i) => !removed.has(i.id))
    .map((i) =>
      p.industryIntensityOverrides[i.id] !== undefined
        ? { ...i, emissionIntensity: p.industryIntensityOverrides[i.id] }
        : i,
    );
  return [...kept, ...p.addedIndustries];
}

export function computeCellStates(
  base: BaseState,
  params: ScenarioParams,
  coef: Coefficients = COEF,
): CellState[] {
  const w = params.weather;
  const meteo = meteoFactor(w);
  const localScale = base.calibration?.localScale ?? 1;
  const backgroundScale = base.calibration?.backgroundScale ?? 1;
  const industries = activeIndustries(base, params);
  const addedIndustries = params.addedIndustries;
  const target = new Set(params.targetCells);

  // City-wide totals used to size the share of closed-road traffic that lands on its diversion target.
  const roadTotals: Record<string, number> = {};
  for (const c of base.cells) {
    for (const [rid, v] of Object.entries(c.trafficByRoad)) roadTotals[rid] = (roadTotals[rid] ?? 0) + v;
  }
  const closedIds = new Set(params.roadClosures.map((c) => c.roadId));
  const roadFactor: Record<string, number> = {};
  for (const c of params.roadClosures) roadFactor[c.roadId] = 0;
  for (const c of params.roadClosures) {
    if (!c.divertToRoadId || closedIds.has(c.divertToRoadId)) continue;
    const targetTotal = roadTotals[c.divertToRoadId] ?? 0;
    if (targetTotal <= 0) continue;
    const closedTotal = roadTotals[c.roadId] ?? 0;
    roadFactor[c.divertToRoadId] =
      (roadFactor[c.divertToRoadId] ?? 1) + (c.diversionShare * closedTotal) / targetTotal;
  }

  return base.cells.map((cell): CellState => {
    let traffic = 0;
    for (const [rid, v] of Object.entries(cell.trafficByRoad)) {
      traffic += v * (roadFactor[rid] ?? 1);
    }
    traffic += cell.localTraffic;
    for (const c of params.roadClosures) {
      const closedHere = cell.trafficByRoad[c.roadId] ?? 0;
      const undiverted = c.divertToRoadId ? 1 - c.diversionShare : 1;
      traffic += closedHere * undiverted * 0.4;
    }
    traffic *= params.trafficMultiplier * (target.has(cell.id) ? params.areaTrafficMultiplier : 1);
    traffic *= 1 - params.publicTransportShift;
    traffic = clamp(traffic, 0, 140);

    const nearAdded =
      params.greenBuffer &&
      addedIndustries.some((i) => haversineKm(i.location, cell.center) <= coef.greenBufferRadiusKm);
    const green = clamp(
      cell.greenCover + params.greenCoverDelta + (nearAdded ? coef.greenBufferBoostPts : 0),
      0,
      95,
    );
    const density = clamp(cell.buildingDensity + params.buildingDensityDelta, 0.02, 0.98);
    const height = cell.avgBuildingHeight * params.buildingHeightMultiplier;
    const canyon = clamp(1 + 0.3 * (density - 0.4) + 0.12 * (height / 25 - 1) * density, 0.8, 1.5);
    const greenFactor = 1 - coef.greenPerPoint * green;
    const localMod = canyon * greenFactor * meteo;

    const trafficPM = (traffic / 100) * coef.trafficPmAtFull * (1 - params.vehicleEmissionControl);

    let industryPM = 0;
    let industrySO2 = 0;
    let industryNO2 = 0;
    for (const ind of industries) {
      const control = 1 - (1 - ind.controlEfficiency) * (1 - params.industrialControl);
      const buffered = params.greenBuffer && ind.scenarioAdded ? coef.greenBufferEmissionFactor : 1;
      const e = (ind.emissionIntensity / 100) * (1 - control) * coef.industryPmAtFull * buffered;
      const contribution = e * plumeKernel(ind.location, cell.center, w);
      industryPM += contribution;
      industrySO2 += contribution * (ind.mainPollutants.includes('so2') ? 1 : 0.25);
      industryNO2 += contribution * (ind.mainPollutants.includes('no2') ? 1 : 0.3);
    }

    const otherPM = (coef.dustBase + coef.dustPerDensity * density) * Math.exp(-0.1 * w.rainfall);

    const contributionAbs: SourceContribution = {
      traffic: trafficPM * localMod * localScale,
      industry: industryPM * localMod * localScale,
      other: otherPM * localMod * localScale,
      background: coef.regionalBackground * (0.5 + 0.5 * meteo) * backgroundScale,
    };
    const pm25 =
      contributionAbs.traffic + contributionAbs.industry + contributionAbs.other + contributionAbs.background;
    const pm10 = pm25 * 1.45 + contributionAbs.other * 1.6 + contributionAbs.traffic * 0.4;
    const no2 = (9 + trafficPM * 1.5 + industryNO2 * 0.5) * meteo * canyon;
    const so2 = (3 + industrySO2 * 0.55) * meteo;
    const co = (0.35 + trafficPM * 0.035) * meteo * canyon;
    const o3 = clamp(40 + (w.temperature - 25) * 2.2 - no2 * 0.18 + (1 - meteo) * 10, 5, 150);
    const temperature = w.temperature + 1.8 * density - 0.03 * green;

    return {
      cellId: cell.id,
      pm25,
      pm10,
      no2,
      so2,
      co,
      o3,
      trafficIntensity: traffic,
      industrialInfluence: contributionAbs.industry,
      greenCover: green,
      buildingDensity: density,
      temperature,
      windInfluence: meteo,
      risk: riskFromPm25(pm25),
      contributionAbs,
    };
  });
}

export function meanContribution(states: CellState[]): SourceContribution {
  const out: SourceContribution = { traffic: 0, industry: 0, background: 0, other: 0 };
  if (states.length === 0) return out;
  for (const s of states) {
    out.traffic += s.contributionAbs.traffic;
    out.industry += s.contributionAbs.industry;
    out.background += s.contributionAbs.background;
    out.other += s.contributionAbs.other;
  }
  const n = states.length;
  return {
    traffic: out.traffic / n,
    industry: out.industry / n,
    background: out.background / n,
    other: out.other / n,
  };
}
