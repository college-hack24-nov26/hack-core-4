import type { LonLat, Road } from '../types';
import { distanceToPathKm, pathNearBBox } from './geo';

/** Nearest road within maxKm of a point, or null. */
export function nearestRoad(roads: Road[], p: LonLat, maxKm: number): { road: Road; distanceKm: number } | null {
  const box = { west: p[0], east: p[0], south: p[1], north: p[1] };
  let best: { road: Road; distanceKm: number } | null = null;
  for (const road of roads) {
    for (const path of road.paths) {
      if (!pathNearBBox(path, box, maxKm)) continue;
      const d = distanceToPathKm(p, path);
      if (d <= maxKm && (!best || d < best.distanceKm)) best = { road, distanceKm: d };
    }
  }
  return best;
}
