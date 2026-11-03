/**
 * The Commissioner's costed implementation report (jsPDF + jspdf-autotable), sections A to I.
 * Content is built first as plain strings (testable and shown in the in-app preview), then drawn.
 * The standard PDF fonts cannot draw the rupee sign, so amounts are written "Rs 12,34,567", and only plain Latin text
 * is written (pdfSafe). There is no source-apportionment chart: no validated study exists (D7).
 */
import { jsPDF } from 'jspdf';
import * as autoTableModule from 'jspdf-autotable';
import { PRICES, formatINRPdf } from '../../plan/costModel';
import { pdfSafe } from '../../plan/planPdf';
import type { CitySummary, ZoneRow } from '../lib/airdata';
import { NOT_ASSESSED } from '../lib/airdata';
import type { SimOutcome } from '../lib/measures';
import { DEPARTMENTS } from '../lib/routing';
import { STATUS_LABEL, type StationRow } from '../lib/stations';
import { formatAge, formatIst, pollutantLabel, signed } from '../lib/format';

export interface ReportInput {
  generated: Date;
  zone: ZoneRow;
  city: CitySummary | null;
  /** nearest monitoring stations with their distance */
  stations: Array<{ station: StationRow; km: number }>;
  outcome: SimOutcome;
  scenarioName?: string;
}

export interface ReportTable {
  head: string[];
  body: string[][];
  foot?: string[];
}

export interface ReportSection {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';
  title: string;
  paragraphs: string[];
  bullets: string[];
  tables: ReportTable[];
}

export interface ReportContent {
  title: string;
  subtitle: string;
  generatedText: string;
  statuses: string[];
  sections: ReportSection[];
}

type AutoTableFn = (doc: jsPDF, options: Record<string, unknown>) => void;

/**
 * jspdf-autotable ships both a default and a named export, and the browser bundler can wrap the CommonJS default one
 * level deeper than Node does. Take whichever of them is the function.
 */
function resolveAutoTable(): AutoTableFn {
  const m = autoTableModule as unknown as Record<string, unknown>;
  const d = m.default as Record<string, unknown> | AutoTableFn | undefined;
  const found = [m.default, m.autoTable, typeof d === 'object' ? d?.default : undefined, typeof d === 'object' ? d?.autoTable : undefined].find((f) => typeof f === 'function');
  if (!found) throw new Error('The PDF table library could not be loaded.');
  return found as AutoTableFn;
}

export const NO_APPORTIONMENT =
  'There is no source-contribution (source apportionment) analysis in this report: no validated study exists for Pune and Pimpri-Chinchwad. It can be added once a study exists.';

const sec = (id: ReportSection['id'], title: string, over: Partial<ReportSection> = {}): ReportSection => ({ id, title, paragraphs: [], bullets: [], tables: [], ...over });
const inr = (v: number) => formatINRPdf(v);

function responsible(o: SimOutcome): Array<{ measure: string; dept: string; place: string; time: string; cost: string }> {
  const rows: Array<{ measure: string; dept: string; place: string; time: string; cost: string }> = [];
  for (const opt of o.options) {
    const dept = opt.type === 'traffic' ? DEPARTMENTS.traffic.name : opt.type === 'industry' ? DEPARTMENTS.industry.name : DEPARTMENTS.garden.name;
    const weeks = opt.type === 'traffic' ? (o.selection.traffic === 'intensive' ? 10 : 6) : opt.type === 'industry' ? 12 : 8;
    rows.push({ measure: opt.label, dept, place: opt.type === 'industry' ? opt.location : o.zoneName, time: `${weeks} weeks`, cost: `${inr(opt.oneTime)} one-time + ${inr(opt.recurring)} first year` });
  }
  if (o.closure) {
    rows.push({ measure: `Close ${o.closure.roadName} with ${Math.round(o.closure.diversion * 100)}% diversion`, dept: `${DEPARTMENTS.traffic.name}; ${DEPARTMENTS.roads.name}`, place: o.closure.roadName, time: '1 week', cost: `${inr(o.closure.oneTime)} one-time + ${inr(o.closure.recurring)} first 30 days` });
  }
  if (o.dust) {
    rows.push({ measure: 'Dust control by water sprinkling', dept: `${DEPARTMENTS.construction.name}; ${DEPARTMENTS.roads.name}`, place: o.dust.roads.map((r) => r.name).join(', ') || o.zoneName, time: `${o.dust.days} days`, cost: `${inr(o.dust.total)} for ${o.dust.days} days` });
  }
  return rows;
}

