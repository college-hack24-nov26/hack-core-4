// Draws the AeroMatrix mark into the PWA icon PNGs (no image libraries: a small rasteriser and PNG encoder).
// Run: node scripts/make-icons.mjs   Output: public/pwa/*.png (committed, so a normal build needs no step).
// The icons live in public/pwa/ on purpose: the root-level icon-192.png / icon-512.png names are reserved for icons
// that may be supplied separately, and these files never collide with them.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/pwa');
mkdirSync(out, { recursive: true });

const ACCENT = [163, 38, 63];
const CREAM = [251, 245, 233];

// ---- the mark, in a 64-unit box centred on (32, 32) ----
function bezier(p0, p1, p2, p3, n = 120) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return pts;
}
// M14 36 c6-12 12-12 18 0 s12 12 18 0
const WAVE = [...bezier([14, 36], [20, 24], [26, 24], [32, 36]), ...bezier([32, 36], [38, 48], [44, 48], [50, 36])];

function distToPolyline(x, y, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/** Cream coverage (0..1) of the mark's details at a point of the 64-unit box. */
function markAlpha(x, y) {
  let a = 0;
  const r = Math.hypot(x - 32, y - 32);
  if (Math.abs(r - 22) <= 1.25) a = Math.max(a, 0.55); // inner ring, 55% opacity like the logo
  // wave, stroke width 4, round caps (the bounding-box test skips the costly distance for most pixels)
  if (x > 11 && x < 53 && y > 21 && y < 51 && distToPolyline(x, y, WAVE) <= 2) a = 1;
  if (Math.hypot(x - 32, y - 22) <= 3.2) a = 1; // dot
  return a;
}

/**
 * kind: 'any' (rounded square, transparent corners), 'maskable' (full bleed, content inside the 80% safe circle) or
 * 'opaque' (full bleed square, for the iOS home-screen icon).
 */
function render(size, kind) {
  // share of the icon the 60-unit mark occupies (the adaptive-icon foreground keeps to the central safe zone)
  const content = kind === 'foreground' ? 0.5 : kind === 'maskable' ? 0.56 : 0.68;
  const scale = (size * content) / 60;
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3;
  const radius = size * 0.22;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let aa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = px + (sx + 0.5) / SS;
          const fy = py + (sy + 0.5) / SS;
          let inside = 1;
          if (kind === 'any') {
            const cx = Math.min(Math.max(fx, radius), size - radius);
            const cy = Math.min(Math.max(fy, radius), size - radius);
            inside = Math.hypot(fx - cx, fy - cy) <= radius ? 1 : 0;
          }
          if (kind === 'round') inside = Math.hypot(fx - size / 2, fy - size / 2) <= size / 2 ? 1 : 0;
          if (!inside) continue;
          const m = markAlpha((fx - size / 2) / scale + 32, (fy - size / 2) / scale + 32);
          if (kind === 'foreground') {
            // transparent background: only the cream mark, with its coverage as alpha
            rr += CREAM[0] * m;
            gg += CREAM[1] * m;
            bb += CREAM[2] * m;
            aa += m;
            continue;
          }
          rr += ACCENT[0] * (1 - m) + CREAM[0] * m;
          gg += ACCENT[1] * (1 - m) + CREAM[1] * m;
          bb += ACCENT[2] * (1 - m) + CREAM[2] * m;
          aa += 1;
        }
      }
      const i = (py * size + px) * 4;
      if (aa > 0) {
        rgba[i] = Math.round(rr / aa);
        rgba[i + 1] = Math.round(gg / aa);
        rgba[i + 2] = Math.round(bb / aa);
        rgba[i + 3] = Math.round((aa / (SS * SS)) * 255);
      }
    }
  }
  return rgba;
}

// ---- PNG encoder ----
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const FILES = [
  ['icon-192.png', 192, 'any'],
  ['icon-512.png', 512, 'any'],
  ['icon-maskable-512.png', 512, 'maskable'],
  ['apple-touch-icon.png', 180, 'opaque'],
];
for (const [name, size, kind] of FILES) {
  writeFileSync(resolve(out, name), png(size, render(size, kind)));
  console.log(`wrote public/pwa/${name} (${size}x${size}, ${kind})`);
}

// ---- Android launcher icons (written only when the android/ project exists) ----
import { existsSync } from 'node:fs';
const res = resolve(dirname(fileURLToPath(import.meta.url)), '../android/app/src/main/res');
if (existsSync(res)) {
  const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(DENSITY)) {
    const dir = resolve(res, `mipmap-${d}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'ic_launcher.png'), png(Math.round(48 * k), render(Math.round(48 * k), 'any')));
    writeFileSync(resolve(dir, 'ic_launcher_round.png'), png(Math.round(48 * k), render(Math.round(48 * k), 'round')));
    writeFileSync(resolve(dir, 'ic_launcher_foreground.png'), png(Math.round(108 * k), render(Math.round(108 * k), 'foreground')));
  }
  console.log('wrote Android launcher icons');
}