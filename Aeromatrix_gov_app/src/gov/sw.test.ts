import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Loads public/sw.js against fakes and records which requests it decides to handle. */
function loadWorker() {
  const code = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf8');
  const handlers: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, Map<string, unknown>>();
  const fetched: string[] = [];
  const cacheApi = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name)!;
      return {
        addAll: async (urls: string[]) => urls.forEach((u) => m.set(u, 'x')),
        put: async (k: unknown, v: unknown) => void m.set(typeof k === 'string' ? k : (k as { url: string }).url, v),
        match: async (k: unknown) => m.get(typeof k === 'string' ? k : (k as { url: string }).url),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
  };
  const self = {
    location: { origin: 'https://app.example' },
    addEventListener: (type: string, fn: (e: unknown) => void) => void (handlers[type] = fn),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  const fetchFn = async (req: { url: string }) => {
    fetched.push(req.url);
    return { ok: true, clone: () => ({}) };
  };
  new Function('self', 'caches', 'fetch', 'URL', code)(self, cacheApi, fetchFn, URL);
  const handles = (url: string, init: { method?: string; mode?: string } = {}) => {
    let handled = false;
    handlers.fetch({ request: { method: init.method ?? 'GET', url, mode: init.mode ?? 'cors' }, respondWith: () => (handled = true) });
    return handled;
  };
  return { handles, store, handlers, fetched };
}

describe('service worker', () => {
  it('handles only the app shell and static data of its own origin', () => {
    const w = loadWorker();
    expect(w.handles('https://app.example/', { mode: 'navigate' })).toBe(true);
    expect(w.handles('https://app.example/assets/index-abc.js')).toBe(true);
    expect(w.handles('https://app.example/aeromatrix-mark.svg')).toBe(true);
    expect(w.handles('https://app.example/data/pune-osm-snapshot.json')).toBe(true);
    expect(w.handles('https://app.example/data/station_coordinates_verified.json')).toBe(true);
  });

  it('never touches live data: model API, Open-Meteo, map tiles, the assistant or the sensor proxy', () => {
    const w = loadWorker();
    expect(w.handles('http://127.0.0.1:8000/pollution?region=Hadapsar')).toBe(false);
    expect(w.handles('http://127.0.0.1:8010/chat')).toBe(false);
    expect(w.handles('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=18.5')).toBe(false);
    expect(w.handles('https://tile.openstreetmap.org/11/1/1.png')).toBe(false);
    expect(w.handles('https://app.example/task2/health')).toBe(false);
    expect(w.handles('https://app.example/cesium/Workers/x.js')).toBe(false);
    expect(w.handles('https://app.example/assets/x.js', { method: 'POST' })).toBe(false);
  });

  it('precaches the shell on install and drops its own old caches on activate', async () => {
    const w = loadWorker();
    let installed: Promise<unknown> | undefined;
    w.handlers.install({ waitUntil: (p: Promise<unknown>) => (installed = p) });
    await installed;
    const names = [...w.store.keys()];
    expect(names).toEqual(['aeromatrix-gov-shell-v3']);
    expect([...w.store.get(names[0])!.keys()]).toEqual(['/', '/manifest.webmanifest', '/aeromatrix-mark.svg', '/pwa/icon-192.png', '/pwa/icon-512.png', '/pwa/apple-touch-icon.png']);
    w.store.set('aeromatrix-gov-shell-v1', new Map());
    w.store.set('somebody-elses-cache', new Map());
    let activated: Promise<unknown> | undefined;
    w.handlers.activate({ waitUntil: (p: Promise<unknown>) => (activated = p) });
    await activated;
    expect([...w.store.keys()].sort()).toEqual(['aeromatrix-gov-shell-v3', 'somebody-elses-cache']);
  });
});
