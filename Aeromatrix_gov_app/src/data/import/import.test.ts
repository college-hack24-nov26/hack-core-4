import { describe, expect, it } from 'vitest';
import { detectDelimiter, floorToIstHour, isMissing, parseCsv, parseDateTime, toNumber } from './csv';
import { CSV_TEMPLATE, importAirQualityCsv, mergeObservations, pollutantFromHeader, withStationCoordinates } from './cpcbImport';
import { importWeatherCsv, mergeWeather, summariseWeather, windFromUV } from './weatherImport';
import { summariseStations } from '../../services/observations';

const IST = 5.5 * 3600 * 1000;
const ist = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) - IST;

describe('csv basics', () => {
  it('parses quotes, escaped quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""",3\r\n\r\n4,5,6');
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', '3'], ['4', '5', '6']]);
  });

  it('detects delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(parseCsv('a;b\n1,5;2')).toEqual([['a', 'b'], ['1,5', '2']]);
  });

  it('treats missing markers as missing, never zero', () => {
    for (const m of ['', 'NA', 'N/A', 'None', 'null', 'NaN', '-', 'NoData']) expect(isMissing(m)).toBe(true);
    expect(toNumber('NA')).toBeNull();
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber('1,234.5')).toBe(1234.5);
    expect(toNumber('<2')).toBe(2);
    expect(toNumber('abc')).toBeNull();
  });

  it('reads the date formats of CPCB and ERA5 exports as IST', () => {
    const t = ist(2025, 1, 15, 8, 30);
    expect(parseDateTime('15-01-2025 08:30')).toBe(t);
    expect(parseDateTime('15/01/2025 08:30')).toBe(t);
    expect(parseDateTime('2025-01-15 08:30:00')).toBe(t);
    expect(parseDateTime('2025-01-15T08:30')).toBe(t);
    expect(parseDateTime('15 Jan 2025 - 08:30')).toBe(t);
    expect(parseDateTime('15-Jan-2025 08:30')).toBe(t);
    expect(parseDateTime('2025-01-15T03:00:00Z')).toBe(Date.UTC(2025, 0, 15, 3, 0));
    expect(parseDateTime('2025-01-15T08:30:00+05:30')).toBe(t);
    expect(parseDateTime('not a date')).toBeNull();
    expect(parseDateTime('32-13-2025 08:30')).toBeNull();
    expect(floorToIstHour(ist(2025, 1, 15, 8, 45))).toBe(ist(2025, 1, 15, 8, 0));
  });
});

describe('CPCB CCR export (metadata rows, From Date header)', () => {
  const text = [
    'Report Name,Raw Data',
    'Station,"Karve Road, Pune - MPCB"',
    'Criteria,15 Minute',
    '',
    'From Date,To Date,PM2.5 (ug/m3),PM10 (ug/m3),NO2 (ug/m3),SO2 (ug/m3),CO (mg/m3),Ozone (ug/m3),Temp (degree C)',
    '15-01-2025 08:00,15-01-2025 08:15,80,160,40,10,1.2,30,22',
    '15-01-2025 08:15,15-01-2025 08:30,90,170,42,NA,1.4,32,22',
    '15-01-2025 09:00,15-01-2025 09:15,100,180,None,12,1.6,,23',
    'bad date,x,1,2,3,4,5,6,7',
  ].join('\n');

  it('finds the station and the pollutant columns and averages 15-minute rows to hours', () => {
    const ds = importAirQualityCsv(text, 'karve.csv');
    expect(ds.stations).toHaveLength(1);
    expect(ds.stations[0].name).toBe('Karve Road');
    expect(ds.stations[0].lat).toBeNull(); // no coordinate until you give one
    expect(ds.readings).toHaveLength(2);
    const h8 = ds.readings.find((r) => r.time === ist(2025, 1, 15, 8, 0))!;
    expect(h8.values.pm25).toBe(85);
    expect(h8.values.so2).toBe(10); // the NA row does not drag it to zero
    expect(h8.values.o3).toBe(31);
    expect(h8.values.co).toBeCloseTo(1.3, 10);
    const h9 = ds.readings.find((r) => r.time === ist(2025, 1, 15, 9, 0))!;
    expect(h9.values.no2).toBeUndefined();
    expect(h9.values.o3).toBeUndefined();
  });

  it('warns about unreadable rows and ignored columns', () => {
    const ds = importAirQualityCsv(text, 'karve.csv');
    expect(ds.warnings.join(' ')).toMatch(/1 rows had a date that could not be read/);
    expect(ds.warnings.join(' ')).toMatch(/ignored columns.*Temp/);
    expect(ds.sources).toEqual(['karve.csv']);
  });
});

