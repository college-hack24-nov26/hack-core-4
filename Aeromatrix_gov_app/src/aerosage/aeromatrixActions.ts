import type { Pollutant, Section } from '../types';

/**
 * The only things AeroSage can ask the app to do. Everything the server sends is checked against this list;
 * anything else is dropped, so a reply can never run arbitrary code or touch unknown parts of the app.
 */
export type Action =
  | { type: 'navigate_to_section'; section: Section }
  | { type: 'select_region'; region: string }
  | { type: 'focus_map_location'; lat: number; lon: number }
  | { type: 'set_pollutant'; pollutant: Pollutant }
  | { type: 'show_heatmap' }
  | { type: 'set_forecast_time'; hours: number }
  | { type: 'compare_regions'; regions: string[] }
  | { type: 'open_scenario' }
  | { type: 'run_scenario' }
  | { type: 'reset_scenario' }
  | { type: 'update_scenario_parameter'; parameter: 'traffic_reduction_pct'; value: number }
  | { type: 'show_scenario'; mode: 'delta' | 'scenario' | 'baseline' }
  | { type: 'show_industries' }
  | { type: 'highlight_chart_data'; chart: string };

export const POLLUTANTS: readonly Pollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

/** Server section names -> app sections. "map" has no panel of its own, so it means the overview. */
const SECTION_MAP: Record<string, Section> = {
  map: 'overview',
  sites: 'locations',
  overview: 'overview',
  air: 'air',
  zones: 'zones',
  traffic: 'traffic',
  industries: 'industries',
  green: 'green',
  simulator: 'simulator',
  scenarios: 'scenarios',
  actions: 'actions',
  locations: 'locations',
  sensors: 'sensors',
  analytics: 'analytics',
  data: 'data',
};

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 80): string | null =>
  typeof x === 'string' && x.length > 0 && x.length <= max ? x : null;
const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function parseAction(raw: unknown): Action | null {
  if (!isObj(raw)) return null;
  switch (raw.type) {
    case 'navigate_to_section': {
      const s = str(raw.section, 30);
      const section = s ? SECTION_MAP[s] : undefined;
      return section ? { type: 'navigate_to_section', section } : null;
    }
    case 'select_region': {
      const region = str(raw.region);
      return region ? { type: 'select_region', region } : null;
    }
    case 'focus_map_location': {
      const lat = num(raw.lat);
      const lon = num(raw.lon);
      return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
        ? { type: 'focus_map_location', lat, lon }
        : null;
    }
    case 'set_pollutant': {
      const p = str(raw.pollutant, 10);
      return p && (POLLUTANTS as readonly string[]).includes(p) ? { type: 'set_pollutant', pollutant: p as Pollutant } : null;
    }
    case 'show_heatmap':
    case 'open_scenario':
    case 'run_scenario':
    case 'reset_scenario':
    case 'show_industries':
      return { type: raw.type };
    case 'set_forecast_time': {
      const hours = num(raw.hours);
      return hours !== null && hours >= 0 && hours <= 72 ? { type: 'set_forecast_time', hours } : null;
    }
    case 'compare_regions': {
      if (!Array.isArray(raw.regions)) return null;
      const regions = raw.regions.map((r) => str(r)).filter((r): r is string => r !== null).slice(0, 2);
      return regions.length >= 2 ? { type: 'compare_regions', regions } : null;
    }
    case 'update_scenario_parameter': {
      const value = num(raw.value);
      if (raw.parameter !== 'traffic_reduction_pct' || value === null || value < 0 || value > 100) return null;
      return { type: 'update_scenario_parameter', parameter: 'traffic_reduction_pct', value };
    }
    case 'show_scenario': {
      const mode = raw.mode === undefined ? 'delta' : raw.mode;
      return mode === 'delta' || mode === 'scenario' || mode === 'baseline' ? { type: 'show_scenario', mode } : null;
    }
    case 'highlight_chart_data': {
      const chart = str(raw.chart ?? 'chart', 40);
      return chart ? { type: 'highlight_chart_data', chart } : null;
    }
    default:
      return null;
  }
}

/** Keeps the valid actions (at most 8) and counts what was dropped. */
export function parseActions(raw: unknown): { actions: Action[]; dropped: number } {
  const list = Array.isArray(raw) ? raw : [];
  const actions: Action[] = [];
  let dropped = 0;
  for (const item of list.slice(0, 20)) {
    const a = parseAction(item);
    if (a && actions.length < 8) actions.push(a);
    else dropped++;
  }
  return { actions, dropped };
}

/** Actions that change what the person has set up (their scenario) wait for a confirmation. Looking around never does. */
export function isDisruptive(a: Action): boolean {
  return a.type === 'reset_scenario' || a.type === 'update_scenario_parameter';
}

/**
 * Splits a reply's actions into those that run now and those that wait for a click. Order is kept: the first
 * scenario-changing action and everything after it wait, so a "run" never happens before the change it depends on.
 */
export function splitActions(actions: Action[]): { now: Action[]; waiting: Action[] } {
  const i = actions.findIndex(isDisruptive);
  return i < 0 ? { now: actions, waiting: [] } : { now: actions.slice(0, i), waiting: actions.slice(i) };
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case 'navigate_to_section':
      return `Open the ${a.section} panel`;
    case 'select_region':
      return `Select ${a.region} on the map`;
    case 'focus_map_location':
      return `Fly to ${a.lat.toFixed(3)}, ${a.lon.toFixed(3)}`;
    case 'set_pollutant':
      return `Show ${a.pollutant.toUpperCase()}`;
    case 'show_heatmap':
      return 'Show the heatmap';
    case 'set_forecast_time':
      return `Set the forecast to +${a.hours} h`;
    case 'compare_regions':
      return `Compare ${a.regions.join(' and ')}`;
    case 'open_scenario':
      return 'Open the What-If simulator';
    case 'run_scenario':
      return 'Run the scenario';
    case 'reset_scenario':
      return 'Reset the scenario to baseline';
    case 'update_scenario_parameter':
      return `Set traffic reduction to ${a.value}%`;
    case 'show_scenario':
      return `Show the ${a.mode} view`;
    case 'show_industries':
      return 'Show the industries';
    case 'highlight_chart_data':
      return `Highlight ${a.chart}`;
  }
}
