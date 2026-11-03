import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState, LonLat } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { elementsToGeometry, type OsmSnapshot } from '../services/osmGeometry';
import { OM_POLLUTANTS } from '../services/openMeteo';
import type { Pollutant } from '../types';
import { parseApportionment, projectShares, sharesFor } from './lib/apportionment';
import { COST_GROUPS, costBreakdown, groupOf, runningRates } from './lib/costs';
import { simplifyRing } from './lib/geo';
import { dailyFromPoint, summariseWeek, weekTrend, type DailyPoint } from './lib/history';
import { NO_MEASURES, RESTRICTION_CUT, runMeasures } from './lib/measures';
import { applyLiteMode, isLowPower } from './lib/perf';
import { zoneHotspots, stationHotspots } from './lib/hotspots';
import type { ZoneRow } from './lib/airdata';
import type { CostLine } from '../plan/costModel';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 3, 6, 30); // 12:00 IST on 3 Nov 2026

function series(pm25At: (hoursFromNow: number) => number) {
  const start = Math.floor(NOW / HOUR) * HOUR - 7 * 24 * HOUR - 6 * HOUR;
  const times: number[] = [];
  for (let i = 0; i < 7 * 24 + 6 + 30; i++) times.push((start + i * HOUR) / 1000);
  const constant: Record<Pollutant, number> = { pm25: 0, pm10: 0, no2: 30, so2: 10, co: 0.5, o3: 40 };
  const hourly = {} as Record<Pollutant, number[]>;
  for (const p of OM_POLLUTANTS) hourly[p] = times.map((t) => (p === 'pm25' ? pm25At((t * 1000 - NOW) / HOUR) : p === 'pm10' ? pm25At((t * 1000 - NOW) / HOUR) * 1.8 : constant[p]));
  return { times, hourly };
}

describe('weekly history', () => {
  it('builds seven IST days, oldest first, with a daily PM2.5 mean and the AQI at the end of the day', () => {
    const d = dailyFromPoint(series(() => 100), NOW, 7);
    expect(d).toHaveLength(7);
    expect(d[6].date).toBe('2026-11-03');
    expect(d[0].date).toBe('2026-10-28');
    for (const day of d) {
      expect(day.pm25).toBeCloseTo(100, 6);
      expect(day.category).toBe('Poor');
    }
  });

  it('counts the days at Moderate or worse and Poor or worse, and the weekly direction', () => {
    // clean for four days, then worsening
    const d = dailyFromPoint(series((h) => (h > -72 ? 130 : 35)), NOW, 7);
    const s = summariseWeek(d);
    expect(s.days).toBe(7);
    expect(s.poorDays).toBeGreaterThanOrEqual(3);
    expect(s.moderateDays).toBeGreaterThanOrEqual(s.poorDays);
    expect(weekTrend(d)?.direction).toBe('up');
    const falling = dailyFromPoint(series((h) => (h > -72 ? 35 : 130)), NOW, 7);
    expect(weekTrend(falling)?.direction).toBe('down');
  });

  it('leaves out a day with too little data instead of inventing it', () => {
    const s = series(() => 80);
    const short = { times: s.times.slice(-55), hourly: Object.fromEntries(Object.entries(s.hourly).map(([k, v]) => [k, v.slice(-55)])) } as unknown as Parameters<typeof dailyFromPoint>[0];
    const d = dailyFromPoint(short, NOW, 7);
    expect(d[0].pm25).toBeNull();
    expect(d[0].aqi).toBeNull();
    expect(d[6].pm25).not.toBeNull();
    expect(weekTrend(d)).toBeNull();
  });
});

