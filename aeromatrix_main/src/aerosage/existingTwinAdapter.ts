import { useTwinStore } from '../store/useTwinStore';
import type { Action } from './aeromatrixActions';
import { describeAction } from './aeromatrixActions';
import type { UiContext } from './types';

export interface ActionOutcome {
  label: string;
  ok: boolean;
  message: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Finds a station in the app's own catalog by the name the server used. */
function findStation(name: string) {
  const want = norm(name);
  const stations = useTwinStore.getState().catalog.stations;
  return stations.find((s) => norm(s.name) === want) ?? stations.find((s) => norm(s.name).includes(want) || want.includes(norm(s.name)));
}

/**
 * Runs one validated action on the real app store, then reads the store back to check it took effect.
 * The reply only ever says "done" when this check passed.
 */
export function executeAction(a: Action): ActionOutcome {
  const label = describeAction(a);
  const fail = (message: string): ActionOutcome => ({ label, ok: false, message });
  const done = (message = 'Done'): ActionOutcome => ({ label, ok: true, message });
  const st = useTwinStore.getState();

  switch (a.type) {
    case 'navigate_to_section': {
      st.setSection(a.section);
      st.setLeftOpen(true);
      const now = useTwinStore.getState();
      return now.section === a.section && now.leftOpen ? done() : fail('The panel did not open.');
    }
    case 'select_region': {
      const station = findStation(a.region);
      if (!station) return fail(`${a.region} is not on this map's station list.`);
      st.selectStation(station.id);
      if (useTwinStore.getState().selectedStationId !== station.id) return fail('The station could not be selected.');
      if (station.lat !== null && station.lon !== null) {
        st.flyTo(station.lon, station.lat);
        return done();
      }
      return done('Selected, but this station has no verified coordinates so the map did not move.');
    }
    case 'focus_map_location': {
      st.flyTo(a.lon, a.lat);
      return done();
    }
    case 'set_pollutant': {
      st.setPollutant(a.pollutant);
      return useTwinStore.getState().pollutant === a.pollutant ? done() : fail('The pollutant did not change.');
    }
    case 'show_heatmap': {
      st.setLayer('heatmap', true);
      return useTwinStore.getState().layers.heatmap ? done() : fail('The heatmap layer did not turn on.');
    }
    case 'compare_regions': {
      const first = findStation(a.regions[0]!);
      if (!first) return fail(`${a.regions[0]} is not on this map's station list.`);
      st.selectStation(first.id);
      return done(`Selected ${first.name}. The map shows one station at a time; the comparison figures are in the chat.`);
    }
    case 'open_scenario': {
      st.setSection('simulator');
      st.setLeftOpen(true);
      return useTwinStore.getState().section === 'simulator' ? done() : fail('The simulator did not open.');
    }
    case 'run_scenario': {
      const before = st.runNonce;
      st.runNow();
      return useTwinStore.getState().runNonce === before + 1 ? done('Scenario run requested.') : fail('The scenario did not run.');
    }
    case 'reset_scenario': {
      st.resetParams();
      st.runNow();
      return useTwinStore.getState().params.areaTrafficMultiplier === 1 ? done() : fail('The scenario was not reset.');
    }
    case 'update_scenario_parameter': {
      const multiplier = Math.round((1 - a.value / 100) * 1000) / 1000;
      st.setParam('areaTrafficMultiplier', multiplier);
      return useTwinStore.getState().params.areaTrafficMultiplier === multiplier
        ? done(`Traffic reduction set to ${a.value}% for the whole city.`)
        : fail('The traffic setting did not change.');
    }
    case 'show_scenario': {
      st.setDisplayMode(a.mode);
      return useTwinStore.getState().displayMode === a.mode ? done() : fail('The view did not change.');
    }
    case 'show_industries': {
      st.setLayer('industries', true);
      st.setSection('industries');
      st.setLeftOpen(true);
      const now = useTwinStore.getState();
      return now.layers.industries && now.section === 'industries' ? done() : fail('The industries view did not open.');
    }
    case 'set_forecast_time':
      return fail('Choosing a forecast hour is not available in this version of the app.');
    case 'highlight_chart_data':
      return fail('Highlighting chart values is not available in this version of the app.');
  }
}

export function executeActions(actions: Action[]): ActionOutcome[] {
  return actions.map(executeAction);
}

/** Only values that the app itself holds and can verify. Cell centres come from the loaded geometry. */
export function buildUiContext(): UiContext {
  const s = useTwinStore.getState();
  const ctx: UiContext = { section: s.section, pollutant: s.pollutant };
  const station = s.catalog.stations.find((x) => x.id === s.selectedStationId);
  if (station) ctx.selected_region = station.name;
  const cell = s.selectedCellId ? s.base?.cells.find((c) => c.id === s.selectedCellId) : undefined;
  if (cell) {
    const [lon, lat] = cell.center;
    if (Number.isFinite(lat) && Number.isFinite(lon)) ctx.map_location = { lat, lon };
  }
  return ctx;
}
