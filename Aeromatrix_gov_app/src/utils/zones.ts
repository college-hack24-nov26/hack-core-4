import type { GridCell } from '../types';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { bboxContains, haversineKm } from './geo';

/**
 * Human name for each zone: the locality whose centre lies in the cell
 * (nearest the cell centre when several do). Cells with no locality are absent.
 */
export function zonePlaceNames(cells: GridCell[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of cells) {
    let best: string | undefined;
    let bestD = Infinity;
    for (const loc of PUNE_LOCALITIES) {
      if (!bboxContains(c.bounds, loc.center)) continue;
      const d = haversineKm(loc.center, c.center);
      if (d < bestD) {
        bestD = d;
        best = loc.name;
      }
    }
    if (best) out[c.id] = best;
  }
  return out;
}

/** Display name for a zone: place name if any, otherwise "Zone r-c". */
export function zoneLabel(cell: GridCell, names: Record<string, string>): string {
  return names[cell.id] ?? `Zone R${cell.row + 1}-C${cell.col + 1}`;
}
