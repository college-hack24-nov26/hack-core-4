import type { CellState, DataStatus, DisplayMode } from '../types';
import { useTwinStore, type TwinStoreState } from '../store/useTwinStore';
import { currentFieldValues, isLiveFresh } from '../services/liveData';
import { deltaScaleFor } from '../utils/colors';
import type { HeatSpec } from './TwinMap';

/** Provenance status of the map for a display mode (what the header badge and legend say). */
export function modeStatus(mode: DisplayMode, baseStatus: DataStatus = 'DEMO'): DataStatus {
  switch (mode) {
    case 'observed':
      return 'OBSERVED';
    case 'current':
      return 'MODEL_DATA';
    case 'forecast':
      return 'MODEL_PREDICTION';
    case 'scenario':
    case 'delta':
      return 'MODELED_SCENARIO';
    default:
      return baseStatus;
  }
}

export interface HeatSource {
  /** null when there is nothing honest to draw (the overlay is cleared and `reason` says why) */
  values: number[] | null;
  spec: HeatSpec;
  status: DataStatus;
  label: string;
  reason: string | null;
}

/** The states the map shows for baseline / scenario (the active scenario only when it matches this base). */
export function displayedStates(s: TwinStoreState): CellState[] {
  const r = s.activeResult;
  const fresh = r && s.base && r.scenario.length === s.base.cells.length && r.scenario[0]?.cellId === s.base.cells[0]?.id;
  return (s.displayMode === 'scenario' || s.displayMode === 'delta') && fresh ? r.scenario : s.baseline;
}

export function heatSource(s: TwinStoreState, nowMs: number = Date.now()): HeatSource {
  const base = s.base;
  const p = s.pollutant;
  const none = (status: DataStatus, label: string, reason: string): HeatSource => ({ values: null, spec: { kind: 'pollution', pollutant: p }, status, label, reason });
  if (!base) return none('DEMO', 'Not loaded', 'The city model is not loaded.');

  const r = s.activeResult;
  const fresh = !!r && r.scenario.length === base.cells.length && r.scenario[0]?.cellId === base.cells[0]?.id;

  switch (s.displayMode) {
    case 'delta': {
      if (!fresh) return none('MODELED_SCENARIO', 'Change', 'No scenario result yet.');
      const values = base.cells.map((c) => r.delta[c.id]?.[p] ?? 0);
      return { values, spec: { kind: 'delta', pollutant: p, scale: deltaScaleFor(p, values) }, status: 'MODELED_SCENARIO', label: 'Scenario minus baseline', reason: null };
    }
    case 'scenario': {
      const states = displayedStates(s);
      const byId = new Map(states.map((x) => [x.cellId, x]));
      return { values: base.cells.map((c) => byId.get(c.id)?.[p] ?? 0), spec: { kind: 'pollution', pollutant: p }, status: 'MODELED_SCENARIO', label: 'Scenario', reason: null };
    }
    case 'current': {
      if (!isLiveFresh(s.live, nowMs)) {
        return none('MODEL_DATA', 'Current (model data)', s.live.status === 'loading' ? 'Loading Open-Meteo model data...' : (s.live.reason ?? 'Live model data is not available, so no current field is drawn.'));
      }
      const values = currentFieldValues(base, s.live.points, p, nowMs);
      if (!values) return none('MODEL_DATA', 'Current (model data)', 'The Open-Meteo model has no value for this pollutant in every zone.');
      return { values, spec: { kind: 'pollution', pollutant: p }, status: 'MODEL_DATA', label: 'Open-Meteo CAMS model, about 40 km resolution', reason: null };
    }
    case 'observed': {
      if (!s.observations) return none('OBSERVED', 'Observed', 'No observations imported. Import a CPCB CSV in the Data panel.');
      if (!s.observedField) return none('OBSERVED', 'Observed', 'No imported station has both a coordinate and a reading for this pollutant.');
      return { values: s.observedField.values, spec: { kind: 'pollution', pollutant: p }, status: 'OBSERVED', label: s.observedField.label, reason: null };
    }
    case 'forecast': {
      if (!s.forecastLayer) {
        const why =
          s.modelService.status !== 'online'
            ? 'The model service is not connected: no forecast is available.'
            : s.catalog.stations.every((st) => st.lat === null)
              ? 'No station has a sourced coordinate, so a forecast field cannot be placed.'
              : 'No station has a forecast for this pollutant (bundled readings are historical; turn on "Include historical forecast").';
        return none('MODEL_PREDICTION', 'Forecast', why);
      }
      return { values: s.forecastLayer.field.values, spec: { kind: 'pollution', pollutant: p }, status: 'MODEL_PREDICTION', label: s.forecastLayer.field.label, reason: null };
    }
    default: {
      const byId = new Map(s.baseline.map((x) => [x.cellId, x]));
      return { values: base.cells.map((c) => byId.get(c.id)?.[p] ?? 0), spec: { kind: 'pollution', pollutant: p }, status: base.status, label: 'Scenario model', reason: null };
    }
  }
}

/** Hook: the true current source of the map, for the header badge and the legend. */
export function useMapSource(): HeatSource {
  const s = useTwinStore();
  return heatSource(s);
}

/** Whether a Current (live model) field exists for the pollutant right now. */
export function hasCurrentField(s: TwinStoreState, pollutant: TwinStoreState['pollutant']): boolean {
  if (!s.base || !isLiveFresh(s.live)) return false;
  return currentFieldValues(s.base, s.live.points, pollutant) !== null;
}