describe('source apportionment', () => {
  const good = {
    study: 'A study',
    year: 2023,
    sources: [
      { key: 'traffic', label: 'Traffic', percent: 40 },
      { key: 'industry', label: 'Industry', percent: 30 },
      { key: 'dust', label: 'Dust', percent: 30 },
    ],
    areas: [{ name: 'Hadapsar', sources: [{ key: 'traffic', label: 'Traffic', percent: 60 }, { key: 'dust', label: 'Dust', percent: 40 }] }],
  };

  it('accepts a complete study and rejects anything that does not add up or name its study', () => {
    expect(parseApportionment(good).status).toBe('loaded');
    expect(parseApportionment({ ...good, sources: [{ key: 'a', label: 'A', percent: 50 }, { key: 'b', label: 'B', percent: 30 }] }).status).toBe('unavailable');
    expect(parseApportionment({ ...good, study: '' }).status).toBe('unavailable');
    expect(parseApportionment({ ...good, sources: [{ key: 'a', label: 'A', percent: 100 }] }).status).toBe('unavailable');
    expect(parseApportionment({ ...good, sources: [{ key: 'a', label: 'A', percent: 150 }, { key: 'b', label: 'B', percent: -50 }] }).status).toBe('unavailable');
    expect(parseApportionment('nope').status).toBe('unavailable');
  });

  it('uses an area-specific study when there is one, else the whole-city shares', () => {
    const load = parseApportionment(good);
    expect(sharesFor(load, 'hadapsar')?.shares.map((s) => s.percent)).toEqual([60, 40]);
    expect(sharesFor(load, 'Katraj')?.scope).toBe('the city');
    expect(sharesFor({ status: 'unavailable', reason: 'x' }, 'Katraj')).toBeNull();
  });

  it('projects shares by cutting traffic and industry only, and returns null when nothing applies', () => {
    const shares = good.sources;
    const p = projectShares(shares, 100, { traffic: 0.5, industry: 0 })!;
    expect(p.after).toBeCloseTo(80, 8); // 40 -> 20
    expect(p.shares.find((s) => s.key === 'traffic')!.percent).toBeCloseTo(25, 8);
    expect(p.shares.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(100, 8);
    expect(projectShares(shares, 100, { traffic: 0, industry: 0 })).toBeNull();
    expect(projectShares([{ key: 'dust', label: 'Dust', percent: 50 }, { key: 'other', label: 'Other', percent: 50 }], 100, { traffic: 0.3, industry: 0.3 })).toBeNull();
    expect(projectShares(shares, 0, { traffic: 0.3, industry: 0 })).toBeNull();
  });
});

describe('cost presentation', () => {
  const line = (priceId: string, category: CostLine['category'], total: number, recurring = false): CostLine => ({ category, priceId, item: priceId, quantity: 1, unit: 'x', unitPrice: total, total, kind: 'sourced', recurring });

  it('groups lines by what they pay for and adds them up exactly', () => {
    const lines = [line('anprCamera', 'Equipment', 100), line('tankerTrip', 'Transport', 50), line('tankerTrip', 'Maintenance', 30, true), line('labourDay', 'Labour', 20), line('power', 'Utilities', 10, true), line('filterBag', 'Maintenance', 5, true)];
    expect(groupOf(lines[2])).toBe('Vehicles and tankers');
    const b = costBreakdown(lines);
    expect(b.groups.map((g) => g.group)).toEqual(COST_GROUPS);
    expect(b.oneTime).toBe(170);
    expect(b.running).toBe(45);
    expect(b.total).toBe(215);
    expect(b.groups.reduce((a, g) => a + g.total, 0)).toBe(b.total);
  });

  it('spreads running costs over the year and a dust programme over its days', () => {
    const r = runningRates(365_000, { total: 140_000, days: 14 });
    expect(r.perDay).toBe(1000 + 10_000);
    expect(r.perWeek).toBe(r.perDay * 7);
    expect(r.perMonth).toBe(r.perDay * 30);
    expect(r.basis).toHaveLength(2);
    expect(runningRates(0, null)).toMatchObject({ perDay: 0, perWeek: 0, perMonth: 0, basis: [] });
  });
});

describe('industrial restriction', () => {
  let base: BaseState;
  beforeAll(async () => {
    const snap = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/pune-osm-snapshot.json'), 'utf8')) as OsmSnapshot;
    base = await demoDataProvider.getBaseState(10, elementsToGeometry(snap.elements));
  });
  const withIndustry = () => base.cells.find((c) => base.industries.some((i) => i.location[0] >= c.bounds.west && i.location[0] < c.bounds.east && i.location[1] >= c.bounds.south && i.location[1] <= c.bounds.north));

  it('has a modelled effect, no invented price, and says so', () => {
    const cell = withIndustry();
    if (!cell) return;
    const o = runMeasures({ base, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, industry: 1, industryMode: 'restrict' } })!;
    expect(o.options[0].lines).toEqual([]);
    expect(o.total).toBe(0);
    expect(o.costNotes.join(' ')).toMatch(/no cost is given/i);
    expect(o.modelledEffect).toBe(true);
    expect(o.cuts.industry).toBeGreaterThan(0);
    expect(o.cuts.industry).toBeCloseTo((RESTRICTION_CUT * 1) / o.options[0].quantity / (o.options[0].quantity === 1 ? 1 : 1), 5);
  });

  it('costs filters from the price list when the mode is controls', () => {
    const cell = withIndustry();
    if (!cell) return;
    const o = runMeasures({ base, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, industry: 1, industryMode: 'controls' } })!;
    expect(o.total).toBeGreaterThan(0);
    expect(o.costNotes).toEqual([]);
  });
});

