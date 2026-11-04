/**
 * The live model gives one value per ~40 km cell, so many zones would show the same number. Inside each cell the zones are
 * spread around that value using the city model's relative pattern (traffic, industry, green cover) while the cell
 * average stays equal to the live value. Limited to 0.6x to 1.8x so nothing runs away. Every panel and the map use these
 * same factors, so one place always shows one set of numbers.
 */
import type { BaseState, CellState } from '../types';
import type { LiveAirPoint } from './liveData';
import { zonePointId } from './liveData';

const gridKey = (p: LiveAirPoint): string => `${p.grid[1].toFixed(2)},${p.grid[0].toFixed(2)}`;

export function localFactors(base: BaseState, points: Record<string, LiveAirPoint>, baseline: CellState[]): Record<string, number> {
  const pm = new Map(baseline.map((b) => [b.cellId, b.pm25]));
  const groups = new Map<string, string[]>();
  for (const c of base.cells) {
    const p = points[zonePointId(c.id)];
    if (!p || !pm.has(c.id)) continue;
    const k = gridKey(p);
    const g = groups.get(k);
    if (g) g.push(c.id);
    else groups.set(k, [c.id]);
  }
  const out: Record<string, number> = {};
  for (const ids of groups.values()) {
    const mean = ids.reduce((a, id) => a + (pm.get(id) ?? 0), 0) / ids.length;
    if (mean <= 0) continue;
    for (const id of ids) out[id] = Math.max(0.6, Math.min(1.8, (pm.get(id) ?? 0) / mean));
  }
  return out;
}
