/**
 * Region scenario: one hypothetical evaluation for a monitoring region, shared by the What-If panel, the forecast
 * chart, the comparison table and the station drawer.
 *
 * baseline  = the trained ML model (latest measured hour as the reference, plus its +24 h forecast)
 * scenario  = baseline x (scenario / baseline of the PROTOTYPE rule engine) for the same pollutant in the grid zone
 *             that contains the region's area centre.
 * The ML model forecasts pollution; it does not model interventions. The intervention effect is the rule engine's
 * RELATIVE change applied to the ML baseline, so every scenario number is hypothetical.
 */
import type { BaseState, Pollutant, ScenarioResult } from '../types';
import { isMeasuredValue, isPredicted, type ApiForecast, type ApiMeasured, type ApiPollutantKey } from '../services/aeromatrixApi';
import { cellAtLonLat } from '../utils/grid';

/** Only these pollutants get a scenario; the rest show a baseline only. */
export const SCENARIO_POLLUTANTS: Pollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

export interface RegionScenarioRow {
  pollutant: ApiPollutantKey;
  unit: string;
  /** latest measured hour (historical in the bundled data) */
  reference: { value: number; time: string; historical: boolean } | null;
  forecast: { value: number; lower: number; upper: number; validAt: string; historical: boolean } | null;
  /** engine scenario / baseline for this pollutant in the region's zone; null when no scenario applies */
  ratio: number | null;
  scenarioReference: number | null;
  scenarioForecast: { value: number; lower: number; upper: number } | null;
  hypothetical: boolean;
  reason: string | null;
}

export interface RegionScenario {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  reason: string | null;
  cellId: string | null;
  rows: RegionScenarioRow[];
  note: string;
}

export const HYPOTHETICAL_NOTE =
  'Hypothetical: the trained model forecasts pollution but does not model interventions. The scenario applies the prototype rule engine\'s relative change to the model baseline.';

const ENGINE_KEYS = new Set<string>(SCENARIO_POLLUTANTS);

export function evaluateRegionScenario(
  base: BaseState,
  region: { lat: number | null; lon: number | null },
  measured: ApiMeasured | null,
  forecast: ApiForecast | null,
  result: ScenarioResult | null,
): RegionScenario {
  const empty = (reason: string): RegionScenario => ({ status: 'UNAVAILABLE', reason, cellId: null, rows: [], note: HYPOTHETICAL_NOTE });
  if (!measured && !forecast) return empty('No data feed from the model service for this region.');
  if (region.lat === null || region.lon === null) return empty('This region has no sourced coordinate, so its grid zone cannot be found.');
  const cell = cellAtLonLat(base, region.lon, region.lat);
  if (!cell) return empty('The region lies outside the analysis area.');

  const keys = new Set<string>([...Object.keys(measured?.pollutants ?? {}), ...Object.keys(forecast?.pollutants ?? {})]);
  const rows: RegionScenarioRow[] = [];
  for (const key of keys) {
    const m = measured?.pollutants?.[key as ApiPollutantKey];
    const f = forecast?.pollutants?.[key as ApiPollutantKey];
    const reference = isMeasuredValue(m) ? { value: m.value, time: m.time, historical: m.historical } : null;
    const pred = isPredicted(f) ? f : null;
    const fc = pred ? { value: pred.value, lower: pred.lower, upper: pred.upper, validAt: pred.valid_at, historical: pred.historical } : null;
    const unit = (isMeasuredValue(m) ? m.unit : pred?.unit) ?? '';
    let ratio: number | null = null;
    let reason: string | null = null;
    if (!ENGINE_KEYS.has(key)) {
      reason = 'The prototype engine has no scenario for this pollutant: baseline only.';
    } else if (!result) {
      reason = 'No scenario has been run yet.';
    } else {
      const b = result.baseline.find((s) => s.cellId === cell.id);
      const s = result.scenario.find((x) => x.cellId === cell.id);
      const p = key as Pollutant;
      if (b && s && b[p] > 0) ratio = s[p] / b[p];
      else reason = 'The engine baseline for this zone is zero.';
    }
    rows.push({
      pollutant: key as ApiPollutantKey,
      unit,
      reference,
      forecast: fc,
      ratio,
      scenarioReference: ratio !== null && reference ? reference.value * ratio : null,
      scenarioForecast: ratio !== null && fc ? { value: fc.value * ratio, lower: fc.lower * ratio, upper: fc.upper * ratio } : null,
      hypothetical: ratio !== null,
      reason,
    });
  }
  const order = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3', 'no', 'nox', 'nh3', 'benzene', 'toluene', 'xylene'];
  rows.sort((a, b) => order.indexOf(a.pollutant) - order.indexOf(b.pollutant));
  return { status: 'AVAILABLE', reason: null, cellId: cell.id, rows, note: HYPOTHETICAL_NOTE };
}
