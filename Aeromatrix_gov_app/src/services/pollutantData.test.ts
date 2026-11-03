import { describe, expect, it, vi } from 'vitest';
import examples from './__fixtures__/trained_model_RESPONSE_EXAMPLES.json';
import airFixture from './__fixtures__/openmeteo-air-quality.json';
import type { ApiMeasured } from './aeromatrixApi';
import { fetchAirQuality, clearOpenMeteoCache } from './openMeteo';
import { fmtIst, fmtIstTime, isOutdated, resolveCurrent } from './pollutantData';

const measured = (examples as unknown as Record<string, ApiMeasured>).measured_Hadapsar;
const air = airFixture as unknown as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const NOW = air[0].current.time * 1000;

async function livePoint() {
  clearOpenMeteoCache();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => air }) as Response));
  const [p] = await fetchAirQuality([[73.9, 18.5], [73.85, 18.55], [73.8, 18.6]], { now: () => NOW });
  vi.unstubAllGlobals();
  return p;
}

describe('resolveCurrent', () => {
  it('keeps the station reading and the live model value separate, each with its own status', async () => {
    const live = await livePoint();
    const recs = resolveCurrent({ measured, live }, NOW);
    const pm = recs.find((r) => r.pollutant === 'pm25')!;
    expect(pm.station?.status).toBe('OBSERVED');
    expect(pm.station?.value).toBe(99.955);
    expect(pm.live?.status).toBe('MODEL_DATA');
    expect(pm.live?.value).toBe(air[0].current.pm2_5);
    expect(pm.station!.value).not.toBe(pm.live!.value); // never blended
    expect(recs).toHaveLength(6);
  });

  it('labels bundled readings Outdated with their own time', async () => {
    const recs = resolveCurrent({ measured }, NOW);
    for (const r of recs.filter((x) => x.station)) {
      expect(r.station!.outdated).toBe(true);
      expect(r.station!.time).toMatch(/^2026-01-01/);
    }
    // The same station's different pollutants can have different timestamps.
    expect(new Set(recs.map((r) => r.station?.time)).size).toBeGreaterThanOrEqual(1);
  });

  it('says "No data feed" for a station with no snapshot, and "not loaded" for missing live data', () => {
    const recs = resolveCurrent({});
    for (const r of recs) {
      expect(r.station).toBeNull();
      expect(r.stationReason).toBe('No data feed');
      expect(r.live).toBeNull();
      expect(r.liveReason).toBe('Live model data not loaded');
    }
  });

  it('carries the service reason for an UNAVAILABLE pollutant and never fills it from the live value', async () => {
    const live = await livePoint();
    const m: ApiMeasured = JSON.parse(JSON.stringify(measured));
    m.pollutants.so2 = { status: 'UNAVAILABLE', reason: 'Station does not measure SO2' } as never;
    const so2 = resolveCurrent({ measured: m, live }, NOW).find((r) => r.pollutant === 'so2')!;
    expect(so2.station).toBeNull();
    expect(so2.stationReason).toBe('Station does not measure SO2');
    expect(so2.live).not.toBeNull(); // the live value stays its own, labelled MODEL_DATA
  });

  it('explains a missing live value', async () => {
    const live = await livePoint();
    live.hourly.o3 = live.hourly.o3.map(() => null);
    live.missing.o3 = 'The CAMS model has no ozone values for this point and period';
    const o3 = resolveCurrent({ live }, NOW).find((r) => r.pollutant === 'o3')!;
    expect(o3.live).toBeNull();
    expect(o3.liveReason).toMatch(/no ozone values/);
  });
});

describe('time helpers', () => {
  it('decides Outdated from the historical flag or age', () => {
    expect(isOutdated('2026-01-01T04:00:00+05:30', true, Date.parse('2026-01-01T05:00:00+05:30'))).toBe(true);
    expect(isOutdated('2026-01-01T04:00:00+05:30', false, Date.parse('2026-01-01T05:00:00+05:30'))).toBe(false);
    expect(isOutdated('2026-01-01T04:00:00+05:30', false, Date.parse('2026-01-01T09:00:00+05:30'))).toBe(true);
    expect(isOutdated('not a date', false, NOW)).toBe(true);
  });

  it('formats times in IST', () => {
    expect(fmtIst('2026-01-02T05:00:00+05:30')).toBe('02 Jan 2026, 05:00 IST');
    expect(fmtIst(Date.parse('2026-01-02T00:30:00Z'))).toBe('02 Jan 2026, 06:00 IST');
    expect(fmtIstTime('2026-01-02T05:00:00+05:30')).toBe('05:00 IST');
    expect(fmtIst('garbage')).toBe('unknown time');
  });
});
