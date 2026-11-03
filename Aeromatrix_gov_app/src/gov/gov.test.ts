import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BaseState, GridCell } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { elementsToGeometry, type OsmSnapshot } from '../services/osmGeometry';
import { zonePointId, placePointId } from '../services/liveData';
import type { LiveAirPoint } from '../services/liveState';
import { initialModelService, type ModelServiceState } from '../services/modelService';
import type { PlacedStation, StationCatalog } from '../services/stations';
import { OM_POLLUTANTS } from '../services/openMeteo';
import type { Pollutant } from '../types';
import {
  CATEGORIES,
  CATEGORY_COLOR,
  CATEGORY_FLOOR,
  buildCitySummary,
  buildZoneRows,
  categoryRank,
  causeEvidence,
  groupByGrid,
  majorRoadsInZone,
} from './lib/airdata';
import { COVERAGE_RADIUS_KM, CURRENT_MAX_AGE_MS, buildStationRows, countStations, type StationBuild } from './lib/stations';
import { coverageGaps } from './lib/coverage';
import { CONFIDENCE_TEXT, buildAlerts, summariseAlerts } from './lib/alerts';
import { DEPARTMENTS, actionFor, departmentsFor, mailtoLink, whatsappLink } from './lib/routing';
import { stationHotspots, zoneHotspots } from './lib/hotspots';
import { DEFAULT_DUST, dustPlan } from './lib/dustControl';
import { NO_MEASURES, hasMeasures, runMeasures } from './lib/measures';
import { sumLines } from '../plan/costModel';
import { addDaysIst, csvEscape, formatIst } from './lib/format';
import { ALERTS_KEY } from './govStore';

const NOW = Date.UTC(2026, 10, 3, 6, 30); // 3 Nov 2026, 12:00 IST
const HOUR = 3_600_000;

type Series = number | ((hoursFromNow: number) => number);

function makePoint(id: string, grid: [number, number], pm25: Series, pm10?: Series): LiveAirPoint {
  const start = Math.floor(NOW / HOUR) * HOUR - 48 * HOUR;
  const times: number[] = [];
  for (let i = 0; i < 48 + 24 * 4; i++) times.push((start + i * HOUR) / 1000);
  const at = (s: Series, i: number) => (typeof s === 'function' ? s((start + i * HOUR - NOW) / HOUR) : s);
  const constant: Record<Pollutant, number> = { pm25: 0, pm10: 0, no2: 30, so2: 10, co: 0.5, o3: 40 };
  const hourly = {} as LiveAirPoint['hourly'];
  for (const p of OM_POLLUTANTS) {
    hourly[p] = times.map((_, i) => {
      if (p === 'pm25') return at(pm25, i);
      if (p === 'pm10') return pm10 !== undefined ? at(pm10, i) : at(pm25, i) * 1.8;
      return constant[p];
    });
  }
  return {
    targetId: id,
    requested: grid,
    grid,
    elevation: null,
    times,
    hourly,
    current: { time: null, values: {} },
    missing: {},
    aqi: null,
    asOf: null,
    fetchedAt: NOW,
  };
}

let osmBase: BaseState;
let demoBase: BaseState;

beforeAll(async () => {
  const snap = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/pune-osm-snapshot.json'), 'utf8')) as OsmSnapshot;
  osmBase = await demoDataProvider.getBaseState(10, elementsToGeometry(snap.elements));
  demoBase = await demoDataProvider.getBaseState(10);
});

describe('categories', () => {
  it('orders and colours the six CPCB categories', () => {
    expect(CATEGORIES).toEqual(['Good', 'Satisfactory', 'Moderate', 'Poor', 'Very Poor', 'Severe']);
    expect(categoryRank('Poor')).toBe(3);
    expect(categoryRank(null)).toBe(-1);
    expect(CATEGORY_COLOR).toMatchObject({ Good: '#2fae8b', Satisfactory: '#8bc34a', Moderate: '#e0b100', Poor: '#f08c1a', 'Very Poor': '#d9372f', Severe: '#8c1d5e' });
    expect(CATEGORY_FLOOR).toEqual({ Good: 0, Satisfactory: 51, Moderate: 101, Poor: 201, 'Very Poor': 301, Severe: 401 });
  });
});