describe('station_hour-style and long tables', () => {
  it('reads one table with several stations', () => {
    const t = ['StationId,Datetime,PM2.5,PM10,NO,NO2,NOx,NH3,SO2,CO,Ozone', 'MH001,2025-01-15 08:00:00,70,130,5,30,35,2,8,1.0,25', 'MH002,2025-01-15 08:00:00,90,150,6,35,40,3,9,1.2,28', 'MH001,2025-01-15 09:00:00,75,135,5,31,36,2,8,1.1,26'].join('\n');
    const ds = importAirQualityCsv(t, 'station_hour.csv');
    expect(ds.stations.map((s) => s.name).sort()).toEqual(['MH001', 'MH002']);
    expect(ds.readings).toHaveLength(3);
    expect(ds.readings.find((r) => r.stationId === 'mh002')!.values).toMatchObject({ pm25: 90, pm10: 150, no2: 35, so2: 9, co: 1.2, o3: 28 });
  });

  it('reads a long table with station, datetime, pollutant, value, unit (and converts CO ug/m3)', () => {
    const t = ['station,datetime,pollutant,value,unit', 'A,2025-01-15 08:00,PM2.5,60,ug/m3', 'A,2025-01-15 08:00,CO,1500,ug/m3', 'A,2025-01-15 08:00,Methane,5,ppm'].join('\n');
    const ds = importAirQualityCsv(t, 'long.csv');
    expect(ds.readings).toHaveLength(1);
    expect(ds.readings[0].values.pm25).toBe(60);
    expect(ds.readings[0].values.co).toBeCloseTo(1.5, 10);
  });

  it('converts mg/m3 pollutant headers to ug/m3 and uses the file name when no station is given', () => {
    const t = ['Datetime,PM2.5 (mg/m3),PM10 (ug/m3)', '2025-01-15 08:00,0.05,100'].join('\n');
    const ds = importAirQualityCsv(t, 'my_station.csv');
    expect(ds.stations[0].name).toBe('my station');
    expect(ds.readings[0].values.pm25).toBeCloseTo(50, 8);
  });

  it('explains a file it cannot use', () => {
    expect(importAirQualityCsv('', 'a.csv').warnings[0]).toMatch(/empty/);
    expect(importAirQualityCsv('foo,bar\n1,2', 'a.csv').warnings[0]).toMatch(/no header with a date column/);
    expect(importAirQualityCsv('Datetime,PM2.5\nnot,NA', 'a.csv').readings).toHaveLength(0);
  });

  it('recognises pollutant headers', () => {
    expect(pollutantFromHeader('PM2.5 (ug/m3)')).toBe('pm25');
    expect(pollutantFromHeader('PM2_5')).toBe('pm25');
    expect(pollutantFromHeader('Ozone')).toBe('o3');
    expect(pollutantFromHeader('Nitrogen Dioxide')).toBe('no2');
    expect(pollutantFromHeader('Benzene')).toBeNull();
  });
});

describe('merging and coordinates', () => {
  it('merges datasets, keeping coordinates and letting later readings win', () => {
    const a = withStationCoordinates(importAirQualityCsv('station,datetime,PM2.5\nS,2025-01-15 08:00,10', 'a.csv'), 's', 18.5, 73.85);
    const b = importAirQualityCsv('station,datetime,PM2.5,PM10\nS,2025-01-15 08:00,20,40\nS,2025-01-15 09:00,30,50', 'b.csv');
    const m = mergeObservations(a, b);
    expect(m.stations).toHaveLength(1);
    expect(m.stations[0].lat).toBe(18.5);
    expect(m.readings).toHaveLength(2);
    expect(m.readings[0].values).toEqual({ pm25: 20, pm10: 40 });
    expect(m.sources).toEqual(['a.csv', 'b.csv']);
  });

  it('validates coordinates typed into the editor', () => {
    const ds = importAirQualityCsv('station,datetime,PM2.5\nS,2025-01-15 08:00,10', 'a.csv');
    expect(withStationCoordinates(ds, 's', 18.5, 73.85).stations[0]).toMatchObject({ lat: 18.5, lon: 73.85 });
    expect(withStationCoordinates(ds, 's', 118.5, 73.85).stations[0].lat).toBeNull();
    expect(withStationCoordinates(ds, 's', Number.NaN, 73.85).stations[0].lon).toBeNull();
  });

  it('its own template imports cleanly and summarises per station', () => {
    const ds = importAirQualityCsv(CSV_TEMPLATE, 'template.csv');
    expect(ds.readings).toHaveLength(2);
    expect(ds.warnings).toEqual([]);
    const sum = summariseStations(ds, { kind: 'last24h' });
    expect(sum[0].means.pm25).toBeCloseTo(88.6, 6);
  });
});

