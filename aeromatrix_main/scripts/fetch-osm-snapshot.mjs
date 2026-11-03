// Refreshes public/data/pune-osm-snapshot.json from the Overpass API (with mirror fallback).
// Usage: node scripts/fetch-osm-snapshot.mjs
// Data: (c) OpenStreetMap contributors, ODbL 1.0. Only geometry is real; traffic and emissions stay DEMO.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/data/pune-osm-snapshot.json');

// Analysis bbox (same as the demo city): west, south, east, north
const BBOX = { west: 73.74, south: 18.44, east: 73.98, north: 18.64 };
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const MIN_GREEN_KM2 = 0.006;
const MIN_INDUSTRIAL_KM2 = 0.02;
const MIN_ROAD_KM = 0.8;

const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const query = `[out:json][timeout:180];
(
  way["highway"~"^(motorway|trunk|primary|secondary)$"](${b});
  way["leisure"~"^(park|garden|nature_reserve|recreation_ground)$"](${b});
  way["landuse"~"^(forest|grass|recreation_ground|village_green|meadow|orchard)$"](${b});
  way["natural"~"^(wood|scrub|grassland)$"](${b});
  way["landuse"="industrial"](${b});
);
out geom tags;`;

async function fetchOverpass() {
  let lastError = 'no mirror tried';
  for (const url of MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[osm] ${url} (attempt ${attempt})`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'aeromatrix-snapshot/0.2' },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(200000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.elements || json.elements.length === 0) throw new Error('empty response');
        return { json, mirror: url };
      } catch (e) {
        lastError = `${url}: ${e instanceof Error ? e.message : e}`;
        console.warn('[osm] failed:', lastError);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  throw new Error(`All Overpass mirrors failed. Last error: ${lastError}`);
}

const r5 = (v) => Math.round(v * 1e5) / 1e5;
const toCoords = (geometry) => geometry.map((p) => [r5(p.lon), r5(p.lat)]);

function areaKm2(coords) {
  const lat0 = (coords[0][1] * Math.PI) / 180;
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let s = 0;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    s += (coords[j][0] * kx) * (coords[i][1] * ky) - (coords[i][0] * kx) * (coords[j][1] * ky);
  }
  return Math.abs(s) / 2;
}

function lengthKm(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    const lat = (((coords[i][1] + coords[i - 1][1]) / 2) * Math.PI) / 180;
    const dx = (coords[i][0] - coords[i - 1][0]) * 111.32 * Math.cos(lat);
    const dy = (coords[i][1] - coords[i - 1][1]) * 110.57;
    d += Math.hypot(dx, dy);
  }
  return d;
}

const closed = (c) => c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1];

function simplify(json) {
  const elements = [];
  for (const el of json.elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const t = el.tags ?? {};
    const coords = toCoords(el.geometry);
    const tags = {};
    for (const k of ['name', 'ref', 'highway', 'leisure', 'landuse', 'natural']) if (t[k]) tags[k] = t[k];
    if (t.highway) {
      elements.push({ id: el.id, kind: 'road', tags, coords });
    } else if (t.landuse === 'industrial') {
      if (closed(coords) && areaKm2(coords) >= MIN_INDUSTRIAL_KM2) elements.push({ id: el.id, kind: 'industrial', tags, coords });
    } else if (closed(coords) && areaKm2(coords) >= MIN_GREEN_KM2) {
      elements.push({ id: el.id, kind: 'green', tags, coords });
    }
  }
  return elements;
}

const { json, mirror } = await fetchOverpass();
const elements = simplify(json);

// Drop very short road fragments so the snapshot keeps the main network (grouping by name happens in the app).
const roadsByKey = new Map();
for (const el of elements) {
  if (el.kind !== 'road') continue;
  const key = `${el.tags.name ?? el.tags.ref ?? el.id}|${el.tags.highway}`;
  roadsByKey.set(key, (roadsByKey.get(key) ?? 0) + lengthKm(el.coords));
}
const kept = elements.filter((el) => {
  if (el.kind !== 'road') return true;
  const key = `${el.tags.name ?? el.tags.ref ?? el.id}|${el.tags.highway}`;
  return roadsByKey.get(key) >= MIN_ROAD_KM;
});

const snapshot = {
  meta: {
    source: 'OpenStreetMap via Overpass API',
    mirror,
    generated: new Date().toISOString(),
    bbox: BBOX,
    license: 'ODbL 1.0',
    attribution: 'OSM data (c) OpenStreetMap contributors, ODbL 1.0',
    note: 'Geometry only. Traffic volumes and emission intensities are DEMO assumptions applied in the app.',
  },
  elements: kept,
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot));
const count = (k) => kept.filter((e) => e.kind === k).length;
console.log(`[osm] wrote ${out}`);
console.log(`[osm] ways kept: roads ${count('road')}, green ${count('green')}, industrial ${count('industrial')}`);
