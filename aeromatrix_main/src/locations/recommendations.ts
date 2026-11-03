import { fmt, fmtInt } from '../utils/format';
import type { SiteAssessment, SiteMetrics } from './locationComparison';

export interface Recommendation {
  rank: number;
  candidateId: string;
  headline: string;
  detail: string;
  caveats: string[];
}

/** Scores closer than this (on the 0-1 scale) are treated as a near tie. */
export const NEAR_TIE = 0.05;

const MODEL_CAVEAT =
  'Prototype model on DEMO inputs: use it to compare sites against each other, not as a permit-grade assessment.';

const describe = (s: SiteMetrics) =>
  `+${fmt(s.meanIncrease, 2)} ug/m3 city mean PM2.5, ${fmtInt(s.exposedPopulation)} people exposed to increases`;

/** Ranked plain-language recommendations. Every number comes from the same table the UI shows. */
export function buildRecommendations(a: SiteAssessment): Recommendation[] {
  const sites = a.sites;
  if (sites.length === 0) return [];
  const best = sites[0];
  return sites.map((s, i) => {
    const caveats: string[] = [MODEL_CAVEAT];
    if (sites.length === 1) caveats.push('Only one site was evaluated: pick at least two candidates to compare.');
    if (i === 0 && sites.length > 1 && sites[1].score - s.score < NEAR_TIE) {
      caveats.push(`Site ${sites[1].candidate.id} scores almost the same: the difference is not decisive.`);
    }
    if (s.worstZoneIncrease >= 3) {
      caveats.push(`The worst-affected zone rises by ${fmt(s.worstZoneIncrease)} ug/m3: check it for sensitive receptors.`);
    }
    if (a.project.greenBuffer) caveats.push('A green buffer is assumed around the new unit (reduces emissions by 15% in the model).');
    const worst = s.worstZoneName ? `Worst-affected zone: ${s.worstZoneName} (+${fmt(s.worstZoneIncrease)} ug/m3). ` : '';
    const detail = `${worst}Downwind residential penalty ${fmt(s.downwindPenalty)}. Composite score ${fmt(s.score, 2)} (0 = best).`;
    let headline: string;
    if (sites.length === 1) headline = `Site ${s.candidate.id}: ${describe(s)}`;
    else if (i === 0) headline = `Prefer site ${s.candidate.id}: ${describe(s)}`;
    else if (i === sites.length - 1) headline = `Avoid site ${s.candidate.id}: ${describe(s)}`;
    else headline = `Site ${s.candidate.id} (rank ${s.rank}): ${describe(s)}`;
    if (i > 0 && best.meanIncrease > 0) {
      const extra = ((s.meanIncrease - best.meanIncrease) / best.meanIncrease) * 100;
      if (extra > 1) caveats.push(`City-wide PM2.5 impact is ${fmt(extra, 0)}% higher than site ${best.candidate.id}.`);
    }
    return { rank: s.rank, candidateId: s.candidate.id, headline, detail, caveats };
  });
}
