import type { BBox, BaseState, LonLat, Road } from '../../types';
import {
  TRAFFIC_COLORS,
  trafficColorKey,
  type RGB,
} from '../../utils/colors';

/**
 * Pollution heatmap drawn to a canvas: cell values, bilinearly smoothed between cell centres.
 * Row 0 is the northern edge, so the canvas maps directly onto the city rectangle.
 * `colorAt` decides the colour (pollution ramp, or the blue/rose change scale).
 */
export function renderHeatmapCanvas(
  base: BaseState,
  values: number[],
  colorAt: (v: number) => RGB,
  size = 512,
): HTMLCanvasElement {
  const n = base.gridSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const at = (r: number, c: number) =>
    values[Math.min(n - 1, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, c))] ?? 0;

  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    const gy = ((py + 0.5) / size) * n - 0.5;
    const r0 = Math.floor(gy);
    const fy = gy - r0;
    for (let px = 0; px < size; px++) {
      const gx = ((px + 0.5) / size) * n - 0.5;
      const c0 = Math.floor(gx);
      const fx = gx - c0;
      const v =
        at(r0, c0) * (1 - fx) * (1 - fy) +
        at(r0, c0 + 1) * fx * (1 - fy) +
        at(r0 + 1, c0) * (1 - fx) * fy +
        at(r0 + 1, c0 + 1) * fx * fy;
      const [r, g, b] = colorAt(v);
      const o = (py * size + px) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function blank(size: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

/** Grid outline canvas (thin lines on every cell boundary). */
export function renderGridCanvas(gridSize: number, size = 1024): HTMLCanvasElement {
  const [canvas, ctx] = blank(size);
  if (!ctx) return canvas;
  ctx.strokeStyle = 'rgba(251,245,233,0.85)';
  ctx.lineWidth = gridSize >= 20 ? 1 : 1.6;
  ctx.beginPath();
  for (let i = 0; i <= gridSize; i++) {
    const p = Math.min(size - 0.8, Math.max(0.8, (i / gridSize) * size));
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
  }
  ctx.stroke();
  return canvas;
}

export interface MarkupSpec {
  gridSize: number;
  selected: { row: number; col: number } | null;
  /** cells in the user's target area */
  targets: Array<{ row: number; col: number }>;
  /** affected zones in Scenario / Change modes; sign gives the outline colour */
  affected: Array<{ row: number; col: number; delta: number }>;
}

/** Selection, target-area and affected-zone outlines on one canvas. */
export function renderMarkupCanvas(spec: MarkupSpec, size = 1024): HTMLCanvasElement {
  const [canvas, ctx] = blank(size);
  if (!ctx) return canvas;
  const w = size / spec.gridSize;

  for (const t of spec.targets) {
    ctx.fillStyle = 'rgba(251,245,233,0.22)';
    ctx.fillRect(t.col * w, t.row * w, w, w);
    ctx.strokeStyle = '#fbf5e9';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.strokeRect(t.col * w + 3, t.row * w + 3, w - 6, w - 6);
    ctx.setLineDash([]);
  }
  for (const a of spec.affected) {
    ctx.strokeStyle = a.delta < 0 ? '#38bdf8' : '#f43f5e';
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.strokeRect(a.col * w + 2, a.row * w + 2, w - 4, w - 4);
  }
  if (spec.selected) {
    const x = spec.selected.col * w;
    const y = spec.selected.row * w;
    ctx.fillStyle = 'rgba(251,245,233,0.18)';
    ctx.fillRect(x, y, w, w);
    ctx.strokeStyle = '#fbf5e9';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, w - 5);
    ctx.strokeStyle = '#a3263f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 6, y + 6, w - 12, w - 12);
  }
  return canvas;
}

const projector = (bbox: BBox, size: number) => (p: LonLat): [number, number] => [
  ((p[0] - bbox.west) / (bbox.east - bbox.west)) * size,
  ((bbox.north - p[1]) / (bbox.north - bbox.south)) * size,
];

function lineWidthFor(road: Road): number {
  switch (road.roadClass) {
    case 'motorway':
    case 'trunk':
    case 'Expressway':
    case 'Highway':
      return 3.6;
    case 'primary':
      return 2.8;
    case 'secondary':
    case 'Arterial':
      return 2.2;
    default:
      return road.volume >= 75 ? 3.2 : 2.2;
  }
}

export interface RoadsSpec {
  roads: Road[];
  bbox: BBox;
  /** colour by TRAFFIC_COLORS instead of one neutral colour */
  traffic: boolean;
  closedIds: Set<string>;
  selectedId: string | null;
}

/** Road network (neutral or traffic-coloured). Closed roads are dashed red; the selected road has a halo. */
export function renderRoadsCanvas(spec: RoadsSpec, size = 2048): HTMLCanvasElement {
  const [canvas, ctx] = blank(size);
  if (!ctx) return canvas;
  const proj = projector(spec.bbox, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const trace = (road: Road) => {
    ctx.beginPath();
    for (const path of road.paths) {
      path.forEach((pt, i) => {
        const [x, y] = proj(pt);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
  };
  const k = size / 1024;
  const scaled = [...spec.roads].sort((a, b) => a.volume - b.volume);
  for (const road of scaled) {
    if (spec.closedIds.has(road.id)) continue;
    trace(road);
    ctx.strokeStyle = spec.traffic ? TRAFFIC_COLORS[trafficColorKey(road.volume)] : 'rgba(255,244,225,0.92)';
    ctx.lineWidth = lineWidthFor(road) * k;
    ctx.stroke();
  }
  for (const road of scaled) {
    if (!spec.closedIds.has(road.id)) continue;
    trace(road);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = (lineWidthFor(road) + 1.5) * k;
    ctx.setLineDash([14 * k, 9 * k]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const sel = spec.selectedId ? spec.roads.find((r) => r.id === spec.selectedId) : undefined;
  if (sel) {
    trace(sel);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = (lineWidthFor(sel) + 4) * k;
    ctx.stroke();
    trace(sel);
    ctx.strokeStyle = '#a3263f';
    ctx.lineWidth = lineWidthFor(sel) * k;
    ctx.stroke();
  }
  return canvas;
}

/** Green areas (parks, forests) as translucent polygons. */
export function renderGreenCanvas(areas: Array<{ polygon: LonLat[] }>, bbox: BBox, size = 2048): HTMLCanvasElement {
  const [canvas, ctx] = blank(size);
  if (!ctx) return canvas;
  const proj = projector(bbox, size);
  ctx.fillStyle = 'rgba(34,197,94,0.5)';
  ctx.strokeStyle = 'rgba(21,128,61,0.85)';
  ctx.lineWidth = 1.5 * (size / 1024);
  for (const a of areas) {
    ctx.beginPath();
    a.polygon.forEach((pt, i) => {
      const [x, y] = proj(pt);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}
