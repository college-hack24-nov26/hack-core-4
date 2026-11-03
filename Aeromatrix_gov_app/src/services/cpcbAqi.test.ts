import { describe, expect, it } from 'vitest';
import parity from './__fixtures__/aqi-parity-backend.json';
import { AQI_POLLUTANTS, aqiCategory, aqiLabel, calculateAqi, subindexFor, type AqiPollutant, type HourlySeries } from './cpcbAqi';

interface ParityCase {
  end: string;
  series: Record<string, Array<number | null>>;
  status: string;
  value: number | null;
  dominant: string | null;
  sub: Record<string, number>;
}

describe('CPCB AQI: parity with the Python backend', () => {
  const cases = parity as unknown as ParityCase[];

  it('has the recorded cases', () => {
    expect(cases.length).toBe(40);
  });

  cases.forEach((c, i) => {
    it(`case ${i}: ${c.status} ${c.value ?? '-'}`, () => {
      const r = calculateAqi(c.series as HourlySeries, c.end);
      expect(r.status).toBe(c.status);
      expect(r.value).toBe(c.value);
      expect(r.dominant_pollutant).toBe(c.dominant);
      const got: Record<string, number> = {};
      for (const p of AQI_POLLUTANTS) if (r.subindices[p]) got[p] = r.subindices[p]!.value;
      expect(got).toEqual(c.sub);
    });
  });
});

const flat = (v: number, n = 24): number[] => Array.from({ length: n }, () => v);

describe('CPCB AQI rules', () => {
  it('maps values to categories', () => {
    expect([0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401, 500].map(aqiCategory)).toEqual([
      'Good', 'Good', 'Satisfactory', 'Satisfactory', 'Moderate', 'Moderate', 'Poor', 'Poor', 'Very Poor', 'Very Poor', 'Severe', 'Severe',
    ]);
  });

  it('computes sub-indices at the band edges', () => {
    expect(subindexFor('pm25', 30)).toMatchObject({ value: 50, bounded: false });
    expect(subindexFor('pm25', 60)).toMatchObject({ value: 100 });
    expect(subindexFor('pm10', 250)).toMatchObject({ value: 200 });
    expect(subindexFor('co', 2.04)).toMatchObject({ value: 100, concentration: 2 }); // rounded to table precision
    expect(subindexFor('so2', 800)).toMatchObject({ value: 300 });
  });

  it('gives a lower bound for open-ended severe concentrations', () => {
    expect(subindexFor('pm25', 400)).toMatchObject({ kind: 'ok', value: 401, bounded: true });
    const r = calculateAqi({ pm25: flat(400), pm10: flat(100), no2: flat(30) }, '2026-01-01T00:00:00Z');
    expect(r.status).toBe('LOWER_BOUND');
    expect(r.value).toBe(401);
    expect(r.category).toBe('Severe');
    expect(aqiLabel(r)).toBe('>= 401 (Severe)');
  });

  it('withholds the AQI when ozone is above 208 ug/m3', () => {
    const r = calculateAqi({ pm25: flat(50), pm10: flat(90), no2: flat(30), o3: flat(300) }, '2026-01-01T00:00:00Z');
    expect(r.status).toBe('UNAVAILABLE');
    expect(r.value).toBeNull();
    expect(r.reason).toMatch(/Ozone/);
  });

  it('needs three pollutants including PM2.5 or PM10', () => {
    expect(calculateAqi({ pm25: flat(50), pm10: flat(90) }, '2026-01-01T00:00:00Z').status).toBe('UNAVAILABLE');
    const noPm = calculateAqi({ no2: flat(30), so2: flat(20), co: flat(1) } as HourlySeries, '2026-01-01T00:00:00Z');
    expect(noPm.status).toBe('UNAVAILABLE');
    expect(noPm.reason).toMatch(/PM2\.5 nor PM10/);
  });

  it('needs 16 valid hours and a complete trailing 8 h for CO and O3', () => {
    const gaps = [...flat(50, 8), ...Array.from({ length: 16 }, () => null)];
    const r = calculateAqi({ pm25: gaps, pm10: flat(90), no2: flat(30), so2: flat(20) }, '2026-01-01T00:00:00Z');
    expect(r.excluded.pm25).toBe('Fewer than 16 valid hourly observations in 24h');
    const co = [...flat(1.2, 7), null, ...flat(1.2, 16)];
    const r2 = calculateAqi({ pm25: flat(50), pm10: flat(90), no2: flat(30), co }, '2026-01-01T00:00:00Z');
    expect(r2.excluded.co).toBe('Incomplete trailing 8h average');
    expect(r2.subindices.co).toBeUndefined();
    expect(r2.coverage_hours.co).toBe(23);
  });

  it('uses the most recent 8 hours (index 0 is the newest) for CO and O3', () => {
    const o3 = [...flat(10, 8), ...flat(200, 16)];
    const r = calculateAqi({ pm25: flat(50), pm10: flat(90), no2: flat(30), o3 }, '2026-01-01T00:00:00Z');
    expect(r.subindices.o3?.concentration).toBe(10);
  });

  it('records the method text and period end', () => {
    const r = calculateAqi({ pm25: flat(50), pm10: flat(90), no2: flat(30) }, '2026-01-01T00:00:00Z', 'estimated');
    expect(r.method).toBe('estimated');
    expect(r.period_end).toBe('2026-01-01T00:00:00.000Z');
    expect(AQI_POLLUTANTS as AqiPollutant[]).toHaveLength(6);
  });
});
