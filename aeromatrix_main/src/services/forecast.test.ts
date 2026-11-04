import { describe, expect, it } from 'vitest';
import airFixture from './__fixtures__/openmeteo-air-quality.json';
import { aqiTrend, dailyForecast, forecastDates, istDate } from './forecast';
import { CO_UG_TO_MG, OM_POLLUTANTS, type HourlyValues } from './openMeteo';

const air = airFixture as unknown as Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

function synthetic(startIstDate: string, days: number, values: Partial<Record<string, number | null>> = {}): { times: number[]; hourly: HourlyValues } {
  // Midnight IST of the start date, in unix seconds.
  const start = Date.parse(`${startIstDate}T00:00:00+05:30`) / 1000;
  const times = Array.from({ length: days * 24 }, (_, i) => start + i * 3600);
  const hourly = {} as HourlyValues;
  const defaults: Record<string, number> = { pm25: 60, pm10: 80, no2: 40, so2: 20, co: 1.2, o3: 40 };
  for (const p of OM_POLLUTANTS) hourly[p] = times.map(() => (values[p] === undefined ? defaults[p] : values[p]) as number | null);
  return { times, hourly };
}

describe('IST dates', () => {
  it('converts unix seconds to the IST calendar date', () => {
    expect(istDate(Date.UTC(2026, 0, 1, 19, 0) / 1000)).toBe('2026-01-02'); // 00:30 IST next day
    expect(istDate(Date.UTC(2026, 0, 1, 18, 29) / 1000)).toBe('2026-01-01');
    expect(forecastDates([Date.UTC(2026, 0, 1, 10) / 1000, Date.UTC(2026, 0, 1, 20) / 1000])).toEqual(['2026-01-01', '2026-01-02']);
  });
});

describe('dailyForecast', () => {
  it('gives one estimated AQI per IST day from full days of model hours', () => {
    const days = dailyForecast(synthetic('2026-03-01', 3));
    expect(days.map((d) => d.date)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
    for (const d of days) {
      expect(d.hoursCovered).toBe(24);
      expect(d.aqi.status).toBe('AVAILABLE');
      expect(d.aqi.dominant_pollutant).toBe('pm25');
      expect(d.aqi.method).toMatch(/ESTIMATED from CAMS model data/);
      expect(d.pm25Mean).toBeCloseTo(60, 6);
    }
    // PM2.5 60 ug/m3 is in the US 'Unhealthy' band (AQI 154)
    expect(days[0].aqi.value).toBe(154);
    expect(days[0].aqi.category).toBe('Poor');
  });

  it('marks a partly covered day UNAVAILABLE rather than guessing', () => {
    const p = synthetic('2026-03-01', 2);
    const short = { times: p.times.slice(0, 24 + 10), hourly: Object.fromEntries(OM_POLLUTANTS.map((q) => [q, p.hourly[q].slice(0, 34)])) as HourlyValues };
    const days = dailyForecast(short);
    expect(days[0].aqi.status).toBe('AVAILABLE');
    expect(days[1].hoursCovered).toBe(10);
    expect(days[1].aqi.status).toBe('UNAVAILABLE');
    expect(days[1].aqi.excluded.pm25).toMatch(/Fewer than 16/);
  });

  it('uses the last 8 hours of the day for CO and O3 (a gap there excludes them)', () => {
    const p = synthetic('2026-03-01', 1);
    p.hourly.o3[22] = null;
    const [d] = dailyForecast(p);
    expect(d.aqi.excluded.o3).toBe('Incomplete trailing 8h average');
    expect(d.aqi.status).toBe('AVAILABLE');
  });

  it('works on the recorded Open-Meteo hours', () => {
    const times = air[0].hourly.time as number[];
    const hourly = {} as HourlyValues;
    const names: Record<string, string> = { pm25: 'pm2_5', pm10: 'pm10', no2: 'nitrogen_dioxide', so2: 'sulphur_dioxide', co: 'carbon_monoxide', o3: 'ozone' };
    for (const p of OM_POLLUTANTS) hourly[p] = (air[0].hourly[names[p]] as number[]).map((v) => (p === 'co' ? v * CO_UG_TO_MG : v));
    const days = dailyForecast({ times, hourly });
    expect(days.length).toBeGreaterThanOrEqual(2);
    expect(days.reduce((n, d) => n + d.hoursCovered, 0)).toBe(times.length);
  });
});

describe('aqiTrend', () => {
  it('compares the next day with today', () => {
    const rising = dailyForecast({
      times: [...synthetic('2026-03-01', 1).times, ...synthetic('2026-03-02', 1).times],
      hourly: Object.fromEntries(OM_POLLUTANTS.map((p) => [p, [...synthetic('2026-03-01', 1).hourly[p], ...synthetic('2026-03-02', 1, { pm25: 150 }).hourly[p]]])) as HourlyValues,
    });
    const t = aqiTrend(rising, '2026-03-01');
    expect(t?.direction).toBe('rising');
    expect(t!.delta).toBeGreaterThan(10);
    expect(aqiTrend(rising, '2026-03-02')).toBeNull(); // no later day
  });
});
