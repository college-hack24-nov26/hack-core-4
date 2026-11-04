import { describe, expect, it } from 'vitest';
import { MAX_FILES, MAX_FILE_BYTES, MIN_TEXT, formatBytes, isAllowedFile, validateComplaint } from './lib/complaints';
import { deviceStatus, isValidDeviceId, normaliseDeviceId } from './lib/device';
import { PRODUCTS, formatRupees } from './lib/shop';
import { USER_VIEWS } from './userStore';
import { VIEW_LABEL } from './BottomNav';

const file = (name: string, size = 1000, type = '') => ({ name, size, type });

describe('complaint form', () => {
  it('needs a description of enough length', () => {
    expect(validateComplaint('too short', [])).toMatch(String(MIN_TEXT));
    expect(validateComplaint('The display has been blank for a week.', [])).toBeNull();
    expect(validateComplaint('x'.repeat(2001), [])).toMatch(/under/);
  });

  it('accepts PDFs, photographs and documents, and nothing else', () => {
    expect(isAllowedFile(file('report.pdf'))).toBe(true);
    expect(isAllowedFile(file('photo.JPG'))).toBe(true);
    expect(isAllowedFile(file('IMG', 1, 'image/heic'))).toBe(true);
    expect(isAllowedFile(file('notes.docx'))).toBe(true);
    expect(isAllowedFile(file('run.exe'))).toBe(false);
    expect(isAllowedFile(file('script.js'))).toBe(false);
  });

  it('limits how many and how big the files are', () => {
    const text = 'The station is next to a burning waste heap.';
    expect(validateComplaint(text, Array.from({ length: MAX_FILES + 1 }, (_, i) => file(`${i}.pdf`)))).toMatch(/up to/);
    expect(validateComplaint(text, [file('big.pdf', MAX_FILE_BYTES + 1)])).toMatch(/larger/);
    expect(validateComplaint(text, [file('bad.exe')])).toMatch(/not a supported/);
    expect(validateComplaint(text, [file('ok.pdf', MAX_FILE_BYTES)])).toBeNull();
  });

  it('writes sizes for people', () => {
    expect(formatBytes(500)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('device', () => {
  it('tidies and checks the id printed on the unit', () => {
    expect(normaliseDeviceId('  amx-7k2p 91qd ')).toBe('AMX-7K2P91QD');
    expect(isValidDeviceId('AMX-7K2P-91QD')).toBe(true);
    expect(isValidDeviceId('AB')).toBe(false);
    expect(isValidDeviceId('has space')).toBe(false);
    expect(isValidDeviceId('-LEADING-DASH')).toBe(false);
  });

  it('describes the connection honestly', () => {
    const now = Date.parse('2026-11-04T10:00:00Z');
    const reading = (minsAgo: number) => ({ at: now - minsAgo * 60_000, pm25: 30, pm10: 50, temperature: 28, humidity: 50 });
    expect(deviceStatus(null, now)).toBe('not_connected');
    expect(deviceStatus({ state: 'saved', reading: null }, now)).toBe('waiting_service');
    expect(deviceStatus({ state: 'connected', reading: null }, now)).toBe('waiting_device');
    expect(deviceStatus({ state: 'connected', reading: reading(5) }, now)).toBe('live');
    expect(deviceStatus({ state: 'connected', reading: reading(45) }, now)).toBe('stale');
  });
});

describe('shop', () => {
  it('sells the AQI Monitoring Prototype at Rs 2,000 and lists the rest as coming soon', () => {
    const proto = PRODUCTS.find((p) => p.id === 'aqi-prototype')!;
    expect(proto.price).toBe(2000);
    expect(proto.status).toBe('available');
    expect(formatRupees(2000)).toBe('₹2,000');
    const soon = PRODUCTS.filter((p) => p.status === 'soon');
    expect(soon.length).toBeGreaterThanOrEqual(2);
    expect(soon.every((p) => p.price === null)).toBe(true);
  });
});

describe('what the user app contains', () => {
  it('has no Reports, Simulator (What if), Alerts or Hotspots pages: those belong to the authorities app', () => {
    expect([...USER_VIEWS].sort()).toEqual(['home', 'map', 'settings', 'shop', 'stations']);
    expect(Object.values(VIEW_LABEL)).not.toContain('Reports');
    expect(Object.values(VIEW_LABEL)).not.toContain('What if');
    expect(Object.values(VIEW_LABEL)).toContain('Shop');
    expect(Object.values(VIEW_LABEL)).toContain('Stations');
  });
});
