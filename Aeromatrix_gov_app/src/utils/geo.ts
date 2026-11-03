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

// ---- V2 additions ----

export function pathLengthKm(path: LonLat[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += haversineKm(path[i - 1], path[i]);
  return d;
}

export function polygonAreaKm2(poly: LonLat[]): number {
  if (poly.length < 3) return 0;
  const lat0 = (poly[0][1] * Math.PI) / 180;
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += poly[j][0] * kx * (poly[i][1] * ky) - poly[i][0] * kx * (poly[j][1] * ky);
  }
  return Math.abs(s) / 2;
}

export function polygonCentroid(poly: LonLat[]): LonLat {
  let x = 0;
  let y = 0;
  const n = poly.length > 1 && poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1] ? poly.length - 1 : poly.length;
  for (let i = 0; i < n; i++) {
    x += poly[i][0];
    y += poly[i][1];
  }
  return [x / Math.max(1, n), y / Math.max(1, n)];
}

/** Whether a path's bounding box, grown by marginKm, overlaps a bbox. */
export function pathNearBBox(path: LonLat[], b: BBox, marginKm: number): boolean {
  const mLat = marginKm / 110.57;
  const mLon = marginKm / (111.32 * Math.cos((((b.south + b.north) / 2) * Math.PI) / 180));
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [x, y] of path) {
    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;
  }
  return !(east < b.west - mLon || west > b.east + mLon || north < b.south - mLat || south > b.north + mLat);
}
