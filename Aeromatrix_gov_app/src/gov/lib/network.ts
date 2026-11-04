/**
 * A proposed AeroMatrix sensor network for one area: a few low-cost devices placed around the area, all linked to the
 * nearest official monitoring centre (a manual NAMP centre first, otherwise a continuous CAAQMS station), which in turn
 * feeds the AeroMatrix model. The device positions are an illustrative starting layout, not a surveyed site plan.
 */
import type { GridCell } from '../../types';
import type { StationRow } from './stations';
import { distKm } from './stations';

export interface NetNode {
  id: string;
  lat: number;
  lon: number;
}

export interface NetworkPlan {
  hub: { name: string; kind: 'namp' | 'caaqms'; lat: number; lon: number; km: number } | null;
  devices: NetNode[];
  area: { name: string; lat: number; lon: number };
  /** the map window in Web Mercator metres, already fitted to the picture's shape */
  view: { x0: number; y0: number; x1: number; y1: number };
  /** pixel size the picture is requested at */
  px: { w: number; h: number };
}

const R = 6378137;
export const mercX = (lon: number): number => (lon * Math.PI * R) / 180;
export const mercY = (lat: number): number => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** The nearest official centre: manual (NAMP) first, within `maxKm`; else a continuous (CAAQMS) station. */
export function chooseHub(stations: StationRow[], lon: number, lat: number, maxKm = 30): NetworkPlan['hub'] {
  const near = (kind: 'manual' | 'continuous') =>
    stations
      .filter((s) => s.monitoring === kind)
      .map((s) => ({ s, km: distKm([lon, lat], [s.lon, s.lat]) }))
      .filter((x) => x.km <= maxKm)
      .sort((a, b) => a.km - b.km)[0];
  const pick = near('manual') ?? near('continuous');
  if (!pick) return null;
  return { name: pick.s.name, kind: pick.s.monitoring === 'manual' ? 'namp' : 'caaqms', lat: pick.s.lat, lon: pick.s.lon, km: pick.km };
}

export function planNetwork(areaName: string, cell: Pick<GridCell, 'center' | 'bounds'>, stations: StationRow[], px = { w: 1200, h: 700 }): NetworkPlan {
  const [lon, lat] = cell.center;
  const halfLon = (cell.bounds.east - cell.bounds.west) / 2;
  const halfLat = (cell.bounds.north - cell.bounds.south) / 2;
  // four devices inside the area, one towards each corner
  const devices: NetNode[] = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([sx, sy], i) => ({ id: `D${i + 1}`, lon: lon + sx * halfLon * 0.5, lat: lat + sy * halfLat * 0.5 }));
  const hub = chooseHub(stations, lon, lat);

  const xs = [...devices.map((d) => mercX(d.lon)), mercX(lon), ...(hub ? [mercX(hub.lon)] : [])];
  const ys = [...devices.map((d) => mercY(d.lat)), mercY(lat), ...(hub ? [mercY(hub.lat)] : [])];
  let x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  let y0 = Math.min(...ys);
  let y1 = Math.max(...ys);
  const padX = Math.max(700, (x1 - x0) * 0.35);
  const padY = Math.max(700, (y1 - y0) * 0.35);
  x0 -= padX;
  x1 += padX;
  y0 -= padY;
  y1 += padY;
  // fit the window to the picture's aspect ratio without cropping anything
  const aspect = px.w / px.h;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return {
    hub,
    devices,
    area: { name: areaName, lat, lon },
    view: { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 },
    px,
  };
}

/** Position of a point in the picture, as fractions (0-1) of its width and height. */
export function toFraction(plan: NetworkPlan, lon: number, lat: number): [number, number] {
  const { x0, x1, y0, y1 } = plan.view;
  return [(mercX(lon) - x0) / (x1 - x0), 1 - (mercY(lat) - y0) / (y1 - y0)];
}

/** Satellite picture of the window (Esri World Imagery), as a data URL; null when it cannot be fetched. */
export async function loadSatellite(plan: NetworkPlan, timeoutMs = 9000): Promise<string | null> {
  const { x0, y0, x1, y1 } = plan.view;
  const url = `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${x0},${y0},${x1},${y1}&bboxSR=3857&imageSR=3857&size=${plan.px.w},${plan.px.h}&format=jpg&f=image`;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('image')) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** The logo as a data URL for the PDF. */
export async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/aeromatrix-logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
