import type { BaseState, CellState, Pollutant } from '../../types';
import { pollutionColor } from '../../utils/colors';

/**
 * Pollution heatmap drawn to a canvas: cell values, bilinearly smoothed between cell centres.
 * Row 0 is the northern edge, so the canvas maps directly onto the city rectangle.
 */
export function renderHeatmapCanvas(
  base: BaseState,
  states: CellState[],
  pollutant: Pollutant,
  size = 512,
): HTMLCanvasElement {
  const n = base.gridSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const values = new Float32Array(n * n);
  const byId = new Map(states.map((s) => [s.cellId, s]));
  base.cells.forEach((c, i) => {
    values[i] = byId.get(c.id)?.[pollutant] ?? 0;
  });
  const at = (r: number, c: number) => values[Math.min(n - 1, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, c))];

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
      const [r, g, b] = pollutionColor(pollutant, v);
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

/** Grid outline canvas (thin lines on every cell boundary). */
export function renderGridCanvas(gridSize: number, size = 1024): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
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

/** Highlight canvas for one selected cell. */
export function renderSelectionCanvas(gridSize: number, row: number, col: number, size = 1024): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const w = size / gridSize;
  const x = col * w;
  const y = row * w;
  ctx.fillStyle = 'rgba(251,245,233,0.18)';
  ctx.fillRect(x, y, w, w);
  ctx.strokeStyle = '#fbf5e9';
  ctx.lineWidth = 5;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, w - 5);
  ctx.strokeStyle = '#a3263f';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 6, y + 6, w - 12, w - 12);
  return canvas;
}
