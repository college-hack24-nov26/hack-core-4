import { useTwinStore } from '../store/useTwinStore';
import { useGovStore, type GovView } from '../gov/govStore';
import type { Action } from './aeromatrixActions';
import { describeAction } from './aeromatrixActions';
import type { UiContext } from './types';

export interface ActionOutcome {
  label: string;
  ok: boolean;
  message: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The server's section names, mapped onto the Commissioner app's seven screens. */
const SECTION_TO_VIEW: Record<string, GovView> = {
  overview: 'home',
  air: 'home',
  zones: 'hotspots',
  traffic: 'hotspots',
  industries: 'hotspots',
  green: 'simulator',
  simulator: 'simulator',
  scenarios: 'simulator',
  actions: 'simulator',
  locations: 'map',
  sensors: 'stations',
  analytics: 'reports',
  data: 'stations',
};

const VIEW_TO_SECTION: Record<GovView, string> = {
  home: 'overview',
  alerts: 'overview',
  map: 'overview',
  stations: 'sensors',
  hotspots: 'zones',
  simulator: 'simulator',
  reports: 'analytics',
};

/** Finds a station in the app's own catalog by the name the server used. */
function findStation(name: string) {
  const want = norm(name);
  const stations = useTwinStore.getState().catalog.stations;
  return stations.find((s) => norm(s.name) === want) ?? stations.find((s) => norm(s.name).includes(want) || want.includes(norm(s.name)));
}

/**
 * Runs one validated action on the Commissioner app, then reads the stores back to check it took effect.
 * The reply only ever says "done" when this check passed. Only reversible, look-around actions exist in this app.
 */
export function executeAction(a: Action): ActionOutcome {
  const label = describeAction(a);
  const fail = (message: string): ActionOutcome => ({ label, ok: false, message });
  const done = (message = 'Done'): ActionOutcome => ({ label, ok: true, message });
  const gov = useGovStore.getState();
  const twin = useTwinStore.getState();

  switch (a.type) {
    case 'navigate_to_section': {
      const view = SECTION_TO_VIEW[a.section];
      if (!view) return fail('That screen does not exist in this app.');
      gov.setView(view);
      return useGovStore.getState().view === view ? done(`Opened ${view}.`) : fail('The screen did not open.');
    }
    case 'select_region': {
      const station = findStation(a.region);
      if (!station) return fail(`${a.region} is not on this app's station list.`);
      gov.selectStation(station.id);
      gov.setView('stations');
      if (useGovStore.getState().selectedStationId !== station.id) return fail('The station could not be selected.');
      if (station.lat !== null && station.lon !== null) gov.focusMap(station.lon, station.lat);
      return done();
    }
    case 'focus_map_location': {
      gov.focusMap(a.lon, a.lat);
      gov.setView('map');
      return useGovStore.getState().mapFocus ? done() : fail('The map did not move.');
    }
    case 'set_pollutant': {
      twin.setPollutant(a.pollutant);
      return useTwinStore.getState().pollutant === a.pollutant ? done('The 3D map pollutant was set.') : fail('The pollutant did not change.');
    }
    case 'show_heatmap': {
      gov.setView('map');
      return useGovStore.getState().view === 'map' ? done() : fail('The map did not open.');
    }
    case 'compare_regions': {
      const first = findStation(a.regions[0]!);
      if (!first) return fail(`${a.regions[0]} is not on this app's station list.`);
      gov.selectStation(first.id);
      gov.setView('stations');
      return done(`Selected ${first.name}. The comparison figures are in the chat.`);
    }
    case 'open_scenario':
    case 'run_scenario': {
      gov.setView('simulator');
      return useGovStore.getState().view === 'simulator' ? done('Opened the Simulator. Results update as you choose measures.') : fail('The Simulator did not open.');
    }
    case 'reset_scenario': {
      gov.resetMeasures();
      const m = useGovStore.getState().measures;
      return m.traffic === 'off' && m.trees === 0 && m.industry === 0 && m.closureRoadId === null && !m.dust ? done('The measures were cleared.') : fail('The measures were not cleared.');
    }
    case 'update_scenario_parameter': {
      const traffic = a.value <= 0 ? 'off' : a.value >= 15 ? 'intensive' : 'standard';
      gov.setMeasures({ traffic });
      gov.setView('simulator');
      return useGovStore.getState().measures.traffic === traffic ? done(`Traffic enforcement set to ${traffic}.`) : fail('The traffic setting did not change.');
    }
    case 'show_industries': {
      gov.setView('map');
      return useGovStore.getState().view === 'map' ? done('Opened the map; switch on "Industry markers" in Layers.') : fail('The map did not open.');
    }
    case 'show_scenario':
      return fail('Switching between scenario views is not available in this app.');
    case 'set_forecast_time':
      return fail('Choosing a forecast hour is not available in this app.');
    case 'highlight_chart_data':
      return fail('Highlighting chart values is not available in this app.');
  }
}

export function executeActions(actions: Action[]): ActionOutcome[] {
  return actions.map(executeAction);
}

/** Only values that the app itself holds and can verify: the screen, the selected station and zone. */
export function buildUiContext(): UiContext {
  const g = useGovStore.getState();
  const s = useTwinStore.getState();
  const ctx: UiContext = { section: VIEW_TO_SECTION[g.view], pollutant: s.pollutant };
  const station = s.catalog.stations.find((x) => x.id === g.selectedStationId);
  if (station) ctx.selected_region = station.name;
  const zoneId = g.selectedZoneId ?? g.simTargetId;
  const cell = zoneId ? s.base?.cells.find((c) => c.id === zoneId) : undefined;
  if (cell) {
    const [lon, lat] = cell.center;
    if (Number.isFinite(lat) && Number.isFinite(lon)) ctx.map_location = { lat, lon };
  }
  return ctx;
}
