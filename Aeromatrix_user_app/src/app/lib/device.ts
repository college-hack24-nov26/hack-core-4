import { ServiceError, serviceFetch } from './service';
import type { DeviceReading } from '../userStore';

/** Device ids are printed on the unit, for example AMX-7K2P-91QD. Letters, digits and dashes, 6 to 24 characters. */
export function normaliseDeviceId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
export const isValidDeviceId = (id: string): boolean => /^[A-Z0-9][A-Z0-9-]{5,23}$/.test(id);

export type RegisterResult = { ok: true } | { ok: false; reason: string; unreachable: boolean };

/** Tells the service this user owns the device, so the device's readings can be synced to this app. */
export async function registerDevice(deviceId: string, label: string): Promise<RegisterResult> {
  try {
    const res = await serviceFetch('/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: deviceId, label }) }, 10000);
    if (!res.ok) {
      const detail = await res
        .json()
        .then((j: { detail?: string }) => j.detail)
        .catch(() => undefined);
      return { ok: false, reason: typeof detail === 'string' ? detail : `The service refused the device (${res.status}).`, unreachable: false };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof ServiceError ? e.message : 'The device could not be added.', unreachable: true };
  }
}

export type SyncResult = { ok: true; reading: DeviceReading | null } | { ok: false; reason: string };

interface ApiReading {
  at: string;
  pm25?: number | null;
  pm10?: number | null;
  temperature?: number | null;
  humidity?: number | null;
}

/** The newest reading the device has sent. `reading: null` means the device is known but has not reported yet. */
export async function syncDevice(deviceId: string): Promise<SyncResult> {
  try {
    const res = await serviceFetch(`/devices/${encodeURIComponent(deviceId)}/latest`, {}, 10000);
    if (res.status === 404) return { ok: false, reason: 'This device is not registered yet.' };
    if (!res.ok) return { ok: false, reason: `The service answered with an error (${res.status}).` };
    const d = (await res.json()) as { reading: ApiReading | null };
    if (!d.reading) return { ok: true, reading: null };
    return {
      ok: true,
      reading: { at: Date.parse(d.reading.at), pm25: d.reading.pm25 ?? null, pm10: d.reading.pm10 ?? null, temperature: d.reading.temperature ?? null, humidity: d.reading.humidity ?? null },
    };
  } catch (e) {
    return { ok: false, reason: e instanceof ServiceError ? e.message : 'The device could not be synced.' };
  }
}

export type DeviceStatus = 'not_connected' | 'waiting_service' | 'waiting_device' | 'live' | 'stale';

/** What to tell the user about their device: a reading newer than 30 minutes counts as live. */
export function deviceStatus(d: { state: 'saved' | 'connected'; reading: DeviceReading | null } | null, now = Date.now()): DeviceStatus {
  if (!d) return 'not_connected';
  if (d.state === 'saved') return 'waiting_service';
  if (!d.reading) return 'waiting_device';
  return now - d.reading.at <= 30 * 60_000 ? 'live' : 'stale';
}
