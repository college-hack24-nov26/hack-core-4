import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OSM_ATTRIBUTION,
  ROAD_VOLUME_PROXY,
  elementsToGeometry,
  fetchOsmGeometry,
  geometryCounts,
  loadOsmSnapshot,
  overpassToElements,
  type OsmElement,
} from './osmGeometry';
import { buildBaseState } from '../data/demo/demoDataProvider';

// A tiny fixture: two ways of one trunk road, a primary road, a too-short secondary, one park, one industrial zone.
const way = (id: number, kind: OsmElement['kind'], tags: Record<string, string>, coords: Array<[number, number]>): OsmElement => ({
  id,
  kind,
  tags,
  coords,
});
const FIXTURE: OsmElement[] = [
  way(1, 'road', { name: 'Test Road', highway: 'trunk' }, [[73.84, 18.52], [73.85, 18.525], [73.86, 18.53]]),
  way(2, 'road', { name: 'Test Road', highway: 'trunk' }, [[73.86, 18.53], [73.87, 18.535]]),
  way(3, 'road', { name: 'Other Road', highway: 'primary' }, [[73.8, 18.5], [73.82, 18.51]]),
  way(4, 'road', { name: 'Tiny', highway: 'secondary' }, [[73.9, 18.5], [73.9005, 18.5003]]),
  way(5, 'green', { name: 'Test Park', leisure: 'park' }, [[73.81, 18.55], [73.82, 18.55], [73.82, 18.56], [73.81, 18.56], [73.81, 18.55]]),
  way(6, 'industrial', { name: 'Test Works', landuse: 'industrial' }, [[73.9, 18.6], [73.92, 18.6], [73.92, 18.615], [73.9, 18.615], [73.9, 18.6]]),
];

afterEach(() => vi.unstubAllGlobals());

describe('elementsToGeometry', () => {
  const g = elementsToGeometry(FIXTURE);

  it('marks the geometry as OSM and groups ways by name and class', () => {
    expect(g.source).toBe('osm');
    const names = g.roads.map((r) => r.name);
    expect(names).toContain('Test Road');
    expect(names).toContain('Other Road');
    expect(names).not.toContain('Tiny'); // under the minimum length
    const test = g.roads.find((r) => r.name === 'Test Road')!;
    expect(test.paths).toHaveLength(2);
    expect(test.lengthKm).toBeGreaterThan(0.8);
  });

  it('assigns a documented volume proxy from the road class', () => {
    const test = g.roads.find((r) => r.name === 'Test Road')!;
    const other = g.roads.find((r) => r.name === 'Other Road')!;
    expect(test.volume).toBe(ROAD_VOLUME_PROXY.trunk);
    expect(other.volume).toBe(ROAD_VOLUME_PROXY.primary);
    expect(ROAD_VOLUME_PROXY.motorway).toBeGreaterThan(ROAD_VOLUME_PROXY.trunk);
    expect(ROAD_VOLUME_PROXY.primary).toBeGreaterThan(ROAD_VOLUME_PROXY.secondary);
    expect(g.roads[0].volume).toBeGreaterThanOrEqual(g.roads[1].volume);
  });

  it('keeps green areas and industrial zones, and puts an assumed source on the zone', () => {
    expect(g.greenAreas).toHaveLength(1);
    expect(g.industrialAreas).toHaveLength(1);
    expect(g.industries).toHaveLength(1);
    const i = g.industries[0];
    expect(i.name).not.toMatch(/DEMO|demo/);
    expect(i.status).toMatch(/Assumed source/);
    expect(i.emissionIntensity).toBeGreaterThanOrEqual(28);
    expect(i.emissionIntensity).toBeLessThanOrEqual(85);
    expect(i.location[0]).toBeGreaterThan(73.9);
    expect(i.location[0]).toBeLessThan(73.92);
  });

  it('is deterministic and counts what it holds', () => {
    expect(elementsToGeometry(FIXTURE)).toEqual(g);
    expect(geometryCounts(g)).toMatchObject({ roads: 2, green: 1, industrialZones: 1, industries: 1 });
  });

  it('feeds the base-state builder (class-weighted traffic, saturating)', () => {
    const base = buildBaseState(5, g);
    expect(base.geometrySource).toBe('osm');
    expect(base.cells).toHaveLength(25);
    const withRoad = base.cells.filter((c) => Object.keys(c.trafficByRoad).length > 0);
    expect(withRoad.length).toBeGreaterThan(0);
    for (const c of base.cells) {
      const total = Object.values(c.trafficByRoad).reduce((a, v) => a + v, 0);
      expect(total).toBeLessThanOrEqual(100.5);
    }
  });
});

describe('overpassToElements', () => {
  it('converts Overpass geometry and filters tiny or open features', () => {
    const long = [
      { lat: 18.52, lon: 73.84 },
      { lat: 18.53, lon: 73.86 },
    ];
    const els = overpassToElements({
      elements: [
        { type: 'way', id: 10, tags: { highway: 'primary', name: 'Long Rd' }, geometry: long },
        { type: 'way', id: 11, tags: { highway: 'secondary', name: 'Stub' }, geometry: [{ lat: 18.5, lon: 73.9 }, { lat: 18.5002, lon: 73.9002 }] },
        { type: 'way', id: 12, tags: { leisure: 'park' }, geometry: long }, // not closed: dropped
        { type: 'node', id: 13 },
      ],
    });
    expect(els.map((e) => e.id)).toEqual([10]);
    expect(els[0].coords[0]).toEqual([73.84, 18.52]);
  });
});

describe('loading', () => {
  it('reads the bundled snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ meta: { generated: '2026-01-01T00:00:00Z' }, elements: FIXTURE }) }));
    const r = await loadOsmSnapshot('/data/x.json');
    expect(r.geometry.source).toBe('osm');
    expect(r.generated).toBe('2026-01-01T00:00:00Z');
    expect(r.attribution).toBe(OSM_ATTRIBUTION);
  });

  it('fails with a readable message when the snapshot is missing or unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(loadOsmSnapshot()).rejects.toThrow(/snapshot not available/i);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('bad json'); } }));
    await expect(loadOsmSnapshot()).rejects.toThrow(/snapshot not available/i);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) }));
    await expect(loadOsmSnapshot()).rejects.toThrow(/no features/i);
  });

  it('reports a busy Overpass API clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchOsmGeometry(['https://a.example/api'], 1000, 1)).rejects.toThrow(/busy/i);
  });

  it('retries across mirrors and returns geometry from the first that answers', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          elements: [
            { type: 'way', id: 20, tags: { highway: 'trunk', name: 'Live Rd' }, geometry: [{ lat: 18.52, lon: 73.84 }, { lat: 18.53, lon: 73.86 }] },
          ],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const r = await fetchOsmGeometry(['https://a.example/api', 'https://b.example/api'], 1000, 1);
    expect(r.geometry.roads[0].name).toBe('Live Rd');
    expect(r.attribution).toBe(OSM_ATTRIBUTION);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
