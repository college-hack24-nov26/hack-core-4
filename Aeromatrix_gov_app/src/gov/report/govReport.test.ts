import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../../types';
import { demoDataProvider } from '../../data/demo/demoDataProvider';
import { elementsToGeometry, type OsmSnapshot } from '../../services/osmGeometry';
import type { ZoneRow } from '../lib/airdata';
import { majorRoadsInZone } from '../lib/airdata';
import { parseApportionment, type ApportionmentLoad } from '../lib/apportionment';
import type { DailyPoint } from '../lib/history';
import { NO_MEASURES, runMeasures, type MeasureSelection } from '../lib/measures';
import type { StationRow } from '../lib/stations';
import { buildReportPdf, pdfText, reportFileName, type ReportFonts } from './govReport';
import { NO_PIE_MESSAGE, projectedAqi, reportContent, schedule, type Block, type ChartSpec, type ReportInput } from './reportContent';

let base: BaseState;
let fonts: ReportFonts;
beforeAll(async () => {
  const snap = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/pune-osm-snapshot.json'), 'utf8')) as OsmSnapshot;
  base = await demoDataProvider.getBaseState(10, elementsToGeometry(snap.elements));
  const f = (n: string) => readFileSync(resolve(__dirname, 'fonts', n)).toString('base64');
  fonts = { regular: f('Inter_400Regular.ttf'), bold: f('Inter_700Bold.ttf') };
});

const GEN = new Date(Date.UTC(2026, 10, 3, 6, 30)); // 3 Nov 2026, 12:00 IST
const NONE: ApportionmentLoad = { status: 'unavailable', reason: 'none' };
const STUDY = parseApportionment({
  study: 'Test source-apportionment study',
  year: 2024,
  pollutant: 'PM2.5',
  scope: 'Pune and Pimpri-Chinchwad',
  sources: [
    { key: 'traffic', label: 'Traffic', percent: 35 },
    { key: 'construction', label: 'Construction', percent: 25 },
    { key: 'industry', label: 'Industry', percent: 20 },
    { key: 'dust', label: 'Road dust', percent: 12 },
    { key: 'other', label: 'Other', percent: 8 },
  ],
});