function instructions(o: SimOutcome): { bullets: string[]; tables: ReportTable[] } {
  const bullets: string[] = [];
  const tables: ReportTable[] = [];
  for (const opt of o.options) {
    if (opt.type === 'traffic') {
      bullets.push(`${opt.label}: install ${opt.quantity} ANPR cameras with two signs each in ${o.zoneName}, staff the enforcement for the first year, and publish the public awareness campaign before enforcement starts. Report violations and traffic counts weekly.`);
    } else if (opt.type === 'trees') {
      bullets.push(`${opt.label} in ${o.zoneName}: plant native saplings with tree guards and compost in the planting pits, then water every fortnight for the first year. Record the survival count at 3 and 12 months. Canopy takes years to mature.`);
    } else {
      bullets.push(`${opt.label}: ${opt.location}. Serve inspection and compliance notices, obtain site quotations for bag filters and ducting, install, and take an approved-lab stack emission test after commissioning.`);
    }
  }
  if (o.closure) {
    bullets.push(`Close ${o.closure.roadName}${o.closure.divertToName ? ` and divert traffic to ${o.closure.divertToName}` : ''}: place 4 signs at the closure and the diversion, and post 2 traffic marshals for the first 30 days. Review congestion on the diversion after one week.`);
  }
  if (o.dust) {
    const d = o.dust;
    if (d.roads.length === 0) bullets.push(d.notes[1]);
    else {
      bullets.push(
        `Water sprinkling on ${d.roads.length} road${d.roads.length === 1 ? '' : 's'}, ${d.slots.length} passes a day (${d.slots.join(', ')}) for ${d.days} days: ${Math.round(d.litresPerDay).toLocaleString('en-IN')} L a day with ${d.tankers} tanker${d.tankers === 1 ? '' : 's'} (${d.tripsPerDay} trips a day) and a crew of ${d.crew}.`,
      );
      tables.push({
        head: ['Road', 'Class', 'Length in area', 'Water per pass'],
        body: d.roads.map((r) => [r.name, r.roadClass, `${r.lengthKm.toFixed(1)} km`, `${Math.round(r.litresPerPass).toLocaleString('en-IN')} L`]),
      });
      tables.push({ head: ['Assumption (planning value, not a standard)', 'Value'], body: d.assumptions.map((a) => [a[0], a[1]]) });
      bullets.push(...d.verification.map((v) => `Day ${v.day}: ${v.check}`));
    }
  }
  return { bullets, tables };
}

function costTable(o: SimOutcome): ReportTable {
  return {
    head: ['Item', 'Quantity', 'Unit price', 'Total', 'Basis'],
    body: o.lines.map((l) => [`${l.item}${l.note ? ` (${l.note})` : ''}`, `${l.quantity.toLocaleString('en-IN')} ${l.unit}`, inr(l.unitPrice), inr(l.total), `${l.kind === 'sourced' ? 'Sourced' : 'Estimate *'}${l.recurring ? ', first year' : ', one-time'}`]),
    foot: ['Total (one-time + first year)', '', '', inr(o.total), ''],
  };
}

function timeline(o: SimOutcome): ReportTable {
  const weeks = Math.max(1, o.weeks);
  const rows: string[][] = [];
  const add = (label: string, from: number, to: number, what: string) => rows.push([label, `Week ${from}${to > from ? ` to ${to}` : ''}`, what]);
  add('All measures', 1, 1, 'Approvals, department briefings, procurement and site surveys; record the starting readings.');
  if (o.selection.traffic !== 'off') add('Traffic enforcement', 1, o.selection.traffic === 'intensive' ? 10 : 6, 'Camera and sign installation, staffing, awareness campaign, then enforcement.');
  if (o.closure) add('Road closure', 1, 1, 'Signs, marshals and the diversion go live; review congestion.');
  if (o.options.some((x) => x.type === 'industry')) add('Industrial controls', 1, 12, 'Notices, quotations, installation and stack tests.');
  if (o.options.some((x) => x.type === 'trees')) add('Tree planting', 1, 8, 'Pits, planting, guards, first watering rounds.');
  if (o.dust) add('Dust control', 1, o.dust.weeks, `Daily sprinkling; readings checked on Day 7 and Day 14.`);
  rows.push(['Review', `Week ${weeks}`, 'Compare readings with the starting values, report to the Commissioner, decide to continue, extend or stop.']);
  return { head: ['Measure', 'When', 'What happens'], body: rows };
}

