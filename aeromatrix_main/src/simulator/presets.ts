import type { BaseState, ScenarioParams } from '../types';
import { defaultParams } from '../services/scenarioService';

export type PresetId = 'rush-hour' | 'monsoon' | 'winter-inversion' | 'calm-industrial' | 'clean-fleet';

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  build: (base: BaseState) => ScenarioParams;
}

/**
 * One-click presets. Every preset starts from the baseline parameters and changes only what is listed here.
 * The numbers are illustrative inputs for the prototype model, not calibrated observations.
 */
export const PRESETS: Preset[] = [
  {
    id: 'rush-hour',
    label: 'Rush hour',
    description: 'Traffic +35% with light winds (1.6 m/s).',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Rush hour',
      trafficMultiplier: 1.35, // peak-hour flow relative to the daily average
      weather: { ...base.weather, windSpeed: 1.6 }, // typical weak evening wind
    }),
  },
  {
    id: 'monsoon',
    label: 'Monsoon day',
    description: 'Heavy rain washes particles out; stronger wind, cooler, humid.',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Monsoon day',
      trafficMultiplier: 0.9, // fewer trips in heavy rain
      weather: {
        ...base.weather,
        rainfall: 40, // mm/day, strong monsoon rain (washout term in the model)
        humidity: 90,
        windSpeed: 4.5,
        temperature: 24,
        pressure: 1004,
      },
    }),
  },
  {
    id: 'winter-inversion',
    label: 'Winter inversion',
    description: 'Low wind, high humidity and low temperature trap pollution near the ground.',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Winter inversion',
      trafficMultiplier: 1.1,
      weather: {
        ...base.weather,
        windSpeed: 0.6, // almost still air
        humidity: 78,
        temperature: 13, // cold morning
        pressure: 1018, // high pressure, stable air
        rainfall: 0,
      },
    }),
  },
  {
    id: 'calm-industrial',
    label: 'Calm industrial day',
    description: 'Industries run at +25% output on a near-calm day with lighter traffic.',
    build: (base) => {
      const overrides: Record<string, number> = {};
      for (const i of base.industries) overrides[i.id] = Math.min(100, Math.round(i.emissionIntensity * 1.25));
      return {
        ...defaultParams(base),
        name: 'Calm industrial day',
        trafficMultiplier: 0.85, // weekend-like traffic
        industryIntensityOverrides: overrides,
        weather: { ...base.weather, windSpeed: 0.8 },
      };
    },
  },
  {
    id: 'clean-fleet',
    label: 'Clean fleet',
    description: '50% cleaner vehicles plus a 10% shift to public transport.',
    build: (base) => ({
      ...defaultParams(base),
      name: 'Clean fleet',
      vehicleEmissionControl: 0.5,
      publicTransportShift: 0.1,
    }),
  },
];

export function presetById(id: PresetId): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}