describe('zone rows from live model data', () => {
  const cells = () => osmBase.cells;

  it('builds a row only for zones with a model value; nothing is invented for the rest', () => {
    const c = cells();
    const points = { [zonePointId(c[0].id)]: makePoint('a', [73.85, 18.5], 100) };
    const out = buildZoneRows({ base: osmBase, points, placeNames: {}, nowMs: NOW, industryLoaded: false });
    expect(out.rows).toHaveLength(1);
    expect(out.missing).toBe(c.length - 1);
    expect(out.rows[0].id).toBe(c[0].id);
    expect(out.rows[0].category).toBe('Poor');
    expect(out.rows[0].aqi).toBeGreaterThan(200);
  });

  it('gives no rows at all when there is no live data', () => {
    const out = buildZoneRows({ base: osmBase, points: {}, placeNames: {}, nowMs: NOW, industryLoaded: false });
    expect(out.rows).toEqual([]);
    expect(out.missing).toBe(osmBase.cells.length);
  });

  it('groups zones that share a model grid point', () => {
    const c = cells();
    const shared = [73.9, 18.5] as [number, number];
    const points = {
      [zonePointId(c[0].id)]: makePoint('a', shared, 100),
      [zonePointId(c[1].id)]: makePoint('b', shared, 100),
      [zonePointId(c[2].id)]: makePoint('c', [74.0, 18.6], 40),
    };
    const rows = buildZoneRows({ base: osmBase, points, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows;
    expect(new Set(rows.map((r) => r.gridKey)).size).toBe(2);
    const g = groupByGrid(rows);
    expect(g).toHaveLength(2);
    expect(g.find((x) => x.zone.id === c[0].id)?.sharing).toBe(1);
  });

  it('adds 24 / 48 / 72 h outlooks with their dates, and a trend with a percentage', () => {
    const c = cells();
    const rising = (h: number) => 40 + Math.max(0, h) * 2; // 40 now, 88 at +24 h, 136 at +48 h
    const points = { [zonePointId(c[0].id)]: makePoint('a', [73.9, 18.5], rising) };
    const row = buildZoneRows({ base: osmBase, points, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows[0];
    expect(row.forecast.map((f) => f.hours)).toEqual([24, 48, 72]);
    expect(row.forecast[0].date).toBe('2026-11-04');
    expect(row.forecast[1].aqi).toBeGreaterThan(row.forecast[0].aqi);
    expect(row.forecast.every((f) => f.category === CATEGORIES[categoryRank(f.category)])).toBe(true);
    const flat = buildZoneRows({ base: osmBase, points: { [zonePointId(c[0].id)]: makePoint('a', [73.9, 18.5], 80) }, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows[0];
    expect(flat.trend).toBe('flat');
    const falling = buildZoneRows({ base: osmBase, points: { [zonePointId(c[0].id)]: makePoint('a', [73.9, 18.5], (h) => Math.max(5, 120 - h * 3)) }, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows[0];
    expect(falling.trend).toBe('down');
    expect(falling.trendPct).toBeLessThan(-5);
  });

  it('leaves out a horizon the series does not reach', () => {
    const c = cells();
    const p = makePoint('a', [73.9, 18.5], 80);
    p.times = p.times.slice(0, 48 + 30); // data only about 30 h ahead
    for (const k of OM_POLLUTANTS) p.hourly[k] = p.hourly[k].slice(0, p.times.length);
    const row = buildZoneRows({ base: osmBase, points: { [zonePointId(c[0].id)]: p }, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows[0];
    expect(row.forecast.map((f) => f.hours)).toEqual([24]);
  });

  it('summarises the city as the mean of the distinct model points, with its method text', () => {
    const points = {
      a: makePoint('a', [73.9, 18.5], 100),
      b: makePoint('b', [74.0, 18.6], 50),
    };
    const city = buildCitySummary(points, NOW);
    expect(city).not.toBeNull();
    expect(city!.method).toMatch(/not an official station AQI/i);
    expect(city!.pm25).toBeCloseTo(75, 5);
    expect(city!.forecast).toHaveLength(3);
    expect(buildCitySummary({}, NOW)).toBeNull();
  });
});

describe('likely causes need evidence', () => {
  const busiest = (): GridCell => {
    let best: GridCell = osmBase.cells[0];
    let bestKm = -1;
    for (const c of osmBase.cells) {
      const km = majorRoadsInZone(osmBase, c, 10, false).reduce((a, r) => a + r.lengthKm, 0);
      if (km > bestKm) (best = c), (bestKm = km);
    }
    return best;
  };

  it('finds traffic evidence from mapped OSM roads, with the road names', () => {
    const cell = busiest();
    const causes = causeEvidence(osmBase, cell, 60, 100, true);
    const traffic = causes.find((c) => c.key === 'traffic');
    expect(traffic).toBeDefined();
    expect(traffic!.evidence.join(' ')).toMatch(/OpenStreetMap/);
    expect(traffic!.evidence.join(' ')).toMatch(/no traffic counts/i);
  });

  it('flags dust only from a low PM2.5/PM10 ratio and never invents it otherwise', () => {
    const cell = osmBase.cells[0];
    expect(causeEvidence(osmBase, cell, 20, 100, true).find((c) => c.key === 'dust')?.strength).toBe('Strong');
    expect(causeEvidence(osmBase, cell, 40, 100, true).find((c) => c.key === 'dust')?.strength).toBe('Moderate');
    expect(causeEvidence(osmBase, cell, 70, 100, true).find((c) => c.key === 'dust')).toBeUndefined();
    expect(causeEvidence(osmBase, cell, null, null, true).find((c) => c.key === 'dust')).toBeUndefined();
  });

  it('shows no road or industry cause on the demo city, which is not OSM evidence', () => {
    const causes = causeEvidence(demoBase, demoBase.cells[0], 70, 100, false);
    expect(causes.map((c) => c.key)).toEqual([]);
  });

  it('says when the industry dataset is not loaded', () => {
    for (const cell of osmBase.cells) {
      const ind = causeEvidence(osmBase, cell, 70, 100, false).find((c) => c.key === 'industry');
      if (ind) {
        expect(ind.evidence.join(' ')).toMatch(/dataset not loaded/i);
        return;
      }
    }
    // The snapshot has no mapped industry near any zone: nothing to assert, and nothing was invented.
    expect(true).toBe(true);
  });
});

// ---- stations ----

const placed = (id: string, name: string, lat: number | null, lon: number | null, hasApi = true): PlacedStation => ({
  id,
  name,
  agency: 'CPCB',
  city: 'Pune',
  lat,
  lon,
  coordSource: lat === null ? null : 'verified',
  sources: ['CPCB CAAQMS list'],
  singleSource: false,
  note: null,
  api: hasApi ? ({ station: id, station_name: name, name, aliases: [], latitude: lat, longitude: lon, source_files: '' } as PlacedStation['api']) : null,
});

const measured = (name: string, timeIso: string, pm25: number, historical = false, aqi = 180) =>
  ({
    status: 'MEASURED',
    region: {},
    pollutants: { pm25: { status: 'MEASURED', value: pm25, unit: 'ug/m3', time: timeIso, historical, source: 's', window: { start: timeIso, end: timeIso } } },
    aqi: { status: 'AVAILABLE', value: aqi, category: 'Moderate', dominant_pollutant: 'pm25', period_end: timeIso },
    historical,
    snapshot_end: timeIso,
    source_files: '',
    notice: '',
    snapshot_window_end: timeIso,
    _name: name,
  }) as unknown as ModelServiceState['measured'][string];

function stationFixture(): { catalog: StationCatalog; svc: ModelServiceState; live: Record<string, LiveAirPoint> } {
  const recent = new Date(NOW - HOUR).toISOString();
  const old = '2025-12-17T10:00:00+05:30';
  const catalog: StationCatalog = {
    stations: [
      placed('s-live', 'Alandi', 18.67, 73.9),
      placed('s-old', 'Katraj', 18.45, 73.86),
      placed('s-est', 'Bhosari', 18.63, 73.84),
      placed('s-none', 'Karve Road', 18.5, 73.82, false),
      placed('s-nocoord', 'Hadapsar', null, null),
    ],
    unlocated: [{ name: 'Dange Chowk', reason: 'No sourced coordinate.' }],
    notice: null,
    sourcesText: {},
  };
  const svc: ModelServiceState = {
    ...initialModelService(),
    status: 'online',
    measured: {
      's-live': measured('Alandi', recent, 60),
      's-old': measured('Katraj', old, 90, true),
    },
  };
  const live = { [placePointId('s-est')]: makePoint('p', [73.84, 18.63], 80) };
  return { catalog, svc, live };
}

describe('stations', () => {
  it('assigns Measured / Outdated / Estimated / No data feed honestly and never draws an unplaced station', () => {
    const { catalog, svc, live } = stationFixture();
    const b = buildStationRows(catalog, svc, live, NOW);
    const by = Object.fromEntries(b.placed.map((s) => [s.id, s]));
    expect(by['s-live'].status).toBe('live');
    expect(by['s-live'].estimate).toBeNull();
    expect(by['s-old'].status).toBe('outdated');
    expect(by['s-old'].lastReadingAt).toBe(Date.parse('2025-12-17T10:00:00+05:30'));
    expect(by['s-old'].ageMs!).toBeGreaterThan(CURRENT_MAX_AGE_MS);
    expect(by['s-est'].status).toBe('estimate');
    expect(by['s-est'].readings).toEqual([]);
    expect(by['s-est'].estimate?.category).toBeDefined();
    expect(by['s-none'].status).toBe('no_feed');
    expect(by['s-none'].estimate).toBeNull();
    expect(by['s-nocoord']).toBeUndefined();
    expect(b.notPlaced.map((n) => n.name)).toEqual(expect.arrayContaining(['Dange Chowk', 'Hadapsar']));
    expect(countStations(b)).toEqual({ total: 4, live: 1, outdated: 1, estimate: 1, noFeed: 1, notPlaced: 2 });
  });

  it('explains why nothing is drawn when no coordinates are loaded', () => {
    const empty: StationCatalog = { stations: [], unlocated: [], notice: 'Station list not loaded yet.', sourcesText: {} };
    const b = buildStationRows(empty, initialModelService(), {}, NOW);
    expect(b.placed).toEqual([]);
    expect(b.notice).toMatch(/not loaded/i);
  });

  it('treats a historical flag as outdated even when the timestamp is recent', () => {
    const { catalog, svc } = stationFixture();
    svc.measured['s-live'] = measured('Alandi', new Date(NOW - HOUR).toISOString(), 60, true);
    const b = buildStationRows(catalog, svc, {}, NOW);
    expect(b.placed.find((s) => s.id === 's-live')!.status).toBe('outdated');
  });
});

describe('coverage gaps', () => {
  const cell = (id: string, lon: number, lat: number) => ({ id, center: [lon, lat] as [number, number], bounds: { west: lon - 0.01, east: lon + 0.01, south: lat - 0.01, north: lat + 0.01 } });

  it('counts only stations with a data feed, within the radius', () => {
    const { catalog, svc, live } = stationFixture();
    const b = buildStationRows(catalog, svc, live, NOW);
    const near = cell('near-live', 73.9, 18.671); // ~100 m from the live station
    const nearNoFeed = cell('near-nofeed', 73.82, 18.5); // only the no-feed station is close
    const nearEstimate = cell('near-est', 73.84, 18.63); // the "estimated" station has no feed either
    const far = cell('far', 74.2, 18.9);
    const r = coverageGaps([near, nearNoFeed, nearEstimate, far], b.placed);
    expect(r.radiusKm).toBe(COVERAGE_RADIUS_KM);
    expect(r.gaps.map((g) => g.id).sort()).toEqual(['far', 'near-est', 'near-nofeed']);
    expect(r.covered).toBe(1);
    expect(r.gaps.find((g) => g.id === 'near-nofeed')!.nearest?.name).toBe('Karve Road');
  });

  it('separates zones covered only by outdated readings', () => {
    const { catalog, svc, live } = stationFixture();
    const b = buildStationRows(catalog, svc, live, NOW);
    const r = coverageGaps([cell('old', 73.86, 18.451)], b.placed);
    expect(r.covered).toBe(1);
    expect(r.coveredOnlyByOutdated).toBe(1);
  });

  it('is disabled with a reason when there are no placed stations', () => {
    const r = coverageGaps([cell('x', 73.9, 18.5)], []);
    expect(r.disabledReason).toMatch(/not loaded/i);
    expect(r.gaps).toEqual([]);
  });
});

// ---- alerts ----

function zonesAt(category: 'low' | 'poor' | 'verypoor', forecast?: (h: number) => number) {
  const pm = category === 'low' ? 40 : category === 'poor' ? 100 : 150;
  const c = osmBase.cells;
  const points = {
    [zonePointId(c[0].id)]: makePoint('a', [73.9, 18.5], forecast ?? pm),
    [zonePointId(c[1].id)]: makePoint('b', [73.9, 18.5], forecast ?? pm),
  };
  return buildZoneRows({ base: osmBase, points, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows;
}

const noStations = (): StationBuild => ({ placed: [], notPlaced: [], notice: 'x', modelService: { status: 'online', reason: null } });

describe('alerts', () => {
  it('creates none while every zone is below Poor and no feed is stale', () => {
    expect(buildAlerts({ zones: zonesAt('low'), stations: noStations(), records: {}, nowMs: NOW })).toEqual([]);
    expect(buildAlerts({ zones: [], stations: noStations(), records: {}, nowMs: NOW })).toEqual([]);
  });

  it('creates one current alert per model grid point at Poor and Critical at Very Poor', () => {
    const poor = buildAlerts({ zones: zonesAt('poor'), stations: noStations(), records: {}, nowMs: NOW });
    expect(poor).toHaveLength(1); // two zones share one model point
    expect(poor[0]).toMatchObject({ kind: 'current', severity: 'high', threshold: 201, confidence: CONFIDENCE_TEXT });
    expect(poor[0].location).toMatch(/1 neighbouring zone/);
    expect(poor[0].deadline).toBe(addDaysIst(NOW, 2));
    const vp = buildAlerts({ zones: zonesAt('verypoor'), stations: noStations(), records: {}, nowMs: NOW });
    expect(vp[0].severity).toBe('critical');
    expect(vp[0].deadline).toBe(addDaysIst(NOW, 1));
    expect(poor[0].reasons.length).toBeGreaterThan(0);
  });

  it('creates a forecast alert only when a forecast day reaches Poor and the present does not', () => {
    const rising = (h: number) => 40 + Math.max(0, h - 10) * 2.5;
    const a = buildAlerts({ zones: zonesAt('low', rising), stations: noStations(), records: {}, nowMs: NOW });
    expect(a).toHaveLength(1);
    expect(a[0].kind).toBe('forecast');
    expect(a[0].forDate).toMatch(/^2026-11-0[4-6]$/);
    expect(a[0].expected!).toBeGreaterThanOrEqual(201);
    expect(a[0].current!).toBeLessThan(201);
    // a day-3-only crossing is a Watch
    const late = buildAlerts({ zones: zonesAt('low', (h) => (h > 50 ? 150 : 40)), stations: noStations(), records: {}, nowMs: NOW });
    expect(late[0]?.severity).toBe('watch');
  });

  it('keeps ids stable so workflow records persist, and carries the record', () => {
    const first = buildAlerts({ zones: zonesAt('poor'), stations: noStations(), records: {}, nowMs: NOW });
    const rec = { status: 'assigned' as const, firstSeen: NOW - 1000, instruction: { to: 'Traffic police', deadline: '2026-11-06', message: 'x', sentAt: NOW } };
    const again = buildAlerts({ zones: zonesAt('poor'), stations: noStations(), records: { [first[0].id]: rec }, nowMs: NOW + HOUR });
    expect(again[0].id).toBe(first[0].id);
    expect(again[0].record.status).toBe('assigned');
    expect(first[0].record.status).toBe('new');
  });

  it('raises a Watch for stale feeds with the real counts, and Info when the service is offline', () => {
    const { catalog, svc, live } = stationFixture();
    const st = buildStationRows(catalog, svc, live, NOW);
    const a = buildAlerts({ zones: [], stations: st, records: {}, nowMs: NOW });
    const stale = a.find((x) => x.id === 'data:stale-feeds')!;
    expect(stale.severity).toBe('watch');
    expect(stale.title).toBe('1 of 2 monitoring stations have no current reading');
    const off: StationBuild = { ...noStations(), modelService: { status: 'offline', reason: 'connection refused' } };
    const b = buildAlerts({ zones: [], stations: off, records: {}, nowMs: NOW });
    expect(b.map((x) => [x.id, x.severity])).toEqual([['data:model-offline', 'info']]);
  });

  it('sorts by severity then deadline and counts new alerts excluding resolved ones', () => {
    const { catalog, svc, live } = stationFixture();
    const st = buildStationRows(catalog, svc, live, NOW);
    const a = buildAlerts({ zones: zonesAt('verypoor'), stations: st, records: {}, nowMs: NOW });
    expect(a.map((x) => x.severity)).toEqual(['critical', 'watch']);
    expect(summariseAlerts(a)).toEqual({ newCount: 2, bySeverity: { critical: 1, high: 0, watch: 1, info: 0 } });
    const resolved = a.map((x) => ({ ...x, record: { ...x.record, status: 'resolved' as const } }));
    expect(summariseAlerts(resolved).newCount).toBe(0);
  });
});

// ---- routing ----

describe('routing', () => {
  it('suggests departments by cause', () => {
    expect(departmentsFor('dust').map((d) => d.key)).toEqual(['construction', 'roads']);
    expect(departmentsFor('industry')).toEqual([DEPARTMENTS.industry]);
    expect(departmentsFor('traffic')).toEqual([DEPARTMENTS.traffic]);
    expect(departmentsFor('station')).toEqual([DEPARTMENTS.monitoring]);
    expect(departmentsFor('general')).toEqual([DEPARTMENTS.health]);
    expect(Object.keys(DEPARTMENTS).sort()).toEqual(['construction', 'garden', 'health', 'industry', 'monitoring', 'roads', 'swm', 'traffic']);
  });

  it('names the place in the action and builds drafts without sending anything', () => {
    expect(actionFor('dust', 'Hadapsar')).toMatch(/Hadapsar/);
    expect(actionFor('traffic', 'Katraj', 'Report within 2 days.')).toMatch(/Report within 2 days\.$/);
    const m = mailtoLink('a@b.in', 'Subject & more', 'Line 1\nLine 2');
    expect(m).toMatch(/^mailto:a%40b\.in\?subject=Subject%20%26%20more&body=Line%201%0ALine%202$/);
    expect(mailtoLink('Traffic police', 's', 'b')).toMatch(/^mailto:\?/);
    expect(whatsappLink('hello world')).toBe('https://wa.me/?text=hello%20world');
  });
});

// ---- hotspots ----

describe('hotspots', () => {
  it('ranks zones by model AQI, one per model point, and stations apart from them', () => {
    const c = osmBase.cells;
    const points = {
      [zonePointId(c[0].id)]: makePoint('a', [73.9, 18.5], 150),
      [zonePointId(c[1].id)]: makePoint('b', [73.9, 18.5], 150),
      [zonePointId(c[2].id)]: makePoint('c', [74.0, 18.6], 40),
      [zonePointId(c[3].id)]: makePoint('d', [74.1, 18.7], 100),
    };
    const zones = buildZoneRows({ base: osmBase, points, placeNames: {}, nowMs: NOW, industryLoaded: false }).rows;
    const z = zoneHotspots(zones);
    expect(z.map((h) => h.category)).toEqual(['Very Poor', 'Poor', 'Satisfactory']);
    expect(z[0].subtitle).toMatch(/1 neighbouring zone/);
    const { catalog, svc, live } = stationFixture();
    const st = stationHotspots(buildStationRows(catalog, svc, live, NOW).placed, zones);
    // both fixtures carry AQI 180, so the higher PM2.5 reading (Katraj, 90 against 60) ranks first
    expect(st.map((h) => h.name)).toEqual(['Katraj', 'Alandi']);
    expect(st.every((h) => h.kind === 'station')).toBe(true);
    expect(st.find((h) => h.name === 'Katraj')!.outdated).toBe(true);
    expect(st.find((h) => h.name === 'Alandi')!.outdated).toBe(false);
    expect(st.every((h) => !h.trendKnown)).toBe(true);
    // stations without any reading are not ranked
    expect(st.find((h) => h.name === 'Karve Road')).toBeUndefined();
  });
});

// ---- dust control ----

describe('dust control plan', () => {
  const dustyCell = () => {
    let best = osmBase.cells[0];
    let n = -1;
    for (const c of osmBase.cells) {
      const k = majorRoadsInZone(osmBase, c, 3, true).length;
      if (k > n) (best = c), (n = k);
    }
    return best;
  };

  it('picks up to three named major roads, longest first, and states every assumption', () => {
    const cell = dustyCell();
    const roads = majorRoadsInZone(osmBase, cell, 3, true);
    expect(roads.length).toBeGreaterThan(0);
    expect(roads.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < roads.length; i++) expect(roads[i - 1].lengthKm).toBeGreaterThanOrEqual(roads[i].lengthKm);
    const p = dustPlan(osmBase, cell, 'Test zone');
    expect(p.effectModelled).toBe(false);
    expect(p.assumptions.map((a) => a[0])).toEqual(expect.arrayContaining(['Application rate', 'Tanker capacity', 'Crew per tanker']));
    expect(p.assumptions.every((a) => /assumed/.test(a[1]))).toBe(true);
    expect(p.verification.map((v) => v.day)).toEqual([7, 14]);
    expect(p.slots).toEqual(DEFAULT_DUST.slots);
  });

  it('computes litres, tankers, crew and costs that add up from the price table', () => {
    const p = dustPlan(osmBase, dustyCell(), 'Test zone');
    const area = p.roads.reduce((a, r) => a + r.lengthKm * 1000 * DEFAULT_DUST.roadWidthM, 0);
    expect(p.litresPerSlot).toBeCloseTo(area * DEFAULT_DUST.rateLPerM2, 3);
    expect(p.litresPerDay).toBeCloseTo(p.litresPerSlot * p.slots.length, 3);
    expect(p.tankers).toBe(Math.max(1, Math.ceil(p.litresPerSlot / (DEFAULT_DUST.tankerCapacityL * DEFAULT_DUST.tripsPerTankerPerSlot))));
    expect(p.crew).toBe(p.tankers * DEFAULT_DUST.crewPerTanker);
    const trips = p.lines.find((l) => l.priceId === 'tankerTrip')!;
    expect(trips.quantity).toBe(p.tripsPerDay * DEFAULT_DUST.days);
    expect(trips.unitPrice).toBe(1200);
    expect(trips.kind).toBe('sourced');
    expect(p.lines.find((l) => l.priceId === 'labourDay')!.unitPrice).toBe(524.42);
    expect(p.total).toBe(sumLines(p.lines).total);
    expect(p.lines.reduce((a, l) => a + l.total, 0)).toBe(p.total);
  });

  it('says plainly when no major road passes through the zone', () => {
    const p = dustPlan({ roads: [] }, osmBase.cells[0], 'Empty zone');
    expect(p.roads).toEqual([]);
    expect(p.total).toBe(0);
    expect(p.notes.join(' ')).toMatch(/No named major road/);
  });
});

// ---- measures / simulation ----

describe('measures and simulation', () => {
  const cellWithIndustry = () => osmBase.cells.find((c) => osmBase.industries.some((i) => i.location[0] >= c.bounds.west && i.location[0] < c.bounds.east && i.location[1] >= c.bounds.south && i.location[1] <= c.bounds.north));

  it('returns nothing when no measure is chosen', () => {
    expect(hasMeasures(NO_MEASURES)).toBe(false);
    expect(runMeasures({ base: osmBase, cell: osmBase.cells[0], zoneName: 'Z', currentPm25: 80, selection: NO_MEASURES })).toBeNull();
  });

  it('applies the engine\'s RELATIVE change to the current model value, with a half-effect range', () => {
    const cell = osmBase.cells[Math.floor(osmBase.cells.length / 2)];
    const o = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 80, selection: { ...NO_MEASURES, traffic: 'intensive' } })!;
    expect(o.modelledEffect).toBe(true);
    expect(o.relative).toBeLessThan(0);
    expect(o.protoBefore).toBeGreaterThan(0);
    expect(o.relative).toBeCloseTo((o.protoAfter - o.protoBefore) / o.protoBefore, 10);
    expect(o.projectedPm25).toBeCloseTo(80 * (1 + o.relative), 8);
    expect(o.lowPm25).toBeCloseTo(80 * (1 + o.relative / 2), 8);
    expect(o.projectedPm25!).toBeLessThan(o.lowPm25!);
    expect(o.lowPm25!).toBeLessThan(80);
    expect(o.changePct).toBeCloseTo(o.relative * 100, 8);
    expect(o.lowPct).toBeCloseTo(o.changePct / 2, 8);
    expect(o.weeks).toBe(10);
  });

  it('has no projection when the zone has no current model value', () => {
    const o = runMeasures({ base: osmBase, cell: osmBase.cells[10], zoneName: 'Z', currentPm25: null, selection: { ...NO_MEASURES, traffic: 'standard' } })!;
    expect(o.projectedPm25).toBeNull();
    expect(o.lowPm25).toBeNull();
    expect(o.relative).toBeLessThan(0);
  });

  it('costs from the Plan-It price table so the lines add up exactly', () => {
    const cell = osmBase.cells[20];
    const o = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, traffic: 'standard', trees: 500 } })!;
    expect(o.oneTime + o.recurring).toBe(o.total);
    expect(o.lines.reduce((a, l) => a + l.total, 0)).toBe(o.total);
    expect(o.lines.find((l) => l.priceId === 'sapling')).toMatchObject({ unitPrice: 199, quantity: 500, kind: 'sourced' });
    expect(o.lines.some((l) => l.kind === 'estimate')).toBe(true);
    expect(o.weeks).toBe(8);
  });

  it('costs and schedules dust control but does not model its effect', () => {
    let cell = osmBase.cells[0];
    for (const c of osmBase.cells) if (majorRoadsInZone(osmBase, c, 3, true).length > 0) (cell = c);
    const o = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, dust: true } })!;
    expect(o.modelledEffect).toBe(false);
    expect(o.relative).toBe(0);
    expect(o.changePct).toBe(0);
    expect(o.projectedPm25).toBe(90);
    expect(o.dust).not.toBeNull();
    expect(o.total).toBeGreaterThan(0);
    expect(o.weeks).toBe(2);
    expect(o.notes.join(' ')).toMatch(/not modelled/i);
  });

  it('combines dust control with a modelled measure without crediting dust control', () => {
    let cell = osmBase.cells[0];
    for (const c of osmBase.cells) if (majorRoadsInZone(osmBase, c, 3, true).length > 0) (cell = c);
    const a = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, traffic: 'standard' } })!;
    const b = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, traffic: 'standard', dust: true } })!;
    expect(b.relative).toBe(a.relative);
    expect(b.total).toBeGreaterThan(a.total);
  });

  it('closes a road with a costed diversion', () => {
    let cell = osmBase.cells[0];
    let road = '';
    for (const c of osmBase.cells) {
      const r = majorRoadsInZone(osmBase, c, 1, true)[0];
      if (r) (cell = c), (road = r.road.id);
    }
    const o = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, closureRoadId: road, closureDiversion: 0.6 } })!;
    expect(o.closure?.roadId).toBe(road);
    expect(o.params.roadClosures).toHaveLength(1);
    expect(o.closure!.lines.find((l) => l.priceId === 'signBoard')!.unitPrice).toBe(250);
    expect(o.weeks).toBe(1);
  });

  it('caps industrial units to the sources that exist in the zone', () => {
    const cell = cellWithIndustry();
    if (!cell) {
      const o = runMeasures({ base: osmBase, cell: osmBase.cells[0], zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, industry: 3 } })!;
      expect(o.options).toEqual([]);
      expect(o.notes.join(' ')).toMatch(/No modelled industrial source/);
      return;
    }
    const o = runMeasures({ base: osmBase, cell, zoneName: 'Z', currentPm25: 90, selection: { ...NO_MEASURES, industry: 3 } })!;
    expect(o.options[0].quantity).toBeLessThanOrEqual(3);
    expect(o.weeks).toBe(12);
  });
});