export function reportContent(input: ReportInput): ReportContent {
  const { zone, outcome: o, city, generated } = input;
  const priceIds = new Set(o.lines.map((l) => l.priceId));
  const stationRows = input.stations.map(({ station: s, km }) => [
    s.name,
    `${km.toFixed(1)} km`,
    STATUS_LABEL[s.status],
    s.readings.length > 0 ? `${s.aqi ? `AQI ${s.aqi.value} (${s.aqi.category}); ` : ''}last reading ${formatIst(s.lastReadingAt)} (${formatAge(s.ageMs)})` : s.estimate ? `no reading; model estimate AQI ${s.estimate.aqi} (${s.estimate.category})` : 'No data feed',
  ]);
  const anyCurrent = input.stations.some((x) => x.station.status === 'live');
  const mainCause = zone.causes[0];

  const A = sec('A', 'Executive summary', {
    tables: [
      {
        head: ['Item', 'Detail'],
        body: [
          ['Area', zone.place],
          ['Current situation', `CPCB AQI about ${zone.aqi} (${zone.category}), Estimated from model data at ${formatIst(zone.time)}; main pollutant ${pollutantLabel(zone.dominant)}`],
          ['Recommended measures', o.measures.join('; ')],
          [
            'Expected outcome (Simulation)',
            o.modelledEffect && o.projectedPm25 !== null && o.currentPm25 !== null
              ? `PM2.5 ${o.currentPm25.toFixed(1)} -> ${o.projectedPm25.toFixed(1)} ug/m3 (${signed(o.changePct)}%); ${o.lowPm25?.toFixed(1)} ug/m3 (${signed(o.lowPct)}%) if only half the assumed effect is achieved`
              : 'No modelled change: the selected measures have no modelled effect',
          ],
          ['One-time cost', inr(o.oneTime)],
          ['First-year running cost', inr(o.recurring)],
          ['Implementation period', `${o.weeks} week${o.weeks === 1 ? '' : 's'} (planning assumption)`],
        ],
      },
    ],
    paragraphs: [
      'This report is decision support for the Municipal Commissioner. It does not send any instruction; the Commissioner approves and issues each one. The simulated outcome is a hypothetical result from an uncalibrated prototype model and must not be used for health, legal or final planning decisions.',
    ],
  });

  const B = sec('B', 'Current situation and reasons', {
    tables: [
      {
        head: ['Item', 'Value', 'Status', 'Date'],
        body: [
          ['Area CPCB AQI', `${zone.aqi} (${zone.category})`, 'Estimated', formatIst(zone.time)],
          ['PM2.5 / PM10', `${zone.pm25?.toFixed(1) ?? 'n/a'} / ${zone.pm10?.toFixed(1) ?? 'n/a'} ug/m3`, 'Estimated', formatIst(zone.time)],
          ['Trend (PM2.5 against 6 hours earlier)', zone.trend === 'flat' ? 'steady' : `${zone.trend} ${zone.trendPct.toFixed(0)}%`, 'Estimated', formatIst(zone.time)],
          ...zone.forecast.map((f) => [`Outlook +${f.hours} h`, `AQI ${f.aqi} (${f.category})`, 'Forecast', f.date]),
          ...(city ? [['City AQI', `${city.value} (${city.category})`, 'Estimated', formatIst(city.asOf)]] : []),
        ],
      },
      { head: ['Nearest station', 'Distance', 'Status', 'Reading'], body: stationRows },
      {
        head: ['Possible cause', 'Strength', 'Evidence'],
        body: zone.causes.map((c) => [c.label, c.strength, c.evidence.join(' ')]),
      },
    ],
    bullets: [
      zone.causes.length === 0 ? 'No likely cause could be shown with evidence for this area.' : `Strongest indication: ${mainCause.label} (${mainCause.strength.toLowerCase()}).`,
      `Not assessed (no data connected): ${NOT_ASSESSED.map((n) => n.replace(/ \(.*\)$/, '')).join('; ')}.`,
      anyCurrent ? 'At least one nearby station has a current reading.' : 'No nearby station has a current reading: the values above are model estimates, and the station readings shown are historical (Outdated) with their dates.',
      NO_APPORTIONMENT,
    ],
    paragraphs: [
      'Method: area and city values are CPCB National AQI computed from Open-Meteo CAMS air-quality model data at about 40 km resolution. They are ESTIMATES, not official station AQI. Neighbouring areas can share one model value. Causes come from mapped OpenStreetMap roads and industry and the PM2.5/PM10 ratio, and are indications, not an apportionment.',
    ],
  });

  const C = sec('C', 'Recommended corrective measures', {
    tables: [{ head: ['Measure', 'Responsible department', 'Place', 'Time', 'Cost (INR)'], body: responsible(o).map((r) => [r.measure, r.dept, r.place, r.time, r.cost]) }],
    paragraphs: ['Departments are suggestions. The Commissioner chooses the recipients and approves every instruction.'],
  });

  const ins = instructions(o);
  const D = sec('D', 'Detailed operational instructions', { bullets: ins.bullets, tables: ins.tables });

  const E = sec('E', 'Cost breakdown', {
    tables: [costTable(o)],
    paragraphs: [
      '* Estimate: no public price was found; the basis is stated in the price table. Quantities marked "assumed" are planner assumptions, not quotations.',
      'Price sources (items marked Sourced):',
    ],
    bullets: [...priceIds]
      .map((id) => PRICES[id])
      .filter(Boolean)
      .map((p) => (p.kind === 'sourced' && p.source ? `${p.item}: ${p.source.name} - ${p.source.url} (accessed ${p.source.accessed}). ${p.source.note}` : `${p.item}: ESTIMATE *. ${p.basis ?? ''}`)),
  });

  const F = sec('F', 'Expected outcomes', {
    tables: [
      {
        head: ['Measure', 'Value', 'Status'],
        body: [
          ['PM2.5 now', o.currentPm25 !== null ? `${o.currentPm25.toFixed(1)} ug/m3` : 'no current model value', 'Estimated'],
          ['PM2.5 simulated', o.modelledEffect && o.projectedPm25 !== null ? `${o.projectedPm25.toFixed(1)} ug/m3 (${signed(o.changePct)}%)` : 'not modelled', 'Simulation'],
          ['If only half the effect is achieved', o.modelledEffect && o.lowPm25 !== null ? `${o.lowPm25.toFixed(1)} ug/m3 (${signed(o.lowPct)}%)` : 'not modelled', 'Simulation'],
          ['Zones improved by 0.5 ug/m3 or more', String(o.zonesImproved), 'Simulation'],
        ],
      },
    ],
    bullets: [
      'The result is the prototype engine\'s RELATIVE change for this area applied to its current model value. The engine is rule-based and uncalibrated.',
      ...(o.dust ? ['NOT modelled: the effect of dust control. It is costed and scheduled and must be judged from readings on Day 7 and Day 14.'] : []),
      ...(o.options.some((x) => x.type === 'trees') ? ['Tree benefit is for mature trees (years), not the first season.'] : []),
      ...(o.closure ? ['Traffic that moves to other roads is only partly represented; a closure can worsen conditions elsewhere.'] : []),
      ...o.options.flatMap((x) => x.limitations.slice(0, 2)),
      'Health outcomes are not estimated.',
    ],
  });

  const G = sec('G', 'Before and after', {
    tables: [
      {
        head: ['Point in time', 'PM2.5 (ug/m3)', 'Status', 'How known'],
        body: [
          ['Before (now)', o.currentPm25 !== null ? o.currentPm25.toFixed(1) : 'n/a', 'Estimated', `Model data, ${formatIst(zone.time)}`],
          ['After (simulated)', o.modelledEffect && o.projectedPm25 !== null ? o.projectedPm25.toFixed(1) : 'not modelled', 'Simulation', 'Prototype rule model'],
          ['After, half effect', o.modelledEffect && o.lowPm25 !== null ? o.lowPm25.toFixed(1) : 'not modelled', 'Simulation', 'Prototype rule model'],
          ['Day 7 check', '__________', 'Measured', 'Nearest station or portable monitor; record here'],
          ['Day 14 check', '__________', 'Measured', 'Nearest station or portable monitor; record here'],
        ],
      },
    ],
    paragraphs: [
      'Measured values replace the simulated ones once they exist. If no nearby station has a current feed, use a portable monitor or restore the station before judging the result.',
    ],
  });

  const H = sec('H', 'Implementation timeline', { tables: [timeline(o)] });

  const measureCount = o.options.length + (o.closure ? 1 : 0) + (o.dust ? 1 : 0);
  const I = sec('I', 'Final recommendations', {
    bullets: [
      `Approve the plan for ${zone.place}: ${o.measures.join('; ')}. Total ${inr(o.total)} (one-time ${inr(o.oneTime)}, first-year running ${inr(o.recurring)}) over about ${o.weeks} week${o.weeks === 1 ? '' : 's'}.`,
      measureCount > 1 && o.modelledEffect ? 'Start with the measures that can begin in week 1 and review the Day 7 and Day 14 readings before committing the longer-running ones.' : 'Review the Day 7 and Day 14 readings before extending the measure.',
      anyCurrent ? 'Use the nearest station with a current reading for the Day 7 and Day 14 checks.' : 'Restore or add a data feed at the nearest station before the programme starts so the result can be measured.',
      'Re-run this report after the next model update; the situation and the ranking change with the weather.',
      NO_APPORTIONMENT,
    ],
  });

  const when = formatIst(generated.getTime());
  return {
    title: `AeroMatrix Commissioner report: ${zone.place}`,
    subtitle: input.scenarioName ? `Scenario: ${input.scenarioName}` : 'Costed implementation report',
    generatedText: `Generated ${when}`,
    statuses: [
      'Estimated: Open-Meteo CAMS model data with the CPCB AQI method, about 40 km resolution; not an official station AQI.',
      'Measured / Outdated: station readings, always shown with their dates; bundled readings are historical.',
      'Forecast: model outlook; no published error band for this location.',
      'Simulation: result of the uncalibrated prototype rule model; hypothetical.',
    ],
    sections: [A, B, C, D, E, F, G, H, I],
  };
}