describe('low power and phone helpers', () => {
  it('turns lite mode on for weak, data-saving or reduced-motion devices only', () => {
    const ok = { reducedMotion: false, saveData: false, deviceMemory: 8, cores: 8 };
    expect(isLowPower(ok)).toBe(false);
    expect(isLowPower({ ...ok, reducedMotion: true })).toBe(true);
    expect(isLowPower({ ...ok, saveData: true })).toBe(true);
    expect(isLowPower({ ...ok, deviceMemory: 2 })).toBe(true);
    expect(isLowPower({ ...ok, cores: 2 })).toBe(true);
    expect(isLowPower({ ...ok, deviceMemory: null, cores: null })).toBe(false);
    expect(typeof applyLiteMode).toBe('function');
  });

  it('keeps the ends of a boundary and caps its points', () => {
    const ring: LonLat[] = Array.from({ length: 500 }, (_, i) => [i, i * 2]);
    const s = simplifyRing(ring, 60);
    expect(s).toHaveLength(60);
    expect(s[0]).toEqual(ring[0]);
    expect(s[59]).toEqual(ring[499]);
    expect(simplifyRing(ring.slice(0, 10), 60)).toHaveLength(10);
  });
});

describe('hotspots ranked by pollutant', () => {
  const z = (id: string, name: string, aqi: number, pm25: number, no2: number): ZoneRow =>
    ({ id, place: name, location: [73.9, 18.5], gridKey: id, aqi, category: 'Moderate', dominant: 'pm25', subindices: [], values: { pm25, no2 }, pm25, pm10: null, time: 0, trend: 'flat', trendPct: 0, forecast: [], causes: [] }) as ZoneRow;
  const zones = [z('a', 'Alpha', 150, 40, 90), z('b', 'Beta', 120, 70, 20), z('c', 'Gamma', 100, 55, 60)];

  it('orders by AQI by default and by the chosen pollutant otherwise, with its unit', () => {
    expect(zoneHotspots(zones).map((h) => h.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    const pm = zoneHotspots(zones, 'pm25');
    expect(pm.map((h) => h.name)).toEqual(['Beta', 'Gamma', 'Alpha']);
    expect(pm[0]).toMatchObject({ metricValue: 70, metricUnit: 'µg/m³', metricLabel: 'PM2.5' });
    expect(zoneHotspots(zones, 'no2').map((h) => h.name)).toEqual(['Alpha', 'Gamma', 'Beta']);
  });

  it('leaves out areas that have no value for the pollutant', () => {
    expect(zoneHotspots(zones, 'so2')).toEqual([]);
    expect(stationHotspots([], zones, 'pm25')).toEqual([]);
  });
});

describe('week summary type', () => {
  it('handles a week with no AQI at all', () => {
    const empty: DailyPoint[] = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 1}`, aqi: null, category: null, pm25: null, pm10: null }));
    expect(summariseWeek(empty)).toEqual({ days: 0, moderateDays: 0, poorDays: 0, meanAqi: null });
  });
});
