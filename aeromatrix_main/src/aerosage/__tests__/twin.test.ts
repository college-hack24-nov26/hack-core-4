import { beforeEach, describe, expect, it } from 'vitest';
import { useTwinStore } from '../../store/useTwinStore';
import type { PlacedStation } from '../../services/stations';
import { buildUiContext, executeAction, executeActions } from '../existingTwinAdapter';

const station = (id: string, name: string, lat: number | null, lon: number | null): PlacedStation => ({
  id,
  name,
  agency: null,
  city: null,
  lat,
  lon,
  coordSource: lat === null ? null : 'verified',
  sources: [],
  singleSource: false,
  note: null,
  api: null,
});

beforeEach(() => {
  useTwinStore.setState({
    section: 'overview',
    leftOpen: false,
    pollutant: 'pm25',
    selectedStationId: null,
    selectedCellId: null,
    displayMode: 'baseline',
    runNonce: 0,
    catalog: {
      stations: [station('s1', 'Hadapsar', 18.5, 73.9), station('s2', 'Katraj Dairy', null, null)],
      unlocated: [],
      notice: null,
      sourcesText: {},
    },
  });
});

describe('actions on the real store', () => {
  it('opens a panel and verifies it', () => {
    const r = executeAction({ type: 'navigate_to_section', section: 'sensors' });
    expect(r.ok).toBe(true);
    expect(useTwinStore.getState().section).toBe('sensors');
    expect(useTwinStore.getState().leftOpen).toBe(true);
  });

  it('selects a station by name, ignoring case and punctuation', () => {
    const r = executeAction({ type: 'select_region', region: 'hadapsar' });
    expect(r.ok).toBe(true);
    expect(useTwinStore.getState().selectedStationId).toBe('s1');
    expect(useTwinStore.getState().flyRequest).toMatchObject({ lon: 73.9, lat: 18.5 });
  });

  it('says so when the station has no verified coordinates', () => {
    const r = executeAction({ type: 'select_region', region: 'Katraj Dairy' });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/no verified coordinates/);
    expect(useTwinStore.getState().selectedStationId).toBe('s2');
  });

  it('fails honestly for a station that is not in the catalog', () => {
    const r = executeAction({ type: 'select_region', region: 'Atlantis' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/not on this map/);
    expect(useTwinStore.getState().selectedStationId).toBeNull();
  });

  it('changes the pollutant and the heatmap layer', () => {
    expect(executeAction({ type: 'set_pollutant', pollutant: 'no2' }).ok).toBe(true);
    expect(useTwinStore.getState().pollutant).toBe('no2');
    useTwinStore.getState().setLayer('heatmap', false);
    expect(executeAction({ type: 'show_heatmap' }).ok).toBe(true);
    expect(useTwinStore.getState().layers.heatmap).toBe(true);
  });

  it('sets the traffic reduction as a multiplier and reads it back', () => {
    const r = executeAction({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 20 });
    expect(r.ok).toBe(true);
    expect(useTwinStore.getState().params.areaTrafficMultiplier).toBe(0.8);
  });

  it('requests a scenario run and a view change', () => {
    expect(executeAction({ type: 'run_scenario' }).ok).toBe(true);
    expect(useTwinStore.getState().runNonce).toBe(1);
    expect(executeAction({ type: 'show_scenario', mode: 'delta' }).ok).toBe(true);
    expect(useTwinStore.getState().displayMode).toBe('delta');
  });

  it('reports actions the app does not support instead of pretending', () => {
    expect(executeAction({ type: 'set_forecast_time', hours: 3 }).ok).toBe(false);
    expect(executeAction({ type: 'highlight_chart_data', chart: 'trend' }).ok).toBe(false);
  });

  it('runs a list and keeps every outcome', () => {
    const out = executeActions([
      { type: 'navigate_to_section', section: 'simulator' },
      { type: 'select_region', region: 'Nowhere' },
    ]);
    expect(out.map((o) => o.ok)).toEqual([true, false]);
  });
});

describe('context sent to the service', () => {
  it('contains only what the app holds', () => {
    useTwinStore.setState({ selectedStationId: 's1', pollutant: 'pm10', section: 'air' });
    expect(buildUiContext()).toEqual({ section: 'air', pollutant: 'pm10', selected_region: 'Hadapsar' });
  });

  it('leaves out the selection when nothing is selected', () => {
    expect(buildUiContext().selected_region).toBeUndefined();
    expect(buildUiContext().map_location).toBeUndefined();
  });
});