export function reportFileName(input: ReportInput): string {
  const slug = input.zone.place.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'area';
  return `aeromatrix-report-${slug}-${input.generated.toISOString().slice(0, 10)}.pdf`;
}

const MARGIN = 14;
const PAGE_BOTTOM = 280;

function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  const k = size / 64;
  doc.setFillColor(163, 38, 63);
  doc.circle(x + 32 * k, y + 32 * k, 30 * k, 'F');
  doc.setDrawColor(251, 245, 233);
  doc.setLineWidth(2.5 * k);
  doc.circle(x + 32 * k, y + 32 * k, 22 * k, 'S');
  doc.setLineWidth(4 * k);
  doc.lines(
    [
      [6 * k, -12 * k, 12 * k, -12 * k, 18 * k, 0],
      [6 * k, 12 * k, 12 * k, 12 * k, 18 * k, 0],
    ],
    x + 14 * k,
    y + 36 * k,
    [1, 1],
    'S',
    false,
  );
  doc.setFillColor(251, 245, 233);
  doc.circle(x + 32 * k, y + 22 * k, 3.2 * k, 'F');
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
}

export function buildReportPdf(input: ReportInput): jsPDF {
  const c = reportContent(input);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const autoTable = resolveAutoTable();
  let y = 16;

  drawMark(doc, MARGIN, y - 4, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(pdfSafe(c.title), MARGIN + 18, y + 3, { maxWidth: 160 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(pdfSafe(`${c.subtitle}. ${c.generatedText}.`), MARGIN + 18, y + 9);
  doc.setTextColor(0);
  y += 20;

  const ensure = (need: number) => {
    if (y + need > PAGE_BOTTOM) {
      doc.addPage();
      y = 18;
    }
  };
  const para = (text: string, bullet = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(pdfSafe(bullet ? `- ${text}` : text), 182) as string[];
    ensure(lines.length * 4 + 2);
    doc.text(lines, MARGIN, y + 3.5);
    y += lines.length * 4 + 1.5;
  };
  const table = (t: ReportTable) => {
    ensure(20);
    autoTable(doc, {
      startY: y,
      head: [t.head.map(pdfSafe)],
      body: t.body.map((r) => r.map(pdfSafe)),
      foot: t.foot ? [t.foot.map(pdfSafe)] : undefined,
      margin: { left: MARGIN, right: MARGIN, bottom: 20 },
      styles: { fontSize: 8, cellPadding: 1.6, overflow: 'linebreak' },
      headStyles: { fillColor: [163, 38, 63] },
      footStyles: { fillColor: [240, 230, 215], textColor: 20 },
      showFoot: 'lastPage',
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('How to read the labels', MARGIN, y);
  y += 1;
  for (const s of c.statuses) para(s, true);
  y += 2;

  for (const s of c.sections) {
    ensure(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(163, 38, 63);
    doc.text(pdfSafe(`${s.id}. ${s.title}`), MARGIN, y + 4);
    doc.setTextColor(0);
    y += 7;
    for (const p of s.paragraphs) para(p);
    for (const t of s.tables) table(t);
    for (const b of s.bullets) para(b, true);
    y += 3;
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(pdfSafe(`AeroMatrix Commissioner. ${c.generatedText}. Estimated, Forecast and Simulation are model results.`), MARGIN, 289, { maxWidth: 160 });
    doc.text(`Page ${i} of ${pages}`, 196, 289, { align: 'right' });
    doc.setTextColor(0);
  }
  return doc;
}

export function downloadReport(input: ReportInput): void {
  buildReportPdf(input).save(reportFileName(input));
}
