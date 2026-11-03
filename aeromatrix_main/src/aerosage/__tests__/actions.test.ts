import { describe, expect, it } from 'vitest';
import { describeAction, isDisruptive, parseAction, parseActions, splitActions } from '../aeromatrixActions';

describe('action validation', () => {
  it('accepts the shapes the server sends', () => {
    expect(parseAction({ type: 'navigate_to_section', section: 'sensors' })).toEqual({ type: 'navigate_to_section', section: 'sensors' });
    expect(parseAction({ type: 'select_region', region: 'Hadapsar' })).toEqual({ type: 'select_region', region: 'Hadapsar' });
    expect(parseAction({ type: 'set_pollutant', pollutant: 'pm10' })).toEqual({ type: 'set_pollutant', pollutant: 'pm10' });
    expect(parseAction({ type: 'compare_regions', regions: ['Hadapsar', 'Alandi'] })).toEqual({ type: 'compare_regions', regions: ['Hadapsar', 'Alandi'] });
    expect(parseAction({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 20 })).toEqual({
      type: 'update_scenario_parameter',
      parameter: 'traffic_reduction_pct',
      value: 20,
    });
    expect(parseAction({ type: 'show_scenario' })).toEqual({ type: 'show_scenario', mode: 'delta' });
    expect(parseAction({ type: 'run_scenario' })).toEqual({ type: 'run_scenario' });
  });

  it('maps server section names onto the app sections', () => {
    expect(parseAction({ type: 'navigate_to_section', section: 'map' })).toEqual({ type: 'navigate_to_section', section: 'overview' });
    expect(parseAction({ type: 'navigate_to_section', section: 'sites' })).toEqual({ type: 'navigate_to_section', section: 'locations' });
  });

  it('rejects unknown types, bad values and wrong shapes', () => {
    for (const bad of [
      null,
      'run_scenario',
      [],
      { type: 'eval', code: 'alert(1)' },
      { type: 'navigate_to_section', section: 'admin' },
      { type: 'navigate_to_section' },
      { type: 'select_region', region: '' },
      { type: 'select_region', region: 'x'.repeat(200) },
      { type: 'set_pollutant', pollutant: 'lead' },
      { type: 'focus_map_location', lat: 200, lon: 73 },
      { type: 'focus_map_location', lat: 'a', lon: 73 },
      { type: 'compare_regions', regions: ['only one'] },
      { type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 150 },
      { type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: -5 },
      { type: 'update_scenario_parameter', parameter: 'something_else', value: 10 },
      { type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: Number.NaN },
      { type: 'show_scenario', mode: 'weird' },
      { type: 'set_forecast_time', hours: 500 },
    ]) {
      expect(parseAction(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('keeps valid actions, drops the rest and caps the list', () => {
    const { actions, dropped } = parseActions([
      { type: 'set_pollutant', pollutant: 'no2' },
      { type: 'nope' },
      { type: 'run_scenario' },
      7,
    ]);
    expect(actions.map((a) => a.type)).toEqual(['set_pollutant', 'run_scenario']);
    expect(dropped).toBe(2);
    expect(parseActions('not a list')).toEqual({ actions: [], dropped: 0 });
    const many = parseActions(Array.from({ length: 30 }, () => ({ type: 'show_heatmap' })));
    expect(many.actions).toHaveLength(8);
  });

  it('only actions that change the scenario wait for confirmation', () => {
    expect(isDisruptive({ type: 'reset_scenario' })).toBe(true);
    expect(isDisruptive({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 10 })).toBe(true);
    for (const t of ['navigate_to_section', 'show_heatmap', 'run_scenario', 'open_scenario', 'show_industries'] as const) {
      const a = t === 'navigate_to_section' ? ({ type: t, section: 'air' } as const) : ({ type: t } as const);
      expect(isDisruptive(a)).toBe(false);
    }
  });

  it('keeps order: the change and everything after it wait together', () => {
    const { actions } = parseActions([
      { type: 'navigate_to_section', section: 'simulator' },
      { type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 20 },
      { type: 'run_scenario' },
      { type: 'show_scenario', mode: 'delta' },
    ]);
    const { now, waiting } = splitActions(actions);
    expect(now.map((a) => a.type)).toEqual(['navigate_to_section']);
    expect(waiting.map((a) => a.type)).toEqual(['update_scenario_parameter', 'run_scenario', 'show_scenario']);
    expect(splitActions([{ type: 'show_heatmap' }])).toEqual({ now: [{ type: 'show_heatmap' }], waiting: [] });
  });

  it('describes every action in plain words', () => {
    expect(describeAction({ type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value: 20 })).toBe('Set traffic reduction to 20%');
    expect(describeAction({ type: 'select_region', region: 'Hadapsar' })).toBe('Select Hadapsar on the map');
  });
});
