import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState, CandidateLocation, SiteProject } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { SITE_WEIGHTS, compareSites } from './locationComparison';

let base: BaseState;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

const project: SiteProject = { category: 'Manufacturing', intensity: 70, greenBuffer: false };
const cands = (...pts: Array<[number, number]>): CandidateLocation[] =>
  pts.map((location, i) => ({ id: 'ABCDE'[i], location }));

describe('compareSites', () => {
  it('weights sum to one', () => {
    const w = Object.values(SITE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(w).toBeCloseTo(1, 10);
  });

  it('ranks every candidate with ascending scores and ranks 1..n', async () => {
    const a = await compareSites(base, cands([73.855, 18.52], [73.972, 18.448], [73.8, 18.6], [73.92, 18.55], [73.77, 18.47]), project);
    expect(a.sites).toHaveLength(5);
    a.sites.forEach((s, i) => {
      expect(s.rank).toBe(i + 1);
      if (i > 0) expect(s.score).toBeGreaterThanOrEqual(a.sites[i - 1].score);
      expect(s.meanIncrease).toBeGreaterThan(0);
      expect(s.worstZoneId).not.toBeNull();
    });
    expect(new Set(a.sites.map((s) => s.candidate.id)).size).toBe(5);
  });

  it('prefers a sparse periphery site over a dense city-centre site', async () => {
    const a = await compareSites(base, cands([73.855, 18.52], [73.972, 18.448]), project);
    expect(a.sites[0].candidate.id).toBe('B');
    expect(a.sites[0].exposedPopulation).toBeLessThan(a.sites[1].exposedPopulation);
  });

  it('a green buffer lowers the impact of the same site', async () => {
    const pt = cands([73.9, 18.55]);
    const plain = await compareSites(base, pt, project);
    const buffered = await compareSites(base, pt, { ...project, greenBuffer: true });
    expect(buffered.sites[0].meanIncrease).toBeLessThan(plain.sites[0].meanIncrease);
  });

  it('a higher intensity means a bigger impact', async () => {
    const pt = cands([73.9, 18.55]);
    const low = await compareSites(base, pt, { ...project, intensity: 20 });
    const high = await compareSites(base, pt, { ...project, intensity: 90 });
    expect(high.sites[0].meanIncrease).toBeGreaterThan(low.sites[0].meanIncrease);
    expect(high.sites[0].worstZoneIncrease).toBeGreaterThan(low.sites[0].worstZoneIncrease);
  });

  it('is deterministic', async () => {
    const pts = cands([73.855, 18.52], [73.9, 18.57], [73.8, 18.6]);
    const a = await compareSites(base, pts, project);
    const b = await compareSites(base, pts, project);
    expect(a.sites.map((s) => [s.candidate.id, s.score, s.meanIncrease])).toEqual(b.sites.map((s) => [s.candidate.id, s.score, s.meanIncrease]));
  });

  it('handles a single candidate and none', async () => {
    const one = await compareSites(base, cands([73.9, 18.55]), project);
    expect(one.sites).toHaveLength(1);
    expect(one.sites[0].score).toBe(0);
    expect((await compareSites(base, [], project)).sites).toEqual([]);
  });
});
