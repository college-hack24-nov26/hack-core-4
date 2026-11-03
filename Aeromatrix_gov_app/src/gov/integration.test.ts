import { beforeEach, describe, expect, it } from 'vitest';
import { useTwinStore } from '../store/useTwinStore';
import type { PlacedStation } from '../services/stations';
import { executeAction, buildUiContext } from '../aerosage/existingTwinAdapter';
import { useGovStore } from './govStore';
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
  location: 'Hadapsar',
  locationLonLat: [73.9, 18.5],
  zoneId: 'c1',
  current: 230,
  expected: null,
  threshold: 201,
  forDate: null,
  confidence: 'Not quantified',
  reasons: ['Road traffic: Strong indication', 'Road A runs 3 km through the zone (OpenStreetMap)'],
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
  it('say the AQI is an estimate, name the place and the deadline, and promise no sending', () => {
    const t = composeAlertInstruction(alert(), '2026-11-05');
    expect(t).toMatch(/Place: Hadapsar/);
    expect(t).toMatch(/ESTIMATE from Open-Meteo CAMS/);
    expect(t).toMatch(/not an official station AQI/);
    expect(t).toMatch(/Action required: Review traffic management/);
    expect(t).toMatch(/report back by 2026-11-05/);
    expect(NOT_SENT_NOTE).toMatch(/does not send anything/);
  });

  it('calls a forecast a forecast', () => {
    const t = composeAlertInstruction(alert({ kind: 'forecast', expected: 240, forDate: '2026-11-06' }), '2026-11-07');
    expect(t).toMatch(/FORECAST/);
    expect(t).toMatch(/2026-11-06/);
  });

  it('flags an outdated station reading in an inspection task and lists what was not assessed', () => {
    const h = { id: 'station:s', kind: 'station', name: 'Katraj', aqi: 180, category: 'Moderate', asOf: Date.UTC(2025, 11, 17, 4, 30), outdated: true, causes: [] } as unknown as Hotspot;
    const t = composeHotspotTask(h, '2026-11-06');
    expect(t).toMatch(/OUTDATED/);
    expect(t).toMatch(/17 Dec 2025/);
    expect(t).toMatch(/No likely cause could be shown with evidence/);
    expect(t).toMatch(/construction sites, RMC plants, waste burning, brick kilns/);
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

describe('AeroSage in the Commissioner app', () => {
  const station = (id: string, name: string): PlacedStation => ({ id, name, agency: null, city: null, lat: 18.5, lon: 73.9, coordSource: 'verified', sources: [], singleSource: false, note: null, api: null });

  beforeEach(() => {
    useGovStore.setState({ view: 'home', selectedStationId: null, selectedZoneId: null, simTargetId: null, mapFocus: null, measures: { ...NO_MEASURES } });
    useTwinStore.setState({ catalog: { stations: [station('s1', 'Katraj'), station('s2', 'Alandi')], unlocated: [], notice: null, sourcesText: {} } });
  });

  it('opens screens and reads the app state back before claiming success', () => {
    expect(executeAction({ type: 'navigate_to_section', section: 'simulator' })).toMatchObject({ ok: true });
    expect(useGovStore.getState().view).toBe('simulator');
    executeAction({ type: 'navigate_to_section', section: 'zones' });
    expect(useGovStore.getState().view).toBe('hotspots');
    executeAction({ type: 'open_scenario' });
    expect(useGovStore.getState().view).toBe('simulator');
  });

  it('selects a known station and refuses an unknown one honestly', () => {
    expect(executeAction({ type: 'select_region', region: 'katraj' })).toMatchObject({ ok: true });
    expect(useGovStore.getState().selectedStationId).toBe('s1');
    expect(useGovStore.getState().view).toBe('stations');
    const bad = executeAction({ type: 'select_region', region: 'Atlantis' });
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/not on this app's station list/);
  });

  it('maps a traffic-reduction request onto the Simulator measure and verifies it', () => {
    expect(executeAction({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 20 }).ok).toBe(true);
    expect(useGovStore.getState().measures.traffic).toBe('intensive');
    executeAction({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 10 });
    expect(useGovStore.getState().measures.traffic).toBe('standard');
    executeAction({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 0 });
    expect(useGovStore.getState().measures.traffic).toBe('off');
    useGovStore.getState().setMeasures({ trees: 500, dust: true });
    expect(executeAction({ type: 'reset_scenario' }).ok).toBe(true);
    expect(useGovStore.getState().measures).toEqual(NO_MEASURES);
  });

  it('says plainly when an action has no meaning in this app', () => {
    for (const a of [{ type: 'show_scenario', mode: 'delta' }, { type: 'set_forecast_time', hours: 24 }, { type: 'highlight_chart_data', chart: 'x' }] as const) {
      const r = executeAction(a);
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/not available in this app/);
    }
  });

  it('sends only verifiable context: the screen and the selected station', () => {
    useGovStore.getState().setView('hotspots');
    useGovStore.getState().selectStation('s2');
    const ctx = buildUiContext();
    expect(ctx.section).toBe('zones');
    expect(ctx.selected_region).toBe('Alandi');
  });
});
