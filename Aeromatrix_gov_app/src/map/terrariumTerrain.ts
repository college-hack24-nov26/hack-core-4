import { Credit, CustomHeightmapTerrainProvider, WebMercatorTilingScheme } from 'cesium';

/**
 * Open world terrain from the Terrarium DEM (SRTM-derived, Mapzen / AWS Open Data).
 * Decoded in the browser into heightmap tiles for Cesium. No token required.
 */
const TILE = 256;
const GRID = 65;
const MAX_SRC_ZOOM = 13;
const FALLBACK_HEIGHT = 550; // Pune plateau, used only when a tile cannot be fetched
const cache = new Map<string, Promise<Float32Array>>();

async function loadElevationTile(z: number, x: number, y: number): Promise<Float32Array> {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`);
    if (!res.ok) throw new Error(`terrain tile ${key}: HTTP ${res.status}`);
    const bmp = await createImageBitmap(await res.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(bmp, 0, 0, TILE, TILE);
    bmp.close();
    const px = ctx.getImageData(0, 0, TILE, TILE).data;
    const out = new Float32Array(TILE * TILE);
    for (let i = 0; i < out.length; i++) {
      out[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
    }
    return out;
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  if (cache.size > 300) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  return p;
}

function sample(src: Float32Array, u: number, v: number): number {
  const fx = Math.min(TILE - 1, Math.max(0, u * (TILE - 1)));
  const fy = Math.min(TILE - 1, Math.max(0, v * (TILE - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(TILE - 1, x0 + 1);
  const y1 = Math.min(TILE - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  return (
    src[y0 * TILE + x0] * (1 - tx) * (1 - ty) +
    src[y0 * TILE + x1] * tx * (1 - ty) +
    src[y1 * TILE + x0] * (1 - tx) * ty +
    src[y1 * TILE + x1] * tx * ty
  );
}

async function heightsFor(x: number, y: number, level: number): Promise<Float32Array> {
  const z = Math.min(level, MAX_SRC_ZOOM);
  const d = level - z;
  const tx = x >> d;
  const ty = y >> d;
  const span = 1 / (1 << d);
  const ox = (x - (tx << d)) * span;
  const oy = (y - (ty << d)) * span;
  const out = new Float32Array(GRID * GRID);
  try {
    const src = await loadElevationTile(z, tx, ty);
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        out[j * GRID + i] = sample(src, ox + (i / (GRID - 1)) * span, oy + (j / (GRID - 1)) * span);
      }
    }
  } catch {
    out.fill(FALLBACK_HEIGHT);
  }
  return out;
}

export function createTerrariumTerrain(): CustomHeightmapTerrainProvider {
  return new CustomHeightmapTerrainProvider({
    callback: (x, y, level) => heightsFor(x, y, level),
    width: GRID,
    height: GRID,
    tilingScheme: new WebMercatorTilingScheme(),
    credit: new Credit('Terrain: Terrarium DEM (SRTM-derived, Mapzen / AWS Open Data)', false),
  });
}