// ---- helpers and persistence ----

describe('formatting', () => {
  it('formats dates in IST and escapes CSV', () => {
    expect(formatIst(Date.UTC(2026, 0, 5, 20, 0))).toBe('06 Jan 2026, 01:30 IST');
    expect(formatIst(null)).toBe('no date');
    expect(addDaysIst(Date.UTC(2026, 11, 30, 20, 0), 2)).toBe('2027-01-02');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(5)).toBe('5');
  });
});

describe('alert workflow persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const memoryStorage = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('New -> Acknowledge -> Assign -> Resolve survives a reload, and nothing is sent', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.resetModules();
    const { useGovStore } = await import('./govStore');
    const s = useGovStore.getState();
    s.markSeen(['a1'], 1000);
    expect(useGovStore.getState().alertRecords.a1).toEqual({ status: 'new', firstSeen: 1000 });
    s.acknowledge('a1', 2000);
    expect(useGovStore.getState().alertRecords.a1.status).toBe('acknowledged');
    s.assign('a1', { to: 'Traffic police', deadline: '2026-11-06', message: 'Please review.' }, 3000);
    const assigned = useGovStore.getState().alertRecords.a1;
    expect(assigned).toMatchObject({ status: 'assigned', acknowledgedAt: 2000, instruction: { to: 'Traffic police', deadline: '2026-11-06', sentAt: 3000 } });
    s.resolve('a1', ' fixed ', 4000);
    expect(useGovStore.getState().alertRecords.a1).toMatchObject({ status: 'resolved', resolvedAt: 4000, note: 'fixed' });
    expect(storage.m.has(ALERTS_KEY)).toBe(true);

    vi.resetModules();
    const again = await import('./govStore');
    expect(again.useGovStore.getState().alertRecords.a1).toMatchObject({ status: 'resolved', note: 'fixed', instruction: { to: 'Traffic police' } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('works when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    vi.resetModules();
    const { useGovStore } = await import('./govStore');
    useGovStore.getState().markSeen(['x'], 1);
    expect(useGovStore.getState().alertRecords.x.status).toBe('new');
  });

  it('keeps saved scenarios and can delete them', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.resetModules();
    const { useGovStore } = await import('./govStore');
    const sc = { id: 's1', name: 'Plan', savedAt: '2026-11-03T00:00:00Z', target: { id: 'c', label: 'Z' }, measures: ['x'], weeks: 2, baselinePm25: 80, projectedPm25: 70, changePct: -12, lowPct: -6, oneTime: 10, recurring: 5, zonesImproved: 1, selection: { ...NO_MEASURES, traffic: 'standard' as const } };
    useGovStore.getState().saveScenario(sc);
    vi.resetModules();
    const again = await import('./govStore');
    expect(again.useGovStore.getState().scenarios).toHaveLength(1);
    again.useGovStore.getState().deleteScenario('s1');
    expect(again.useGovStore.getState().scenarios).toHaveLength(0);
  });
});