describe('weather import', () => {
  it('reads an ERA5 point extract: Kelvin, u10/v10, Pa, metres', () => {
    const t = ['valid_time,t2m,u10,v10,sp,tp', '2025-01-15T00:00,300.15,-3,0,101300,0.001', '2025-01-15T01:00,301.15,-3,0,101200,0'].join('\n');
    const ds = importWeatherCsv(t, 'era5.csv');
    expect(ds.readings).toHaveLength(2);
    const r = ds.readings[0];
    expect(r.temperature).toBeCloseTo(27, 6);
    expect(r.windSpeed).toBeCloseTo(3, 6);
    expect(r.windDirection).toBeCloseTo(90, 6); // wind blowing towards the west comes FROM the east
    expect(r.pressure).toBeCloseTo(1013, 6);
    expect(r.rainfall).toBeCloseTo(1, 6);
  });

  it('computes wind direction from components', () => {
    expect(windFromUV(0, -5)).toEqual({ speed: 5, direction: 0 }); // blowing south = from the north
    expect(windFromUV(-5, 0).direction).toBeCloseTo(90, 8);
    expect(windFromUV(0, 5).direction).toBeCloseTo(180, 8);
    expect(windFromUV(5, 0).direction).toBeCloseTo(270, 8);
  });

  it('reads CPCB meteorology columns', () => {
    const t = ['From Date,AT (degree C),RH (%),WS (m/s),WD (degree),RF (mm),BP (mmHg)', '15-01-2025 08:00,22.5,60,2.5,45,0,760', '15-01-2025 09:00,24.0,55,3.5,55,NA,759'].join('\n');
    const ds = importWeatherCsv(t, 'cpcb_met.csv');
    expect(ds.readings).toHaveLength(2);
    expect(ds.readings[0]).toMatchObject({ temperature: 22.5, humidity: 60, windSpeed: 2.5, windDirection: 45, rainfall: 0 });
    expect(ds.readings[0].pressure).toBeCloseTo(760 * 1.33322, 3);
    expect(ds.readings[1].rainfall).toBeUndefined();
  });

  it('summarises only what the file has (nothing is filled in)', () => {
    const t = ['time,t2m,rh', '2025-01-15T00:00,290.15,50', '2025-01-15T01:00,292.15,60'].join('\n');
    const s = summariseWeather(importWeatherCsv(t, 'w.csv'))!;
    expect(s.temperature).toBeCloseTo(18, 6);
    expect(s.humidity).toBe(55);
    expect(s.windSpeed).toBeUndefined();
    expect(s.pressure).toBeUndefined();
    expect(summariseWeather({ readings: [], sources: [], warnings: [] })).toBeNull();
  });

  it('takes the vector mean of the wind and a daily rainfall total', () => {
    const t = ['time,ws,wd,rf', '2025-01-15 00:00,2,90,0.5', '2025-01-15 01:00,2,270,0.5'].join('\n');
    const s = summariseWeather(importWeatherCsv(t, 'w.csv'))!;
    expect(s.windSpeed).toBe(2); // mean speed
    expect(s.rainfall).toBeCloseTo(12, 6); // 0.5 mm/h x 24
  });

  it('merges weather files and explains unusable ones', () => {
    const a = importWeatherCsv('time,t2m\n2025-01-15T00:00,290', 'a.csv');
    const b = importWeatherCsv('time,rh\n2025-01-15T00:00,50', 'b.csv');
    const m = mergeWeather(a, b);
    expect(m.readings).toHaveLength(1);
    expect(m.readings[0].humidity).toBe(50);
    expect(importWeatherCsv('x,y\n1,2', 'c.csv').warnings[0]).toMatch(/no header with a time column/);
  });
});
