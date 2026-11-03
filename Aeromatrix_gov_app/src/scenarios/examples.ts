import type { BaseState, SavedScenario } from '../types';
import { PRESETS, type PresetId } from '../simulator/presets';
import { runScenario } from '../services/scenarioService';

export interface ExampleScenario extends SavedScenario {
  key: 'A' | 'B' | 'C' | 'D' | 'E';
  example: true;
  /** What the example demonstrates. */
  documentation: string;
}

const EXAMPLES: Array<{ key: ExampleScenario['key']; preset: PresetId; doc: string }> = [
  { key: 'A', preset: 'rush-hour', doc: 'Peak-hour traffic (+35%) with weak wind: shows how much a busy evening raises PM2.5 around the main corridors.' },
  { key: 'B', preset: 'monsoon', doc: 'Heavy rain, stronger wind and cooler air: shows how weather alone can wash PM2.5 out of the whole city.' },
  { key: 'C', preset: 'winter-inversion', doc: 'Near-calm, cold, humid air: shows the worst-case build-up when pollution cannot disperse.' },
  { key: 'D', preset: 'calm-industrial', doc: 'Industries at +25% output on a calm day: shows downwind plumes from industrial areas.' },
  { key: 'E', preset: 'clean-fleet', doc: '50% cleaner vehicles and a 10% shift to transit: shows the effect of a fleet policy with weather unchanged.' },
];

/** Five documented example scenarios built from the presets, evaluated on the current base state. */
export function exampleScenarios(base: BaseState): ExampleScenario[] {
  return EXAMPLES.map(({ key, preset, doc }) => {
    const p = PRESETS.find((x) => x.id === preset)!;
    const params = { ...p.build(base), name: `${key} - ${p.label}` };
    const r = runScenario(base, params);
    return {
      key,
      example: true as const,
      documentation: doc,
      id: `example-${key}`,
      name: params.name,
      createdAt: '',
      params,
      geometrySource: base.geometrySource,
      gridSize: base.gridSize,
      meanDelta: r.summary.meanDelta,
      meanDeltaPct: r.summary.meanDeltaPct,
    };
  });
}
