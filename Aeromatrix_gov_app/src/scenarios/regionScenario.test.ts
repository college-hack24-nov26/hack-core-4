import { beforeAll, describe, expect, it } from 'vitest';
import examples from '../services/__fixtures__/trained_model_RESPONSE_EXAMPLES.json';
import type { BaseState } from '../types';
import type { ApiForecast, ApiMeasured } from '../services/aeromatrixApi';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { defaultParams, runScenario } from '../services/scenarioService';
import { HYPOTHETICAL_NOTE, SCENARIO_POLLUTANTS, evaluateRegionScenario } from './regionScenario';

const ex = examples as unknown as Record<string, ApiForecast | ApiMeasured>;
const measured = ex.measured_Hadapsar as ApiMeasured;
const forecast = ex.Hadapsar as ApiForecast;
const HADAPSAR = { lat: 18.501793, lon: 73.927532 };

let base: BaseState;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
});

describe('evaluateRegionScenario', () => {
  it('applies the engine\'s relative change to the ML baseline, for the six engine pollutants only', () => {
    const result = runScenario(base, { ...defaultParams(base), trafficMultiplier: 1.5 });
    const rs = evaluateRegionScenario(base, HADAPSAR, measured, forecast, result);
    expect(rs.status).toBe('AVAILABLE');
    expect(rs.note).toBe(HYPOTHETICAL_NOTE);
    const pm = rs.rows.find((r) => r.pollutant === 'pm25')!;
    expect(pm.ratio).toBeGreaterThan(1);
    // scenario = baseline x ratio, for the reference hour and for the +24 h forecast and its interval
    expect(pm.scenarioReference).toBeCloseTo(pm.reference!.value * pm.ratio!, 8);
    expect(pm.scenarioForecast!.value).toBeCloseTo(pm.forecast!.value * pm.ratio!, 8);
    expect(pm.scenarioForecast!.lower).toBeCloseTo(pm.forecast!.lower * pm.ratio!, 8);
    expect(pm.scenarioForecast!.upper).toBeCloseTo(pm.forecast!.upper * pm.ratio!, 8);
    expect(pm.hypothetical).toBe(true);
    expect(pm.reference!.historical).toBe(true);
    // the ratio is the engine's, in the zone that contains the region
    const cell = base.cells.find((c) => c.id === rs.cellId)!;
    const b = result.baseline.find((s) => s.cellId === cell.id)!;
    const s = result.scenario.find((x) => x.cellId === cell.id)!;
    expect(pm.ratio).toBeCloseTo(s.pm25 / b.pm25, 10);
  });

  it('shows a baseline only for pollutants the engine does not model', () => {
    const result = runScenario(base, { ...defaultParams(base), trafficMultiplier: 1.5 });
    const rs = evaluateRegionScenario(base, HADAPSAR, measured, forecast, result);
    for (const key of ['no', 'nox', 'benzene', 'toluene', 'xylene']) {
      const row = rs.rows.find((r) => r.pollutant === key)!;
      expect(row.ratio).toBeNull();
      expect(row.scenarioReference).toBeNull();
      expect(row.scenarioForecast).toBeNull();
      expect(row.hypothetical).toBe(false);
      expect(row.reason).toMatch(/baseline only/);
    }
    expect(SCENARIO_POLLUTANTS).toEqual(['pm25', 'pm10', 'no2', 'so2', 'co', 'o3']);
  });

  it('keeps UNAVAILABLE forecasts unavailable (no forecast row, no invented scenario)', () => {
    const result = runScenario(base, { ...defaultParams(base), trafficMultiplier: 1.5 });
    const rs = evaluateRegionScenario(base, HADAPSAR, measured, forecast, result);
    const so2 = rs.rows.find((r) => r.pollutant === 'so2')!; // UNAVAILABLE at Hadapsar
    expect(so2.forecast).toBeNull();
    expect(so2.scenarioForecast).toBeNull();
  });

  it('a no-change scenario leaves the baseline untouched (ratio 1)', () => {
    const result = runScenario(base, defaultParams(base));
    const rs = evaluateRegionScenario(base, HADAPSAR, measured, forecast, result);
    const pm = rs.rows.find((r) => r.pollutant === 'pm25')!;
    expect(pm.ratio).toBeCloseTo(1, 10);
    expect(pm.scenarioReference).toBeCloseTo(pm.reference!.value, 8);
  });

  it('explains itself when it cannot evaluate', () => {
    const result = runScenario(base, defaultParams(base));
    expect(evaluateRegionScenario(base, HADAPSAR, null, null, result)).toMatchObject({ status: 'UNAVAILABLE', reason: expect.stringMatching(/No data feed/) });
    expect(evaluateRegionScenario(base, { lat: null, lon: null }, measured, forecast, result).reason).toMatch(/no sourced coordinate/);
    expect(evaluateRegionScenario(base, { lat: 10, lon: 10 }, measured, forecast, result).reason).toMatch(/outside the analysis area/);
    const noRun = evaluateRegionScenario(base, HADAPSAR, measured, forecast, null);
    expect(noRun.rows.find((r) => r.pollutant === 'pm25')!.reason).toMatch(/No scenario has been run/);
    expect(noRun.rows.find((r) => r.pollutant === 'pm25')!.ratio).toBeNull();
  });
});
