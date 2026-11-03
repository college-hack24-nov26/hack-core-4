import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  areaContains,
  distanceToAreaKm,
  loadIndustryData,
  normaliseIndustryData,
  ringsOf,
  sitesInArea,
  sourcesInOrNear,
} from './industryData';
import { FIXTURE } from './__fixtures__/industryFixture';

const sq = (w: number, s: number, e: number, n: number) => [[[w, s], [e, s], [e, n], [w, n], [w, s]]];
const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
afterEach(() => vi.unstubAllGlobals());

describe('normaliseIndustryData', () => {
  const d = normaliseIndustryData(FIXTURE)!;

  it('keeps valid estates, sites, factors, district totals and weather cases', () => {
    expect(d.areas.map((a) => a.code)).toEqual([501, 502]);
    expect(d.sites.map((s) => s.id)).toEqual(['node/1', 'node/2', 'node/3']);
    expect(d.emissionFactors.map((f) => f.fuel)).toEqual(['wood']);
    expect(d.districtEmissions[0].tonnesPerYear.pm25).toBe(6616);
    expect(d.weatherCases).toHaveLength(1);
    expect(d.warnings).toEqual(['a warning']);
    expect(d.areas[0].plots).toEqual({ total: 10 });
  });

  it('rejects things that are not the dataset', () => {
    expect(normaliseIndustryData(null)).toBeNull();
    expect(normaliseIndustryData({})).toBeNull();
    expect(normaliseIndustryData({ areas: [] })).toBeNull();
    expect(normaliseIndustryData({ areas: [], sites: [] })).not.toBeNull(); // empty but well-formed
  });

  it('extracts outer rings from Polygon and MultiPolygon', () => {
    expect(ringsOf({ type: 'Polygon', coordinates: sq(0, 0, 1, 1) })).toHaveLength(1);
    expect(d.areas[1].rings).toHaveLength(2);
    expect(ringsOf(null)).toEqual([]);
    expect(ringsOf({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
  });
});

describe('loadIndustryData', () => {
  it('returns a typed "not loaded" state when the file is missing (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({}, 404)));
    const r = await loadIndustryData();
    expect(r).toEqual({ status: 'not-loaded', reason: 'Industry dataset not loaded.' });
  });

  it('treats an HTML fallback page (non-JSON) as not loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }) as unknown as Response));
    expect((await loadIndustryData()).status).toBe('not-loaded');
  });

  it('treats a network failure and an unrecognised file as not loaded, with the reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('x'); }));
    expect(await loadIndustryData()).toMatchObject({ status: 'not-loaded', reason: expect.stringMatching(/could not be read/) });
    vi.stubGlobal('fetch', vi.fn(async () => res({ hello: 'world' })));
    expect(await loadIndustryData()).toMatchObject({ status: 'not-loaded', reason: expect.stringMatching(/expected format/) });
  });

  it('loads and normalises a good file from the documented path', async () => {
    const f = vi.fn(async (_url: string) => res(FIXTURE));
    vi.stubGlobal('fetch', f);
    const r = await loadIndustryData();
    expect(String(f.mock.calls[0][0])).toBe('/data/industry/industry_data.json');
    expect(r.status).toBe('loaded');
    if (r.status === 'loaded') expect(r.data.areas).toHaveLength(2);
  });
});

describe('finding sources in or near an estate', () => {
  const d = normaliseIndustryData(FIXTURE)!;
  const estate = d.areas[0];

  it('knows inside, near and far', () => {
    expect(areaContains(estate, [73.9, 18.6])).toBe(true);
    expect(areaContains(estate, [73.95, 18.6])).toBe(false);
    expect(distanceToAreaKm(estate, [73.9, 18.6])).toBe(0);
    const near = distanceToAreaKm(estate, [73.9, 18.6135]); // about 0.3 km above the north edge
    expect(near).toBeGreaterThan(0.2);
    expect(near).toBeLessThan(0.5);
    expect(distanceToAreaKm({ ...estate, rings: [] }, [73.9, 18.6])).toBe(Infinity);
  });

  it('takes everything inside or within 1 km, and nothing farther', () => {
    const found = sourcesInOrNear(estate, d.sites).map((s) => s.id);
    expect(found).toEqual(['node/1', 'node/2']);
    expect(sourcesInOrNear(estate, d.sites, 0.1).map((s) => s.id)).toEqual(['node/1']);
  });

  it('lists the mapped sites that belong to an estate (by code or boundary)', () => {
    expect(sitesInArea(d, estate).map((s) => s.id)).toEqual(['node/1']);
  });
});