const DAILY: DailyPoint[] = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${28 + i > 31 ? '0' + (28 + i - 31) : 28 + i}`.replace('2026-10-0', '2026-11-0'), aqi: 120 + i * 10, category: i > 4 ? 'Poor' : 'Moderate', pm25: 50 + i * 8, pm10: 90 }));

function inputFor(selection: MeasureSelection, over: Partial<ReportInput> = {}): ReportInput {
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
    subindices: [
      { pollutant: 'pm25', value: 156, concentration: 70 },
      { pollutant: 'pm10', value: 110, concentration: 130 },
    ],
    values: { pm25: 70, pm10: 130, no2: 30, so2: 10, co: 0.5, o3: 40 },
    pm25: 70,
    pm10: 130,
    time: GEN.getTime(),
    trend: 'up',
    trendPct: 12,
    forecast: [{ date: '2026-11-04', hours: 24, aqi: 210, category: 'Poor', pm25: 95 }],
    causes: [{ key: 'traffic', label: 'Road traffic', strength: 'Strong', evidence: ['Road A runs 3.0 km through the area'] }],
  };
  const outcome = runMeasures({ base, cell, zoneName: zone.place, currentPm25: zone.pm25, selection })!;
  return { generated: GEN, zone, city: null, stations: [], outcome, apportionment: NONE, daily: null, ...over };
}

const flat = (blocks: Block[]) => JSON.stringify(blocks);
const charts = (blocks: Block[]): ChartSpec[] => blocks.flatMap((b) => (b.t === 'charts' ? b.specs : []));
const SEL: MeasureSelection = { ...NO_MEASURES, traffic: 'standard', trees: 500, dust: true };

const outdated = (): StationRow => ({
  id: 's1',
  name: 'Katraj',
  agency: 'CPCB',
  city: 'Pune',
  lat: 18.45,
  lon: 73.86,
  status: 'outdated',
  monitoring: 'continuous',
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

describe('report structure', () => {
  it('has sections A to I in order with the agreed titles, plus a data-quality appendix', () => {
    const c = reportContent(inputFor(SEL));
    expect(c.sections.map((s) => s.id)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    expect(c.sections.map((s) => s.title)).toEqual(['Executive summary', 'Current situation and reasons', 'Recommended corrective measures', 'Detailed operational instructions', 'Cost breakdown', 'Expected outcomes', 'Before and after', 'Implementation timeline', 'Final recommendations']);
    for (const s of c.sections) expect(s.blocks.length).toBeGreaterThan(0);
    expect(c.appendix.title).toBe('Data quality and assumptions');
    expect(c.generatedText).toBe('Generated 03 Nov 2026, 12:00 IST');
    expect(c.meta.map((m) => m[0])).toEqual(['Prepared for', 'Area', 'Generated', 'Data']);
  });

  it('uses plain language: no developer or demo wording anywhere', () => {
    const c = reportContent(inputFor(SEL, { stations: [{ station: outdated(), km: 4.2 }], daily: DAILY }));
    expect(JSON.stringify(c)).not.toMatch(/prototype|DEMO|demo|uncalibrated|rule model|OpenStreetMap|drop-in|MODELED_SCENARIO/i);
  });

  it('opens with the problem, location, condition, pollutant, severity, why now and the intervention (A)', () => {
    const A = reportContent(inputFor(SEL, { daily: DAILY })).sections[0];
    const t = flat(A.blocks);
    for (const k of ['Problem identified', 'Affected location', 'Current condition', 'Main pollutant', 'Severity', 'Recommended intervention', 'Why action is recommended now']) expect(t).toContain(k);
    expect(t).toContain('PM2.5 pollution in Test Nagar');
    expect(t).toContain('Moderate');
    expect(t).toMatch(/CPCB|breathing discomfort/);
    expect(t).toContain('reaches Poor');
  });
});

describe('source-contribution pie charts', () => {
  it('are NOT drawn without a study: the report says plainly that they cannot be generated', () => {
    const c = reportContent(inputFor(SEL));
    const all = c.sections.flatMap((s) => charts(s.blocks));
    expect(all.some((x) => x.kind === 'pie')).toBe(false);
    const nones = all.filter((x) => x.kind === 'none' && /contribution/i.test(x.title));
    expect(nones.length).toBeGreaterThanOrEqual(3); // B, F, and the two in G
    for (const n of nones) if (n.kind === 'none') expect(n.message).toMatch(/cannot be generated yet|cannot be made|No projection/);
    expect(NO_PIE_MESSAGE).toMatch(/no source-apportionment study/);
  });

  it('are drawn from a real study, with the projected pie after traffic measures', () => {
    expect(STUDY.status).toBe('loaded');
    const c = reportContent(inputFor(SEL, { apportionment: STUDY }));
    const B = charts(c.sections[1].blocks).find((x) => x.kind === 'pie');
    expect(B?.kind === 'pie' && B.slices.map((s) => s.label)).toEqual(['Traffic', 'Construction', 'Industry', 'Road dust', 'Other']);
    expect(B?.kind === 'pie' && B.caption).toMatch(/Test source-apportionment study/);
    const F = charts(c.sections[5].blocks).find((x) => x.kind === 'pie');
    expect(F?.kind).toBe('pie');
    if (F?.kind === 'pie' && B?.kind === 'pie') {
      expect(F.slices.reduce((a, s) => a + s.percent, 0)).toBeCloseTo(100, 6);
      expect(F.slices[0].percent).toBeLessThan(B.slices[0].percent); // traffic share falls after traffic enforcement
    }
  });

  it('give no projection when no selected measure acts on a source in the study', () => {
    const c = reportContent(inputFor({ ...NO_MEASURES, trees: 500 }, { apportionment: STUDY }));
    const F = charts(c.sections[5].blocks);
    expect(F.some((x) => x.kind === 'pie')).toBe(false);
    expect(F.some((x) => x.kind === 'none' && /none of the selected measures/.test(x.message))).toBe(true);
  });
});

describe('measures, operations, costs and timeline', () => {
  it('lists the eight points for every measure (C)', () => {
    const C = reportContent(inputFor(SEL)).sections[2];
    const tables = C.blocks.filter((b) => b.t === 'table') as Array<Extract<Block, { t: 'table' }>>;
    expect(tables).toHaveLength(3); // traffic, trees, dust
    for (const t of tables) expect(t.body.map((r) => r[0])).toEqual(['What to do', 'Why', 'Who to inform', 'Where', 'When to begin', 'How long', 'Resources', 'Cost']);
  });

  it('gives real sprinkling detail (D): roads, slots, frequency, water, tankers, manpower, costs, responsible', () => {
    const D = reportContent(inputFor(SEL)).sections[3];
    const t = flat(D.blocks);
    for (const k of ['Sprinkling locations', 'Time slots', 'Frequency', 'Water per round', 'Total water per day', 'Duration', 'Tankers needed', 'Manpower', 'Water and transport cost', 'Responsible', 'Assumptions used', 'Day 7', 'Day 14']) expect(t).toContain(k);
    expect(t).toContain('3 rounds a day');
    expect(t).not.toMatch(/Sprinkle water on the road/);
  });

  it('breaks the cost down by category with daily, weekly and monthly rates, the basis and the sources (E)', () => {
    const E = reportContent(inputFor(SEL)).sections[4];
    const tables = E.blocks.filter((b) => b.t === 'table') as Array<Extract<Block, { t: 'table' }>>;
    const byCat = tables[0];
    expect(byCat.body.map((r) => r[0])).toEqual(['Equipment and materials', 'Vehicles and tankers', 'Labour', 'Operations', 'Maintenance']);
    const money = (s: string) => Number(s.replace(/[^\d]/g, ''));
    const sum = byCat.body.reduce((a, r) => a + money(r[3]), 0);
    expect(money(byCat.foot![3])).toBe(sum);
    expect(byCat.foot![3]).toMatch(/^₹/);
    expect(tables[1].head).toEqual(['Per day', 'Per week', 'Per month (30 days)']);
    const item = tables[2];
    expect(item.head).toEqual(['Item', 'Quantity', 'Unit price', 'Amount', 'Basis']);
    expect(item.body.some((r) => /Estimate \*/.test(r[4]))).toBe(true);
    expect(item.body.reduce((a, r) => a + money(r[3]), 0)).toBe(money(item.foot![3]));
    const t = flat(E.blocks);
    expect(t).toContain('Hunarsetu');
    expect(t).toContain('Pune Pulse');
    expect(t).toContain('quantity multiplied by unit price');
  });

  it('puts a dated Day 1 to Day 14 timeline in H, with longer measures after', () => {
    const H = reportContent(inputFor(SEL)).sections[7];
    const t = H.blocks.find((b) => b.t === 'table') as Extract<Block, { t: 'table' }>;
    expect(t.body.map((r) => r[0]).slice(0, 6)).toEqual(['Day 1', 'Day 2', 'Day 3 to 7', 'Day 7', 'Day 8 to 13', 'Day 14']);
    expect(t.body[0][1]).toBe('2026-11-04');
    expect(t.body.length).toBeGreaterThan(6);
    const sched = schedule(inputFor(SEL).outcome);
    expect(sched.map((s) => s.startDay)).toEqual([3, 5, 2]);
  });

  it('closes with what, why, who, cost, outcome and a recommended deadline (I)', () => {
    const I = reportContent(inputFor(SEL)).sections[8];
    const t = I.blocks[0] as Extract<Block, { t: 'table' }>;
    expect(t.body.map((r) => r[0])).toEqual(['What to do', 'Why', 'Who to inform', 'Estimated cost', 'Expected outcome', 'Recommended deadline']);
    expect(t.body[5][1]).toBe('Decide by 2026-11-08; start on 2026-11-04');
  });

  it('shows measured check rows for Day 7 and Day 14 and the before and after bars (G)', () => {
    const G = reportContent(inputFor({ ...NO_MEASURES, traffic: 'intensive' })).sections[6];
    const bars = charts(G.blocks).find((x) => x.kind === 'bars' && x.title === 'PM2.5 now and expected');
    expect(bars?.kind === 'bars' && bars.bars.map((b) => b.label)).toEqual(['Now', 'If half the effect', 'Expected']);
    const t = flat(G.blocks);
    expect(t).toContain('Day 7 (2026-11-10)');
    expect(t).toContain('Day 14 (2026-11-17)');
    expect(t).toContain('Proposed cost by category');
  });

  it('shows the last seven days when history is available and says so when it is not (B)', () => {
    const withWeek = reportContent(inputFor(SEL, { daily: DAILY })).sections[1];
    expect(charts(withWeek.blocks).some((x) => x.kind === 'bars' && x.title === 'Daily PM2.5, last 7 days')).toBe(true);
    expect(flat(withWeek.blocks)).toMatch(/Moderate or worse on 7 of 7 days/);
    const without = reportContent(inputFor(SEL)).sections[1];
    expect(flat(without.blocks)).toContain('Weekly history could not be retrieved');
  });

  it('projects an AQI only when the PM2.5 sub-index can move it', () => {
    const z = inputFor(SEL).zone;
    expect(projectedAqi(z, 50)).toBeLessThan(z.aqi);
    expect(projectedAqi(z, null)).toBeNull();
    expect(projectedAqi({ ...z, subindices: [{ pollutant: 'pm10', value: 110, concentration: 130 }] }, 50)).toBeNull();
  });
});

describe('PDF', () => {
  it('builds a paginated, branded PDF with embedded fonts and page numbers', () => {
    const input = inputFor({ ...NO_MEASURES, traffic: 'intensive', trees: 1000, dust: true }, { apportionment: STUDY, daily: DAILY, stations: [{ station: outdated(), km: 4.2 }] });
    const doc = buildReportPdf(input, fonts);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(6);
    const bytes = doc.output('arraybuffer');
    expect(String.fromCharCode(...new Uint8Array(bytes.slice(0, 5)))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(80_000); // the embedded fonts make it far larger than a plain PDF
    expect(reportFileName(input)).toBe('aeromatrix-report-test-nagar-2026-11-03.pdf');
    if (process.env.GOV_REPORT_OUT) writeFileSync(process.env.GOV_REPORT_OUT, Buffer.from(bytes));
  });

  it('builds for a measure with no modelled effect and with no charts data', () => {
    const doc = buildReportPdf(inputFor({ ...NO_MEASURES, dust: true }), fonts);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(5);
  });

  it('maps characters the font lacks and keeps the rupee sign', () => {
    expect(pdfText('NO₂ and SO₂ — “quoted”… ₹1,200')).toBe('NO2 and SO2 - "quoted"... ₹1,200');
  });
});
