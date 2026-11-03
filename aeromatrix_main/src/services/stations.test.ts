import { afterEach, describe, expect, it, vi } from 'vitest';
import examples from './__fixtures__/trained_model_RESPONSE_EXAMPLES.json';
import type { ApiForecast, ApiStation } from './aeromatrixApi';
import { buildStationCatalog, loadVerifiedStations, placedStations, type VerifiedLoad, type VerifiedStationFile } from './stations';

const ex = examples as unknown as Record<string, ApiForecast>;
const hadapsar: ApiStation = ex.Hadapsar.region; // station site_5407, coordinates null
const alandi: ApiStation = ex.Alandi.region; // station site_5405, coordinates null
const withCoords: ApiStation = { ...hadapsar, station: 'site_x', name: 'Service Place', aliases: [], latitude: 18.55, longitude: 73.8 };

const file: VerifiedStationFile = {
  _sources: { CPCB_CAAQMS_LIST: 'CPCB list' },
  stations: [
    { station: 'site_5407', name: 'Hadapsar', agency: 'IITM', city: 'Pune', latitude: 18.5018, longitude: 73.9275, sources: ['CPCB_CAAQMS_LIST', 'NGT'] },
    { station: 'site_5405', name: 'Alandi', agency: 'IITM', city: 'Pune', latitude: 18.6751, longitude: 73.8927, sources: ['CPCB_CAAQMS_LIST'], single_source: true },
    { station: 'site_5764', name: 'Park Street Wakad', agency: 'MPCB', city: 'Pimpri-Chinchwad', latitude: 18.5905, longitude: 73.7795, sources: ['CPCB_FEED_VIA_AQICN'], single_source: true, note: 'a note' },
  ],
  unlocated: [{ name: 'Dange Chowk', reason: 'no coordinates found' }],
};
const loaded: VerifiedLoad = { status: 'loaded', file };

const res = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
afterEach(() => vi.unstubAllGlobals());

describe('buildStationCatalog', () => {
  it('takes coordinates from the verified file when the service gives none, and says where they came from', () => {
    const c = buildStationCatalog([hadapsar, alandi], loaded);
    const h = c.stations.find((s) => s.id === 'site_5407')!;
    expect(h).toMatchObject({ lat: 18.5018, lon: 73.9275, coordSource: 'verified', singleSource: false, agency: 'IITM' });
    expect(h.sources).toEqual(['CPCB_CAAQMS_LIST', 'NGT']);
    expect(h.api).toBe(hadapsar); // it has a data feed
    expect(c.stations.find((s) => s.id === 'site_5405')!.singleSource).toBe(true);
    expect(c.notice).toBeNull();
  });

  it('prefers a non-null service coordinate', () => {
    const c = buildStationCatalog([withCoords], loaded);
    expect(c.stations[0]).toMatchObject({ lat: 18.55, lon: 73.8, coordSource: 'service' });
  });

  it('draws verified stations the service does not know, with no data feed', () => {
    const c = buildStationCatalog([hadapsar], loaded);
    const wakad = c.stations.find((s) => s.name === 'Park Street Wakad')!;
    expect(wakad.api).toBeNull();
    expect(wakad.note).toBe('a note');
    expect(placedStations(c).map((s) => s.name).sort()).toEqual(['Alandi', 'Hadapsar', 'Park Street Wakad']); // verified-only stations are drawn too
  });

  it('lists "unlocated" stations but never draws them', () => {
    const c = buildStationCatalog([hadapsar], loaded);
    expect(c.unlocated).toEqual([{ name: 'Dange Chowk', reason: 'no coordinates found' }]);
    expect(c.stations.some((s) => s.name.includes('Dange'))).toBe(false);
  });

  it('draws nothing and says why when neither the service nor the file has a coordinate', () => {
    const c = buildStationCatalog([hadapsar, alandi], { status: 'not-loaded', reason: 'The sourced station coordinate list (station_coordinates_verified.json) is not loaded.' });
    expect(placedStations(c)).toEqual([]);
    expect(c.stations).toHaveLength(2); // still listed
    expect(c.notice).toMatch(/no station is drawn/);
    expect(c.notice).toMatch(/not loaded/);
    expect(buildStationCatalog([], null).notice).toMatch(/No stations/);
    expect(buildStationCatalog([], { status: 'not-loaded', reason: 'R' }).notice).toMatch(/not reporting stations/);
  });

  it('matches by normalised name or alias when the ids differ', () => {
    const odd: ApiStation = { ...hadapsar, station: 'other_id', name: 'Revenue Colony-Shivajinagar', aliases: ['Shivajinagar'] };
    const f: VerifiedStationFile = { stations: [{ station: 'site_5409', name: 'Revenue Colony Shivajinagar', agency: 'IITM', city: 'Pune', latitude: 18.5297, longitude: 73.8497, sources: ['A'] }], unlocated: [] };
    const c = buildStationCatalog([odd], { status: 'loaded', file: f });
    expect(c.stations).toHaveLength(1);
    expect(c.stations[0].coordSource).toBe('verified');
  });
});

describe('loadVerifiedStations', () => {
  it('is "not loaded" when the drop-in file is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => res({}, 404)));
    expect(await loadVerifiedStations()).toMatchObject({ status: 'not-loaded', reason: expect.stringMatching(/not loaded/) });
  });

  it('is "not loaded" for an HTML fallback or a file in another format', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }) as unknown as Response));
    expect((await loadVerifiedStations()).status).toBe('not-loaded');
    vi.stubGlobal('fetch', vi.fn(async () => res({ nope: 1 })));
    expect(await loadVerifiedStations()).toMatchObject({ status: 'not-loaded', reason: expect.stringMatching(/expected format/) });
  });

  it('loads the documented schema from the documented path', async () => {
    const f = vi.fn(async (_url: string) => res(file));
    vi.stubGlobal('fetch', f);
    const r = await loadVerifiedStations();
    expect(String(f.mock.calls[0][0])).toBe('/data/station_coordinates_verified.json');
    expect(r.status).toBe('loaded');
    if (r.status === 'loaded') expect(r.file.stations).toHaveLength(3);
  });
});
