import { describe, expect, it } from 'vitest';
import type { SiteProject } from '../types';
import type { SiteAssessment, SiteMetrics } from './locationComparison';
import { NEAR_TIE, buildRecommendations } from './recommendations';

const project: SiteProject = { category: 'Chemical', intensity: 60, greenBuffer: false };
const site = (id: string, rank: number, score: number, over: Partial<SiteMetrics> = {}): SiteMetrics => ({
  candidate: { id, location: [73.85, 18.5] },
  meanIncrease: 0.4 + rank * 0.2,
  exposedPopulation: 10000 * rank,
  worstZoneId: 'g10-r1c1',
  worstZoneName: `Zone ${id}`,
  worstZoneIncrease: 1.5 * rank,
  downwindPenalty: 5 * rank,
  score,
  rank,
  ...over,
});
const assessment = (sites: SiteMetrics[], p: SiteProject = project): SiteAssessment => ({ project: p, sites });

describe('buildRecommendations', () => {
  it('returns nothing without sites', () => {
    expect(buildRecommendations(assessment([]))).toEqual([]);
  });

  it('follows the table order and says prefer / avoid', () => {
    const recs = buildRecommendations(assessment([site('C', 1, 0), site('A', 2, 0.4), site('B', 3, 1)]));
    expect(recs.map((r) => r.candidateId)).toEqual(['C', 'A', 'B']);
    expect(recs[0].headline).toMatch(/^Prefer site C/);
    expect(recs[1].headline).toMatch(/^Site A \(rank 2\)/);
    expect(recs[2].headline).toMatch(/^Avoid site B/);
    expect(recs.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('quotes the same numbers as the table', () => {
    const s = site('C', 1, 0, { meanIncrease: 0.6234, exposedPopulation: 12345 });
    const [r] = buildRecommendations(assessment([s, site('A', 2, 1)]));
    expect(r.headline).toContain('+0.62 ug/m3');
    expect(r.headline).toContain('12,345');
    expect(r.detail).toContain('Zone C');
    expect(r.detail).toContain('(+1.5 ug/m3)');
  });

  it('warns when the top two sites are a near tie', () => {
    const close = buildRecommendations(assessment([site('A', 1, 0.1), site('B', 2, 0.1 + NEAR_TIE / 2)]));
    expect(close[0].caveats.join(' ')).toMatch(/not decisive/);
    const apart = buildRecommendations(assessment([site('A', 1, 0), site('B', 2, 0.9)]));
    expect(apart[0].caveats.join(' ')).not.toMatch(/not decisive/);
  });

  it('adds caveats for one site, a big single-zone rise, a green buffer and the model itself', () => {
    const one = buildRecommendations(assessment([site('A', 1, 0, { worstZoneIncrease: 4 })], { ...project, greenBuffer: true }));
    const text = one[0].caveats.join(' ');
    expect(text).toMatch(/at least two candidates/);
    expect(text).toMatch(/sensitive receptors/);
    expect(text).toMatch(/green buffer/i);
    expect(text).toMatch(/compare sites against each other/);
    expect(one[0].headline).toMatch(/^Site A:/);
  });

  it('states how much worse a lower-ranked site is for the city mean', () => {
    const recs = buildRecommendations(assessment([site('A', 1, 0, { meanIncrease: 0.5 }), site('B', 2, 1, { meanIncrease: 1.0 })]));
    expect(recs[1].caveats.join(' ')).toMatch(/100% higher than site A/);
  });
});
