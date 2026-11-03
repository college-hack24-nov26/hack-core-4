import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../../types';
import { demoDataProvider } from '../../data/demo/demoDataProvider';
import { elementsToGeometry, type OsmSnapshot } from '../../services/osmGeometry';
import type { ZoneRow } from '../lib/airdata';
import { majorRoadsInZone } from '../lib/airdata';
import { NO_MEASURES, runMeasures, type MeasureSelection } from '../lib/measures';
import type { StationRow } from '../lib/stations';
import { NO_APPORTIONMENT, buildReportPdf, reportContent, reportFileName, type ReportInput } from './govReport';

let base: BaseState;
beforeAll(async () => {
  const snap = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/pune-osm-snapshot.json'), 'utf8')) as OsmSnapshot;
  base = await demoDataProvider.getBaseState(10, elementsToGeometry(snap.elements));
});

const GEN = new Date(Date.UTC(2026, 10, 3, 6, 30));

function inputFor(selection: MeasureSelection, stations: ReportInput['stations'] = []): ReportInput {
  let cell = base.cells[0];
  for (const c of base.cells) if (majorRoadsInZone(base, c, 3, true).length > 0) cell = c;
  const zone: ZoneRow = {
    id: cell.id,
    place: 'Test Nagar',
    location: cell.center,
    gridKey: '18.50,73.90',
    aqi: 156,
    category: 'Moderate',
    dominant: 'pm25',
    subindices: [{ pollutant: 'pm25', value: 156, concentration: 70 }],
    pm25: 70,
    pm10: 120,
    time: GEN.getTime(),
    trend: 'up',
    trendPct: 12,
    forecast: [{ date: '2026-11-04', hours: 24, aqi: 210, category: 'Poor', pm25: 95 }],
    causes: [{ key: 'traffic', label: 'Road traffic', strength: 'Strong', evidence: ['Road A runs 3.0 km through the zone (OpenStreetMap)'] }],
  };
  const outcome = runMeasures({ base, cell, zoneName: zone.place, currentPm25: zone.pm25, selection })!;
  return { generated: GEN, zone, city: null, stations, outcome };
}

const outdatedStation = (): StationRow => ({
  id: 's1',
  name: 'Katraj',
  agency: 'CPCB',
  city: 'Pune',
  lat: 18.45,
  lon: 73.86,
  status: 'outdated',
  hasFeed: true,
  lastReadingAt: Date.parse('2025-12-17T10:00:00+05:30'),
  ageMs: GEN.getTime() - Date.parse('2025-12-17T10:00:00+05:30'),
  readings: [{ key: 'pm25', label: 'PM2.5', value: 90, unit: 'ug/m3', time: Date.parse('2025-12-17T10:00:00+05:30') }],
  aqi: { value: 180, category: 'Moderate', dominant: 'pm25', periodEnd: null, lowerBound: false },
  estimate: null,
  forecast: null,
  coordSource: 'verified',
  sources: [],
  singleSource: false,
  note: null,
});

describe('Commissioner report', () => {
  const sel: MeasureSelection = { ...NO_MEASURES, traffic: 'standard', trees: 500, dust: true };

  it('has sections A to I in order, each with content', () => {
    const c = reportContent(inputFor(sel, [{ station: outdatedStation(), km: 4.2 }]));
    expect(c.sections.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    expect(c.sections.map((s) => s.title)).toEqual([
      'Executive summary',
      'Current situation and reasons',
      'Recommended corrective measures',
      'Detailed operational instructions',
      'Cost breakdown',
      'Expected outcomes',
      'Before and after',
      'Implementation timeline',
      'Final recommendations',
    ]);
    for (const s of c.sections) expect(s.paragraphs.length + s.bullets.length + s.tables.length).toBeGreaterThan(0);
    expect(c.generatedText).toBe('Generated 03 Nov 2026, 12:00 IST');
  });

  it('labels every value with its data status and dates outdated readings', () => {
    const c = reportContent(inputFor(sel, [{ station: outdatedStation(), km: 4.2 }]));
    const text = JSON.stringify(c);
    for (const w of ['Estimated', 'Forecast', 'Simulation', 'Outdated', 'Measured']) expect(text).toContain(w);
    expect(text).toContain('17 Dec 2025');
    expect(text).toMatch(/not an official station AQI/);
    expect(text).toMatch(/No nearby station has a current reading/);
  });

  it('states that there is no source apportionment and shows no such chart', () => {
    const c = reportContent(inputFor(sel));
    expect(JSON.stringify(c)).toContain(NO_APPORTIONMENT);
    expect(NO_APPORTIONMENT).toMatch(/no validated study exists/);
  });

  it('cites price sources and marks estimates with an asterisk', () => {
    const c = reportContent(inputFor(sel));
    const E = c.sections.find((s) => s.id === 'E')!;
    expect(E.bullets.join(' ')).toMatch(/Hunarsetu/);
    expect(E.bullets.join(' ')).toMatch(/Pune Pulse/);
    expect(E.bullets.join(' ')).toMatch(/ESTIMATE \*/);
    expect(E.tables[0].body.some((r) => /Estimate \*/.test(r[4]))).toBe(true);
    expect(E.tables[0].foot?.[3]).toMatch(/^Rs /);
  });

  it('gives the sprinkling plan in section D and says its effect is not modelled', () => {
    const c = reportContent(inputFor(sel));
    const D = c.sections.find((s) => s.id === 'D')!;
    expect(D.bullets.join(' ')).toMatch(/Water sprinkling on/);
    expect(D.bullets.join(' ')).toMatch(/Day 7/);
    expect(D.bullets.join(' ')).toMatch(/Day 14/);
    expect(D.tables.length).toBeGreaterThan(0);
    const F = c.sections.find((s) => s.id === 'F')!;
    expect(F.bullets.join(' ')).toMatch(/NOT modelled: the effect of dust control/);
    const G = c.sections.find((s) => s.id === 'G')!;
    expect(G.tables[0].body.map((r) => r[0])).toEqual(['Before (now)', 'After (simulated)', 'After, half effect', 'Day 7 check', 'Day 14 check']);
  });

  it('builds a paginated PDF with page numbers and a plain-ASCII body', () => {
    const input = inputFor({ ...NO_MEASURES, traffic: 'intensive', trees: 1000, industry: 0, dust: true }, [{ station: outdatedStation(), km: 4.2 }]);
    const doc = buildReportPdf(input);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(3);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(8000);
    expect(String.fromCharCode(...new Uint8Array(bytes.slice(0, 5)))).toBe('%PDF-');
    expect(reportFileName(input)).toBe('aeromatrix-report-test-nagar-2026-11-03.pdf');
    if (process.env.GOV_REPORT_OUT) writeFileSync(process.env.GOV_REPORT_OUT, Buffer.from(bytes));
  });

  it('builds a PDF for a measure with no modelled effect (dust control only)', () => {
    const doc = buildReportPdf(inputFor({ ...NO_MEASURES, dust: true }));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const c = reportContent(inputFor({ ...NO_MEASURES, dust: true }));
    expect(JSON.stringify(c)).toContain('not modelled');
  });
});
