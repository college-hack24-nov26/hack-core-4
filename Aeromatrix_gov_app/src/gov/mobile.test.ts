import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GOV_VIEWS } from './govStore';
import { isIosSafari, isStandalone, isTouchPhone } from './lib/pwa';
import { canShareFile, canShareText, shareFile, shareText } from './lib/share';

const root = resolve(__dirname, '../..');
const pub = (p: string) => resolve(root, 'public', p.replace(/^\//, ''));

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  shortcuts: Array<{ name: string; url: string; icons?: Array<{ src: string }> }>;
}
const manifest = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8')) as Manifest;

/** Width and height from a PNG's IHDR chunk, plus the colour type. */
function pngInfo(file: string) {
  const b = readFileSync(file);
  expect(b.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(b.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25], bytes: b.length };
}

describe('installable app files', () => {
  it('has a manifest with the required install fields', () => {
    expect(manifest).toMatchObject({ name: 'AeroMatrix Commissioner', short_name: 'AeroMatrix', display: 'standalone', orientation: 'portrait-primary', start_url: '/', scope: '/', background_color: '#fbf6ec', theme_color: '#a3263f' });
    expect(manifest.id).toBe('/');
  });

  it('points every icon at a real PNG of the declared size, with a maskable one', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(pub(icon.src))).toBe(true);
      const { w, h } = pngInfo(pub(icon.src));
      expect(`${w}x${h}`).toBe(icon.sizes);
      expect(icon.type).toBe('image/png');
    }
    const sizes = manifest.icons.map((i) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  });

  it('has an opaque 180 px iOS home-screen icon and an opaque maskable icon', () => {
    const apple = pngInfo(pub('pwa/apple-touch-icon.png'));
    expect([apple.w, apple.h]).toEqual([180, 180]);
    // The corners must be fully opaque: read the first pixel's alpha after inflating is overkill, so compare sizes instead.
    expect(apple.bytes).toBeGreaterThan(500);
    expect(pngInfo(pub('pwa/icon-maskable-512.png')).colorType).toBe(6);
  });

  it('keeps the root-level drop-in icon names free (the generated icons live in public/pwa)', () => {
    for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) expect(existsSync(pub(name))).toBe(false);
    expect(manifest.icons.every((i) => i.src.startsWith('/pwa/'))).toBe(true);
  });

  it('has shortcuts that open real screens', () => {
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(3);
    for (const s of manifest.shortcuts) {
      const view = s.url.replace(/^\/#/, '');
      expect((GOV_VIEWS as string[]).includes(view)).toBe(true);
      for (const i of s.icons ?? []) expect(existsSync(pub(i.src))).toBe(true);
    }
  });

  it('links the manifest, icons, viewport and a splash in index.html', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/pwa/apple-touch-icon.png"');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('name="theme-color"');
    expect(html).toContain('apple-mobile-web-app-capable');
    expect(html).toContain('id="boot"');
  });

  it('precaches only files that exist', () => {
    const sw = readFileSync(pub('sw.js'), 'utf8');
    const list = /const SHELL = \[([^\]]+)\]/.exec(sw)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
    expect(list.length).toBeGreaterThan(3);
    for (const p of list) if (p !== '/') expect(existsSync(pub(p))).toBe(true);
  });
});

describe('install helpers', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36';
  const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

  it('recognises iPhone and iPad Safari, but not Chrome on iOS, Android or a Mac', () => {
    expect(isIosSafari(IPHONE)).toBe(true);
    expect(isIosSafari(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIosSafari(IPAD_AS_MAC, 0)).toBe(false);
    expect(isIosSafari(IPHONE_CHROME)).toBe(false);
    expect(isIosSafari(ANDROID)).toBe(false);
  });

  it('knows when it runs from the home screen', () => {
    expect(isStandalone({ navigator: { standalone: true } })).toBe(true);
    expect(isStandalone({ matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }) })).toBe(true);
    expect(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: false } })).toBe(false);
    expect(isStandalone({})).toBe(false);
  });

  it('calls a coarse-pointer screen under 820 px a phone', () => {
    expect(isTouchPhone({ widthPx: 390, coarsePointer: true })).toBe(true);
    expect(isTouchPhone({ widthPx: 1024, coarsePointer: true })).toBe(false);
    expect(isTouchPhone({ widthPx: 390, coarsePointer: false })).toBe(false);
  });
});

describe('share sheet', () => {
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });

  it('reports unsupported without calling anything when the device has no share sheet', async () => {
    expect(canShareText({})).toBe(false);
    expect(canShareFile(file, {})).toBe(false);
    expect(await shareText('t', 'x', {})).toBe('unsupported');
    expect(await shareFile(file, 't', {})).toBe('unsupported');
  });

  it('shares text and files, and treats a cancel as a cancel', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const n = { share, canShare: () => true };
    expect(await shareText('Subject', 'Body', n)).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Subject', text: 'Body' });
    expect(await shareFile(file, 'Report', n)).toBe('shared');
    expect(share).toHaveBeenLastCalledWith({ title: 'Report', files: [file] });
    const cancel = { share: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })), canShare: () => true };
    expect(await shareText('s', 'b', cancel)).toBe('cancelled');
    const broken = { share: vi.fn().mockRejectedValue(new Error('boom')), canShare: () => true };
    expect(await shareText('s', 'b', broken)).toBe('failed');
  });

  it('will not share a file the device refuses', async () => {
    expect(await shareFile(file, 'r', { share: vi.fn(), canShare: () => false })).toBe('unsupported');
  });
});
