import type { BBox, LonLat } from '../types';

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Offset of rcp from src in km: [east, north]. */
export function offsetKm(src: LonLat, rcp: LonLat): [number, number] {
  const midLat = rad((src[1] + rcp[1]) / 2);
  const east = rad(rcp[0] - src[0]) * R * Math.cos(midLat);
  const north = rad(rcp[1] - src[1]) * R;
  return [east, north];
}

export function bboxOf(points: LonLat[]): BBox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [x, y] of points) {
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return { west, south, east, north };
}

export function bboxContains(b: BBox, p: LonLat): boolean {
  return p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north;
}

export function pointInPolygon(p: LonLat, poly: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distToSegmentKm(p: LonLat, a: LonLat, b: LonLat): number {
  const [bx, by] = offsetKm(a, b);
  const [px, py] = offsetKm(a, p);
  const len2 = bx * bx + by * by;
  let t = len2 === 0 ? 0 : (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

export function distanceToPathKm(p: LonLat, path: LonLat[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return haversineKm(p, path[0]);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const d = distToSegmentKm(p, path[i], path[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

export function distanceToBBoxKm(p: LonLat, b: BBox): number {
  const cx = Math.min(Math.max(p[0], b.west), b.east);
  const cy = Math.min(Math.max(p[1], b.south), b.north);
  return haversineKm(p, [cx, cy]);
}

export function cellAreaKm2(b: BBox): number {
  const w = haversineKm([b.west, (b.south + b.north) / 2], [b.east, (b.south + b.north) / 2]);
  const h = haversineKm([b.west, b.south], [b.west, b.north]);
  return w * h;
}
