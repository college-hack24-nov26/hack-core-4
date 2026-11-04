import type { BaseState, GridCell } from '../types';

/** Cell of the grid that contains lon/lat, or undefined when outside the city box. */
export function cellAtLonLat(base: BaseState, lon: number, lat: number): GridCell | undefined {
  const { bbox } = base.city;
  if (lon < bbox.west || lon > bbox.east || lat < bbox.south || lat > bbox.north) return undefined;
  const n = base.gridSize;
  const col = Math.min(n - 1, Math.floor(((lon - bbox.west) / (bbox.east - bbox.west)) * n));
  const row = Math.min(n - 1, Math.floor(((bbox.north - lat) / (bbox.north - bbox.south)) * n));
  return base.cells[row * n + col];
}
