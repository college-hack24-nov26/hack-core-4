import type { BaseState, CandidateLocation, ScenarioResult, SiteProject } from '../types';
import { makeScenarioIndustry, defaultParams, scenarioService } from '../services/scenarioService';
import { haversineKm, offsetKm } from '../utils/geo';
import { zoneLabel } from '../utils/zones';

/** Composite score weights (lower score = better site). The metrics are min-max normalised across candidates. */
export const SITE_WEIGHTS = { meanIncrease: 0.35, exposedPopulation: 0.25, worstZone: 0.2, downwindPenalty: 0.2 } as const;

/** Downwind residential penalty only looks this far from the site (km) and within this cone (cosine). */
export const PENALTY_RADIUS_KM = 8;
export const PENALTY_MIN_COS = 0.3;

export interface SiteMetrics {
  candidate: CandidateLocation;
  /** mean city PM2.5 change, ug/m3 */
  meanIncrease: number;
  exposedPopulation: number;
  worstZoneId: string | null;
  worstZoneName: string | null;
  /** largest single-zone PM2.5 increase, ug/m3 */
  worstZoneIncrease: number;
  /** sum over downwind residential / urban-core zones of increase x population / 1000 */
  downwindPenalty: number;
  /** 0 (best) .. 1 (worst) among the compared candidates */
  score: number;
  rank: number;
}

export interface SiteAssessment {
  project: SiteProject;
  sites: SiteMetrics[];
}

export function downwindResidentialPenalty(base: BaseState, result: ScenarioResult, site: [number, number]): number {
  const w = base.weather;
  const towards = ((w.windDirection + 180) * Math.PI) / 180;
  const wx = Math.sin(towards);
  const wy = Math.cos(towards);
  let penalty = 0;
  for (const c of base.cells) {
    if (c.landUse !== 'Residential' && c.landUse !== 'Urban core') continue;
    if (haversineKm(site, c.center) > PENALTY_RADIUS_KM) continue;
    const [ex, ny] = offsetKm(site, c.center);
    const norm = Math.hypot(ex, ny);
    const cos = norm === 0 ? 1 : (wx * ex + wy * ny) / norm;
    if (cos < PENALTY_MIN_COS) continue;
    const inc = Math.max(0, result.delta[c.id]?.pm25 ?? 0);
    penalty += (inc * c.population) / 1000;
  }
  return penalty;
}

function normalise(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((v) => (max - min < 1e-9 ? 0 : (v - min) / (max - min)));
}

/** One scenario per candidate site, ranked on city impact, exposure, worst zone and downwind residential penalty. */
export async function compareSites(
  base: BaseState,
  candidates: CandidateLocation[],
  project: SiteProject,
  names: Record<string, string> = {},
): Promise<SiteAssessment> {
  const cellsById = new Map(base.cells.map((c) => [c.id, c]));
  const raw: Omit<SiteMetrics, 'score' | 'rank'>[] = [];
  for (const cand of candidates) {
    const industry = makeScenarioIndustry({
      name: `Candidate ${cand.id}`,
      category: project.category,
      location: cand.location,
      emissionIntensity: project.intensity,
    });
    const params = {
      ...defaultParams(base),
      name: `Site ${cand.id}`,
      addedIndustries: [industry],
      greenBuffer: project.greenBuffer,
    };
    const result = await scenarioService.run(base, params);
    let worstId: string | null = null;
    let worst = 0;
    for (const [id, d] of Object.entries(result.delta)) {
      if (d.pm25 > worst) {
        worst = d.pm25;
        worstId = id;
      }
    }
    const worstCell = worstId ? cellsById.get(worstId) : undefined;
    raw.push({
      candidate: cand,
      meanIncrease: result.summary.meanDelta,
      exposedPopulation: result.summary.exposedPopulation,
      worstZoneId: worstId,
      worstZoneName: worstCell ? zoneLabel(worstCell, names) : null,
      worstZoneIncrease: worst,
      downwindPenalty: downwindResidentialPenalty(base, result, cand.location),
    });
  }
  const nMean = normalise(raw.map((r) => r.meanIncrease));
  const nExp = normalise(raw.map((r) => r.exposedPopulation));
  const nWorst = normalise(raw.map((r) => r.worstZoneIncrease));
  const nPen = normalise(raw.map((r) => r.downwindPenalty));
  const scored = raw.map((r, i) => ({
    ...r,
    score:
      SITE_WEIGHTS.meanIncrease * nMean[i] +
      SITE_WEIGHTS.exposedPopulation * nExp[i] +
      SITE_WEIGHTS.worstZone * nWorst[i] +
      SITE_WEIGHTS.downwindPenalty * nPen[i],
  }));
  scored.sort((a, b) => a.score - b.score || a.candidate.id.localeCompare(b.candidate.id));
  return { project, sites: scored.map((s, i) => ({ ...s, rank: i + 1 })) };
}
