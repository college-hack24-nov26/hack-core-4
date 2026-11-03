import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'node_modules/cesium/Build/Cesium');
const dest = resolve(root, 'public/cesium');

if (!existsSync(src)) {
  console.error('[copy-cesium] cesium is not installed yet. Run `npm install` first.');
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  cpSync(resolve(src, dir), resolve(dest, dir), { recursive: true });
}
console.log('[copy-cesium] copied Cesium static assets to public/cesium');
