import { describe, expect, it } from 'vitest';
import { isCapableDesktop } from './lib/capability';
import { composeAlertInstruction, composeHotspotTask, NOT_SENT_NOTE } from './lib/instructions';
import { departmentsFor } from './lib/routing';
import type { GovAlert } from './lib/alerts';
import type { Hotspot } from './lib/hotspots';
import { scenariosCsv, toSavedScenario } from './lib/scenarios';
import { NO_MEASURES, type SimOutcome } from './lib/measures';

const alert = (over: Partial<GovAlert> = {}): GovAlert => ({
  id: 'current:x',
  kind: 'current',
  severity: 'high',
  title: 'Poor air in Hadapsar',
  pollutant: 'PM2.5',
  condition: 'PM2.5',
  location: 'Hadapsar',
  locationLonLat: [73.9, 18.5],
  zoneId: 'c1',
  current: 230,
  currentDetail: 'AQI 230 · PM2.5 112 µg/m³',
  expected: null,
  expectedDetail: null,
  threshold: 201,
  forDate: null,
  confidence: 'Not quantified',
  reasons: ['Road traffic: Strong indication', 'Road A runs 3 km through the area'],
  action: 'Review traffic management on the busiest roads in Hadapsar.',
  causeKey: 'traffic',
  departments: departmentsFor('traffic'),
  deadline: '2026-11-05',
  zone: { category: 'Poor' } as GovAlert['zone'],
  stations: [],
  record: { status: 'new', firstSeen: 0 },
  ...over,
});

describe('instruction texts', () => {
  it('say the reading is an estimate, name the place and the deadline, and promise no sending', () => {
    const t = composeAlertInstruction(alert(), '2026-11-05');
    expect(t).toMatch(/Place: Hadapsar/);
    expect(t).toMatch(/AQI 230 · PM2\.5 112 µg\/m³ \(Poor\)/);
    expect(t).toMatch(/Estimated from model data/);
    expect(t).toMatch(/not an official station reading/);
    expect(t).toMatch(/Likely cause: Road traffic \(strong indication\)/);
    expect(t).toMatch(/Action required: Review traffic management/);
    expect(t).toMatch(/report back by 2026-11-05/);
    expect(NOT_SENT_NOTE).toMatch(/Nothing is sent automatically/);
  });

  it('calls a forecast a forecast', () => {
    const t = composeAlertInstruction(alert({ kind: 'forecast', expected: 240, expectedDetail: 'AQI 240', forDate: '2026-11-06' }), '2026-11-07');
    expect(t).toMatch(/forecast to reach AQI 240 on 2026-11-06/);
    expect(t).toMatch(/not a measurement/);
  });

  it('flags an outdated station reading in an inspection task and asks for an on-site check', () => {
    const h = { id: 'station:s', kind: 'station', name: 'Katraj', aqi: 180, category: 'Moderate', asOf: Date.UTC(2025, 11, 17, 4, 30), outdated: true, causes: [] } as unknown as Hotspot;
    const t = composeHotspotTask(h, '2026-11-06');
    expect(t).toMatch(/outdated/);
    expect(t).toMatch(/17 Dec 2025/);
    expect(t).toMatch(/No likely cause is supported/);
    expect(t).toMatch(/construction sites, RMC plants and waste burning/);
  });
});

describe('3D map is offered only on capable desktops', () => {
  const ok = { webgl2: true, cores: 8, memoryGb: 8, widthPx: 1440, finePointer: true };
  it('offers it on a desktop and not on phones or weak devices', () => {
    expect(isCapableDesktop(ok)).toBe(true);
    expect(isCapableDesktop({ ...ok, webgl2: false })).toBe(false);
    expect(isCapableDesktop({ ...ok, widthPx: 390 })).toBe(false);
    expect(isCapableDesktop({ ...ok, finePointer: false })).toBe(false);
    expect(isCapableDesktop({ ...ok, cores: 2 })).toBe(false);
    expect(isCapableDesktop({ ...ok, memoryGb: 2 })).toBe(false);
    expect(isCapableDesktop({ ...ok, cores: null, memoryGb: null })).toBe(true);
  });
});

describe('saved scenario CSV', () => {
  const outcome = {
    currentPm25: 80,
    projectedPm25: 72,
    changePct: -10,
    lowPct: -5,
    oneTime: 1000,
    recurring: 200,
    zonesImproved: 2,
    weeks: 6,
    zoneName: 'Test, Nagar',
    measures: ['Standard traffic enforcement zone'],
    selection: { ...NO_MEASURES, traffic: 'standard' },
    target: { id: 'c1' },
  } as unknown as SimOutcome;

  it('is built only when a current model value exists', () => {
    expect(toSavedScenario({ ...outcome, currentPm25: null } as SimOutcome, 'x')).toBeNull();
    const s = toSavedScenario(outcome, '  ', new Date(Date.UTC(2026, 10, 3)))!;
    expect(s.name).toBe('Test, Nagar: Standard traffic enforcement zone');
    expect(s.target).toEqual({ id: 'c1', label: 'Test, Nagar' });
  });

  it('exports every field, escapes commas and labels the values as simulation', () => {
    const s = toSavedScenario(outcome, 'Plan "A"')!;
    const csv = scenariosCsv([s]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0].split(',')[0]).toBe('Name');
    expect(lines[1]).toContain('"Plan ""A"""');
    expect(lines[1]).toContain('"Test, Nagar"');
    expect(lines[1]).toContain(',80.0,72.0,-10.0,-5.0,1000,200,2');
    expect(lines[2]).toMatch(/Simulation results/);
    expect(lines[0]).toContain('PM2.5 simulated (ug/m3, Simulation)');
  });
});
