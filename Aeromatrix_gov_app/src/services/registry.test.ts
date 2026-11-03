import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildStationCatalog, loadRegistry, mergeVerified, type VerifiedLoad } from './stations';

const file = readFileSync(resolve(__dirname, '../../public/data/monitoring_stations.json'), 'utf8');
const serve = (body: string, ok = true) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, headers: new Headers({ 'content-type': 'application/json' }), json: async () => JSON.parse(body) }));

afterEach(() => vi.unstubAllGlobals());

describe('station registry from the supplied documents', () => {
  it('places the eight Pune continuous stations at their published coordinates', async () => {
    serve(file);
    const r = await loadRegistry();
    expect(r.status).toBe('loaded');
    if (r.status !== 'loaded') return;
    expect(r.file.stations.map((s) => s.name).sort()).toEqual(['Alandi', 'Bhosari', 'Hadapsar', 'Karve Road', 'MIT-Kothrud', 'Mhada Colony', 'Revenue Colony-Shivajinagar', 'Transport Nagar-Nigdi']);
    const hadapsar = r.file.stations.find((s) => s.name === 'Hadapsar')!;
    expect([hadapsar.latitude, hadapsar.longitude]).toEqual([18.5018, 73.9275]);
    expect(r.file.stations.every((s) => s.monitoring === 'continuous')).toBe(true);
  });

  it('lists manual NAMP stations and report-only stations as not placed: no coordinate is invented', async () => {
    serve(file);
    const r = await loadRegistry();
    if (r.status !== 'loaded') throw new Error('not loaded');
    const manual = r.file.unlocated.filter((u) => u.monitoring === 'manual');
    expect(manual.map((u) => u.name)).toEqual(['Swargate Police Chowki', 'State Electricity Board Building, Nal Stop', 'Maratha Chamber of Commerce, Bhosari', 'Bank of Baroda Building, near Pimpri-Chinchwad M.C. Building']);
    expect(r.file.unlocated.map((u) => u.name)).toEqual(expect.arrayContaining(['Dange Chowk Pune', 'Jagtap Dairy Pune', 'Pune Pimpri Rose Garden']));
    expect(r.file.stations.some((s) => s.name.includes('Swargate'))).toBe(false);
  });

  it('keeps stations of other cities out of the Pune map', async () => {
    serve(file);
    const r = await loadRegistry();
    if (r.status !== 'loaded') throw new Error('not loaded');
    expect(r.file.stations.some((s) => /Mumbai|Nagpur|Nashik/.test(s.city))).toBe(false);
  });

  it('is a quiet "not loaded" when the file is missing', async () => {
    serve('{}', false);
    expect((await loadRegistry()).status).toBe('not-loaded');
  });

  it('merges with a drop-in coordinate file without listing a station twice, and feeds the catalog with its type', async () => {
    serve(file);
    const reg = await loadRegistry();
    const drop: VerifiedLoad = { status: 'loaded', file: { stations: [{ station: 'x', name: 'Hadapsar', agency: 'A', city: 'Pune', latitude: 1, longitude: 2, sources: [] }, { station: 'y', name: 'New Place', agency: 'A', city: 'Pune', latitude: 18.6, longitude: 73.8, sources: [], monitoring: 'manual' }], unlocated: [] } };
    const m = mergeVerified(drop, reg);
    if (m.status !== 'loaded') throw new Error('not loaded');
    expect(m.file.stations.filter((s) => s.name === 'Hadapsar')).toHaveLength(1);
    expect(m.file.stations.find((s) => s.name === 'Hadapsar')!.latitude).toBe(18.5018);
    const cat = buildStationCatalog([], m);
    expect(cat.stations.find((s) => s.name === 'New Place')!.monitoring).toBe('manual');
    expect(cat.stations.find((s) => s.name === 'Alandi')!.monitoring).toBe('continuous');
    expect(mergeVerified(drop, { status: 'not-loaded', reason: 'x' })).toBe(drop);
  });
});