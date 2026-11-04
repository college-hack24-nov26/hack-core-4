/**
 * The smooth AQI surface: inverse-distance weighting of the zone values (never random), drawn tile by tile. Far from every
 * zone the surface fades out instead of inventing values.
 */
import L from 'leaflet';
import type { ZoneRow, PollutantKey } from './airdata';
import { pollutionColor } from '../../utils/colors';

export type HeatMetric = 'aqi' | PollutantKey;

/** Colour stops on the 0-500 AQI scale, the same colours as the categories. */
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [47, 174, 139]],
  [50, [47, 174, 139]],
  [100, [232, 193, 0]],
  [150, [240, 140, 26]],
  [200, [217, 55, 47]],
  [300, [140, 29, 94]],
  [500, [94, 21, 53]],
];

export function heatColor(v: number): [number, number, number] {
  const x = Math.max(0, Math.min(500, v));
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      const t = (x - a) / (b - a || 1);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** The number each zone contributes: its AQI, or the concentration of the chosen pollutant (coloured as in the city model). */
export function metricValue(z: ZoneRow, metric: HeatMetric): number | null {
  if (metric === 'aqi') return z.aqi;
  return z.values[metric] ?? null;
}

export interface HeatPoint {
  lon: number;
  lat: number;
  v: number;
}

export function heatPoints(zones: ZoneRow[], metric: HeatMetric): HeatPoint[] {
  const out: HeatPoint[] = [];
  for (const z of zones) {
    const v = metricValue(z, metric);
    if (v !== null) out.push({ lon: z.location[0], lat: z.location[1], v });
  }
  return out;
}

/** The interpolated value at a place, and the distance (km) to the nearest zone. */
export function sampleHeat(points: HeatPoint[], lon: number, lat: number): { v: number; nearestKm: number } | null {
  if (points.length === 0) return null;
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let sw = 0;
  let sv = 0;
  let best = Infinity;
  for (const p of points) {
    const dx = (p.lon - lon) * kx;
    const dy = (p.lat - lat) * ky;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) best = d2;
    const w = 1 / (d2 + 0.6);
    sw += w;
    sv += w * p.v;
  }
  return { v: sv / sw, nearestKm: Math.sqrt(best) };
}

const GRID = 32;

/** A Leaflet tile layer that paints the surface smoothly (a coarse grid scaled up with bilinear smoothing). */
export function createHeatLayer(points: HeatPoint[], metric: HeatMetric, opacity = 0.72): L.GridLayer {
  const layer = L.gridLayer({ tileSize: 256, opacity, pane: 'overlayPane', zIndex: 2 });
  (layer as unknown as { createTile: (c: L.Coords) => HTMLElement }).createTile = function (this: L.GridLayer, coords: L.Coords) {
    const tile = document.createElement('canvas');
    tile.width = 256;
    tile.height = 256;
    const map = (this as unknown as { _map?: L.Map })._map;
    if (!map) return tile;
    const small = document.createElement('canvas');
    small.width = GRID;
    small.height = GRID;
    const sctx = small.getContext('2d');
    const ctx = tile.getContext('2d');
    if (!sctx || !ctx) return tile;
    const img = sctx.createImageData(GRID, GRID);
    const step = 256 / GRID;
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const ll = map.unproject(L.point(coords.x * 256 + (i + 0.5) * step, coords.y * 256 + (j + 0.5) * step), coords.z);
        const s = sampleHeat(points, ll.lng, ll.lat);
        const o = (j * GRID + i) * 4;
        if (!s) continue;
        const [r, g, b] = metric === 'aqi' ? heatColor(s.v) : pollutionColor(metric, s.v);
        // fade out beyond ~3 km from the nearest zone
        const a = Math.max(0, Math.min(1, 1 - (s.nearestKm - 2.5) / 2.5));
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = Math.round(a * 235);
      }
    }
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, 256, 256);
    return tile;
  };
  return layer;
}
