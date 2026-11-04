/**
 * The content of the Commissioner's intervention report, built as plain data (sections made of blocks) so the same
 * content feeds the PDF, the in-app preview and the tests. Nothing here is invented: a chart without data says so.
 */
import { PRICES, formatINR } from '../../plan/costModel';
import { subindexFor } from '../../services/cpcbAqi';
import { aqiName } from '../../services/cpcbAqi';
import { POLLUTANT_KEYS, POLLUTANT_NAME, POLLUTANT_UNIT, categoryRank, colorOf, type AqiCategory, type CitySummary, type PollutantKey, type ZoneRow } from '../lib/airdata';
import { sharesFor, projectShares, type ApportionmentLoad, type SourceShare } from '../lib/apportionment';
import { COST_GROUPS, costBreakdown, runningRates } from '../lib/costs';
import { addDaysIst, formatAge, formatIst, signed } from '../lib/format';
import { summariseWeek, weekTrend, type DailyPoint } from '../lib/history';
import type { SimOutcome } from '../lib/measures';
import { DEPARTMENTS, departmentsFor, type CauseKey } from '../lib/routing';
import { STATUS_LABEL, type StationRow } from '../lib/stations';
import { topCause } from '../lib/alerts';
import type { NetworkPlan } from '../lib/network';

export interface ReportInput {
  generated: Date;
  zone: ZoneRow;
  city: CitySummary | null;
  /** nearest monitoring stations with their distance */
  stations: Array<{ station: StationRow; km: number }>;
  outcome: SimOutcome;
  scenarioName?: string;
  apportionment: ApportionmentLoad;
  /** the last seven days for this area, when it could be fetched */
  daily: DailyPoint[] | null;
  /** the proposed AeroMatrix device network for the area, with its satellite picture and the logo when they could be loaded */
  network?: NetworkPlan | null;
  networkImage?: string | null;
  logo?: string | null;
}

export interface PieSlice {
  label: string;
  percent: number;
  color: string;
}

export interface BarItem {
  label: string;
  value: number;
  color: string;
}

export type ChartSpec =
  | { kind: 'pie'; title: string; slices: PieSlice[]; caption: string }
  | { kind: 'bars'; title: string; unit: string; bars: BarItem[]; caption: string; decimals: number }
  | { kind: 'none'; title: string; message: string };

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'table'; head: string[]; body: string[][]; foot?: string[] }
  | { t: 'charts'; specs: ChartSpec[] }
  | { t: 'note'; text: string }
  | { t: 'network'; plan: NetworkPlan; image: string | null; logo: string | null };

export interface ReportSection {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';
  title: string;
  blocks: Block[];
}

export interface ReportContent {
  title: string;
  subtitle: string;
  generatedText: string;
  meta: Array<[string, string]>;
  sections: ReportSection[];
  appendix: { title: string; blocks: Block[] };
}

export const NO_PIE_MESSAGE = 'A source-contribution chart cannot be generated yet: no source-apportionment study is available for this area. It will appear here once one is provided.';

/** The US EPA health description of each category. */
export const CPCB_IMPACT: Record<AqiCategory, string> = {
  Good: 'Air quality is satisfactory and poses little or no risk.',
  Satisfactory: 'Acceptable, but a few unusually sensitive people may be affected.',
  Moderate: 'Members of sensitive groups may experience health effects.',
  Poor: 'Everyone may begin to experience health effects; sensitive groups may feel more serious effects.',
  'Very Poor': 'Health alert: everyone may experience more serious health effects.',
  Severe: 'Health warning of emergency conditions: everyone is likely to be affected.',
};

const PIE_COLORS = ['#a3263f', '#e0a100', '#2fae8b', '#4a6fa5', '#8c1d5e', '#9a8a80', '#f08c1a', '#5b8c5a'];

const SEVERITY_WORD = (c: AqiCategory): string => (categoryRank(c) >= categoryRank('Very Poor') ? 'Critical' : c === 'Poor' ? 'High' : c === 'Moderate' ? 'Moderate' : 'Low');
const plain = (s: string): string => s.replace(/₂/g, '2').replace(/₃/g, '3').replace(/·/g, '-');
const inr = (v: number) => formatINR(v);
const qty = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }));

/** Day 1 is tomorrow (IST): the report is read today and work starts next day. */
export function dayDate(generated: Date, day: number): string {
  return addDaysIst(generated.getTime(), day);
}

export interface ScheduleItem {
  label: string;
  startDay: number;
  endDay: number;
  note: string;
  department: string;
}

/** When each selected measure starts and how long it runs (planning assumptions, stated as such). */
export function schedule(o: SimOutcome): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  const sel = o.selection;
  if (sel.traffic !== 'off') {
    const weeks = sel.traffic === 'intensive' ? 10 : 6;
    out.push({ label: o.options.find((x) => x.type === 'traffic')?.label ?? 'Traffic enforcement', startDay: 3, endDay: 2 + weeks * 7, note: `${weeks} weeks to install, then enforcement continues through the first year`, department: DEPARTMENTS.traffic.name });
  }
  if (o.closure) out.push({ label: `Close ${o.closure.roadName}`, startDay: 2, endDay: 31, note: '30 days, then review', department: `${DEPARTMENTS.traffic.name}; ${DEPARTMENTS.roads.name}` });
  const ind = o.options.find((x) => x.type === 'industry');
  if (ind) out.push({ label: ind.label, startDay: 3, endDay: 2 + 12 * 7, note: '12 weeks for notices, quotations, installation and testing', department: DEPARTMENTS.industry.name });
  const trees = o.options.find((x) => x.type === 'trees');
  if (trees) out.push({ label: trees.label, startDay: 5, endDay: 4 + 8 * 7, note: '8 weeks to plant, then watering through the first year', department: DEPARTMENTS.garden.name });
  if (o.dust) out.push({ label: 'Dust control by water sprinkling', startDay: 2, endDay: 1 + o.dust.days, note: `${o.dust.days} days, readings checked on Day 7 and Day 14`, department: `${DEPARTMENTS.construction.name}; ${DEPARTMENTS.roads.name}` });
  return out;
}

/** Why each kind of measure is recommended here, from the evidence the data gives. */
function whyFor(zone: ZoneRow, type: 'traffic' | 'trees' | 'industry' | 'closure' | 'dust'): string {
  const has = (k: string) => zone.causes.find((c) => c.key === k);
  switch (type) {
    case 'traffic':
    case 'closure': {
      const c = has('traffic');
      return c ? `Road traffic is a ${c.strength.toLowerCase()} likely factor: ${c.evidence[0]}.` : 'Cuts vehicle emissions where the air is poorest.';
    }
    case 'industry': {
      const c = has('industry');
      return c ? `Industry is a ${c.strength.toLowerCase()} likely factor: ${c.evidence[0]}.` : 'Cuts emissions from the industrial units in the area.';
    }
    case 'dust': {
      const c = has('dust');
      return c ? `${c.evidence[0]}.` : 'Settles road dust, which adds to coarse particles.';
    }
    default:
      return 'Adds green cover, which lowers local PM2.5 slowly as the trees mature.';
  }
}

function pieSpec(title: string, shares: SourceShare[], caption: string): ChartSpec {
  return { kind: 'pie', title, slices: shares.map((s, i) => ({ label: s.label, percent: s.percent, color: PIE_COLORS[i % PIE_COLORS.length] })), caption };
}

/** The simulated AQI when the PM2.5 sub-index is the only one that moves (supported only when PM2.5 is in the AQI). */
export function projectedAqi(zone: ZoneRow, projectedPm25: number | null): number | null {
  if (projectedPm25 === null) return null;
  const pm = zone.subindices.find((s) => s.pollutant === 'pm25');
  if (!pm) return null;
  const sub = subindexFor('pm25', projectedPm25);
  if (sub.kind !== 'ok') return null;
  const others = zone.subindices.filter((s) => s.pollutant !== 'pm25').map((s) => s.value);
  return Math.min(zone.aqi, Math.max(sub.value, ...others));
}

export function reportContent(input: ReportInput): ReportContent {
  const { zone, outcome: o, generated, daily } = input;
  const place = zone.place;
  const dominant = (zone.dominant ?? 'pm25') as PollutantKey;
  const domName = POLLUTANT_NAME[dominant] ?? dominant.toUpperCase();
  const domValue = zone.values[dominant];
  const cause = topCause(zone.causes);
  const causeKey: CauseKey = cause?.key ?? 'general';
  const week = daily ? summariseWeek(daily) : null;
  const trend = daily ? weekTrend(daily) : null;
  const when = formatIst(generated.getTime());
  const sched = schedule(o);
  const costs = costBreakdown(o.lines);
  const rates = runningRates(o.recurring, o.dust);
  const anyCurrent = input.stations.some((x) => x.station.status === 'live');
  const shares = sharesFor(input.apportionment, place);
  const aqiAfter = o.modelledEffect ? projectedAqi(zone, o.projectedPm25) : null;
  const firstDay = dayDate(generated, 1);
  const severity = SEVERITY_WORD(zone.category);
  const approveBy = addDaysIst(generated.getTime(), categoryRank(zone.category) >= categoryRank('Very Poor') ? 1 : zone.category === 'Poor' ? 2 : 5);

  // ---- A. Executive summary ----
  const whyNow: string[] = [`The air quality category is ${aqiName(zone.category)}. ${CPCB_IMPACT[zone.category]}`];
  const worse = zone.forecast.find((f) => categoryRank(f.category) > categoryRank(zone.category));
  if (worse) whyNow.push(`The forecast reaches ${aqiName(worse.category)} (AQI ${worse.aqi}) within ${worse.hours} hours.`);
  if (zone.trend === 'up') whyNow.push(`PM2.5 has risen ${Math.round(zone.trendPct)}% over the last six hours.`);
  if (week && week.poorDays > 0) whyNow.push(`The area was Poor or worse on ${week.poorDays} of the last ${week.days} days.`);
  else if (week && week.moderateDays >= 4) whyNow.push(`The area was Moderate or worse on ${week.moderateDays} of the last ${week.days} days.`);

  const A: ReportSection = {
    id: 'A',
    title: 'Executive summary',
    blocks: [
      {
        t: 'table',
        head: ['', ''],
        body: [
          ['Problem identified', `${domName} pollution in ${place}`],
          ['Affected location', place],
          ['Current condition', `AQI ${zone.aqi} (${aqiName(zone.category)}), estimated from model data, ${when.replace(/, \d\d:\d\d IST$/, '')}`],
          ['Main pollutant', domValue !== undefined ? `${domName}, ${domValue < 10 ? domValue.toFixed(1) : Math.round(domValue)} ${POLLUTANT_UNIT[dominant]}` : domName],
          ['Severity', severity],
          ['Recommended intervention', o.measures.join('; ')],
          ['Cost', `${inr(o.oneTime)} one-time, ${inr(o.recurring)} running in the first year`],
          ['Time to implement', `${o.weeks} week${o.weeks === 1 ? '' : 's'}`],
        ],
      },
      { t: 'h', text: 'Why action is recommended now' },
      { t: 'list', items: whyNow },
      { t: 'note', text: 'Values marked Estimated are modelled from satellite-based air-quality data at about 40 km resolution; they are not official station readings. Simulated results are estimates, not guaranteed outcomes.' },
    ],
  };

  // ---- B. Current situation and reasons ----
  const concRows = POLLUTANT_KEYS.filter((k) => zone.values[k] !== undefined).map((k) => [POLLUTANT_NAME[k], `${(zone.values[k] as number) < 10 ? (zone.values[k] as number).toFixed(1) : Math.round(zone.values[k] as number)} ${POLLUTANT_UNIT[k]}`, 'Estimated']);
  const stationRows = input.stations.map(({ station: s, km }) => [
    s.name,
    `${km.toFixed(1)} km`,
    STATUS_LABEL[s.status],
    s.readings.length > 0 ? `${s.aqi ? `AQI ${s.aqi.value} (${aqiName(s.aqi.category)}); ` : ''}${formatIst(s.lastReadingAt)} (${formatAge(s.ageMs)})` : s.estimate ? `No reading; estimate AQI ${s.estimate.aqi}` : 'No reading',
  ]);
  const B: ReportSection = {
    id: 'B',
    title: 'Current situation and reasons',
    blocks: [
      { t: 'h', text: 'Pollutant levels now' },
      { t: 'table', head: ['Pollutant', 'Level', 'Status'], body: [['Air Quality Index', `${zone.aqi} (${aqiName(zone.category)})`, 'Estimated'], ...concRows, ['Trend (PM2.5, 6 hours)', zone.trend === 'flat' ? 'Steady' : `${zone.trend === 'up' ? 'Up' : 'Down'} ${Math.abs(Math.round(zone.trendPct))}%`, 'Estimated']] },
      { t: 'h', text: 'The last seven days' },
      ...(daily && week
        ? ([
            { t: 'p', text: `Average AQI ${week.meanAqi !== null ? Math.round(week.meanAqi) : 'n/a'}. Moderate or worse on ${week.moderateDays} of ${week.days} days, Poor or worse on ${week.poorDays}.${trend ? ` PM2.5 over the week: ${trend.direction === 'flat' ? 'steady' : `${trend.direction} ${Math.abs(Math.round(trend.pct))}%`}.` : ''}` },
            {
              t: 'charts',
              specs: [
                {
                  kind: 'bars',
                  title: 'Daily PM2.5, last 7 days',
                  unit: 'µg/m³',
                  decimals: 0,
                  caption: 'Estimated from model data. Bar colour is the AQI category of that day.',
                  bars: daily.filter((d) => d.pm25 !== null).map((d) => ({ label: `${d.date.slice(8)}/${d.date.slice(5, 7)}`, value: d.pm25 as number, color: colorOf(d.category) })),
                },
              ],
            },
          ] as Block[])
        : ([{ t: 'p', text: 'Weekly history could not be retrieved for this report.' }] as Block[])),
      { t: 'h', text: 'Likely contributing factors' },
      ...(zone.causes.length > 0
        ? ([{ t: 'table', head: ['Factor', 'Strength', 'Evidence'], body: zone.causes.map((c) => [c.label, c.strength, c.evidence.join('. ')]) }] as Block[])
        : ([{ t: 'p', text: 'No contributing factor is supported by the available data.' }] as Block[])),
      { t: 'note', text: 'Construction activity, RMC plants and waste burning are not assessed because no data is available for them.' },
      { t: 'h', text: 'Affected area and nearby stations' },
      { t: 'p', text: `${place}. ${anyCurrent ? 'At least one nearby station has a current reading.' : 'No nearby station has a current reading, so the figures above are estimates.'}` },
      ...(stationRows.length > 0 ? ([{ t: 'table', head: ['Station', 'Distance', 'Status', 'Latest reading'], body: stationRows }] as Block[]) : []),
      { t: 'h', text: 'Sources of pollution' },
      {
        t: 'charts',
        specs: [
          shares
            ? pieSpec('Estimated source contribution (now)', shares.shares, `Source: ${input.apportionment.status === 'loaded' ? input.apportionment.data.study : ''}${input.apportionment.status === 'loaded' && input.apportionment.data.year ? ` (${input.apportionment.data.year})` : ''}. Scope: ${shares.scope}. Shares of ${input.apportionment.status === 'loaded' ? input.apportionment.data.pollutant : 'PM2.5'}.`)
            : { kind: 'none', title: 'Source contribution', message: NO_PIE_MESSAGE },
        ],
      },
    ],
  };
  if (input.network) {
    const net = input.network;
    B.blocks.push(
      { t: 'h', text: 'Proposed AeroMatrix sensor network' },
      {
        t: 'p',
        text: net.hub
          ? `${net.devices.length} AeroMatrix devices (D1 to D${net.devices.length}) are proposed inside ${place}. They report to the nearest ${net.hub.kind === 'namp' ? 'manual monitoring centre (NAMP)' : 'continuous monitoring station (CAAQMS)'}, ${net.hub.name}, ${net.hub.km.toFixed(1)} km away, and the combined data feeds the AeroMatrix model.`
          : `${net.devices.length} AeroMatrix devices (D1 to D${net.devices.length}) are proposed inside ${place}. No official monitoring station was found nearby, so they would report directly to the AeroMatrix model.`,
      },
      { t: 'network', plan: net, image: input.networkImage ?? null, logo: input.logo ?? null },
      { t: 'note', text: 'Device positions are an illustrative starting layout, not a surveyed site plan. Exact sites need a field visit.' },
    );
  }

  // ---- C. Recommended corrective measures ----
  const measureRows: string[][] = [];
  const dept = (k: CauseKey) => departmentsFor(k).map((d) => d.name).join('; ');
  for (const opt of o.options) {
    const s = sched.find((x) => x.label === opt.label);
    const dep = opt.type === 'traffic' ? DEPARTMENTS.traffic.name : opt.type === 'industry' ? DEPARTMENTS.industry.name : DEPARTMENTS.garden.name;
    measureRows.push([
      opt.label,
      whyFor(zone, opt.type),
      dep,
      opt.type === 'industry' ? opt.location : place,
      s ? `Day ${s.startDay} (${dayDate(generated, s.startDay)})` : 'Day 1',
      s?.note ?? '',
      resourcesFor(o, opt.type),
      opt.lines.length > 0 ? `${inr(opt.oneTime)} one-time + ${inr(opt.recurring)} first year` : 'Not available',
    ]);
  }
  if (o.closure) {
    const s = sched.find((x) => x.label.startsWith('Close '));
    measureRows.push([`Close ${o.closure.roadName}`, whyFor(zone, 'closure'), `${DEPARTMENTS.traffic.name}; ${DEPARTMENTS.roads.name}`, o.closure.roadName, `Day ${s?.startDay ?? 2} (${dayDate(generated, s?.startDay ?? 2)})`, s?.note ?? '', '4 signs, 2 traffic marshals', `${inr(o.closure.oneTime)} one-time + ${inr(o.closure.recurring)} for 30 days`]);
  }
  if (o.dust) {
    const s = sched.find((x) => x.label.startsWith('Dust'));
    measureRows.push(['Dust control by water sprinkling', whyFor(zone, 'dust'), `${DEPARTMENTS.construction.name}; ${DEPARTMENTS.roads.name}`, o.dust.roads.map((r) => r.name).join(', ') || place, `Day ${s?.startDay ?? 2} (${dayDate(generated, s?.startDay ?? 2)})`, s?.note ?? '', `${o.dust.tankers} tanker${o.dust.tankers === 1 ? '' : 's'}, crew of ${o.dust.crew}`, `${inr(o.dust.total)} for ${o.dust.days} days`]);
  }
  const C: ReportSection = {
    id: 'C',
    title: 'Recommended corrective measures',
    blocks: [
      ...measureRows.flatMap((r, i): Block[] => [
        { t: 'h', text: `${i + 1}. ${r[0]}` },
        {
          t: 'table',
          head: ['', ''],
          body: [
            ['What to do', r[0]],
            ['Why', r[1]],
            ['Who to inform', r[2]],
            ['Where', r[3]],
            ['When to begin', r[4]],
            ['How long', r[5]],
            ['Resources', r[6]],
            ['Cost', r[7]],
          ],
        },
      ]),
      { t: 'note', text: `Departments are suggestions based on the likely cause (${dept(causeKey)}). The Commissioner decides who receives each instruction.` },
    ],
  };

  // ---- D. Detailed operational instructions ----
  const D: ReportSection = { id: 'D', title: 'Detailed operational instructions', blocks: operations(o, place, generated) };

  // ---- E. Cost breakdown ----
  const usedIds = [...new Set(o.lines.map((l) => l.priceId))];
  const E: ReportSection = {
    id: 'E',
    title: 'Cost breakdown',
    blocks: [
      { t: 'h', text: 'By category' },
      {
        t: 'table',
        head: ['Category', 'One-time', 'Running (first year)', 'Total'],
        body: COST_GROUPS.map((g) => {
          const row = costs.groups.find((x) => x.group === g);
          return [g, inr(row?.oneTime ?? 0), inr(row?.running ?? 0), inr(row?.total ?? 0)];
        }),
        foot: ['Total estimated cost', inr(costs.oneTime), inr(costs.running), inr(costs.total)],
      },
      { t: 'p', text: 'Water for dust control and tree watering is delivered by tanker; its cost is included in the tanker trip price.' },
      { t: 'h', text: 'Running cost' },
      {
        t: 'table',
        head: ['Per day', 'Per week', 'Per month (30 days)'],
        body: [[inr(rates.perDay), inr(rates.perWeek), inr(rates.perMonth)]],
      },
      ...(rates.basis.length > 0 ? ([{ t: 'list', items: rates.basis }] as Block[]) : []),
      { t: 'h', text: 'Itemised calculation' },
      {
        t: 'table',
        head: ['Item', 'Quantity', 'Unit price', 'Amount', 'Basis'],
        body: o.lines.map((l) => [`${l.item}${l.note ? ` (${l.note})` : ''}`, `${qty(l.quantity)} ${l.unit}`, inr(l.unitPrice), inr(l.total), `${l.kind === 'sourced' ? 'Sourced' : 'Estimate *'}, ${l.recurring ? 'first year' : 'one-time'}`]),
        foot: ['Total', '', '', inr(costs.total), ''],
      },
      ...(o.costNotes.length > 0 ? o.costNotes.map((n): Block => ({ t: 'note', text: n })) : []),
      { t: 'note', text: '* Estimate: no published price was found, so the basis is stated in the price list. Each amount is quantity multiplied by unit price, rounded to whole rupees. Quantities described as assumed are planning assumptions, not quotations. Local conditions can change them.' },
      { t: 'h', text: 'Price sources' },
      {
        t: 'list',
        items: usedIds
          .map((id) => PRICES[id])
          .filter(Boolean)
          .map((p) => (p.kind === 'sourced' && p.source ? `${p.item}: ${p.source.name} (${p.source.url}), accessed ${p.source.accessed}. ${p.source.note}` : `${p.item}: Estimate *. ${p.basis ?? ''}`)),
      },
    ],
  };

  // ---- F. Expected outcomes ----
  const projected = shares && projectShares(shares.shares, zone.pm25 ?? 0, o.cuts);
  const F: ReportSection = {
    id: 'F',
    title: 'Expected outcomes',
    blocks: [
      ...(o.modelledEffect && o.projectedPm25 !== null && o.currentPm25 !== null && o.lowPm25 !== null
        ? ([
            {
              t: 'table',
              head: ['', 'Now', 'Expected', 'If half the effect'],
              body: [
                ['PM2.5 (µg/m³)', o.currentPm25.toFixed(1), `${o.projectedPm25.toFixed(1)} (${signed(o.changePct, 0)}%)`, `${o.lowPm25.toFixed(1)} (${signed(o.lowPct, 0)}%)`],
                ['AQI', `${zone.aqi}`, aqiAfter !== null ? `${aqiAfter}` : 'Not supported', 'Not supported'],
                ['Areas improved by 0.5 µg/m³ or more', '-', `${o.zonesImproved}`, '-'],
              ],
            },
          ] as Block[])
        : ([{ t: 'p', text: 'The selected measures have no modelled effect on PM2.5, so no reduction is projected. They are costed and scheduled, and their effect should be judged from readings on Day 7 and Day 14.' }] as Block[])),
      { t: 'h', text: 'Expected timeline' },
      { t: 'p', text: `First effects can be checked on Day 7 (${dayDate(generated, 7)}) and Day 14 (${dayDate(generated, 14)}). Full implementation takes about ${o.weeks} week${o.weeks === 1 ? '' : 's'}.` },
      { t: 'h', text: 'Operational benefits' },
      { t: 'list', items: benefits(o) },
      { t: 'h', text: 'Source contribution after the intervention' },
      {
        t: 'charts',
        specs: [
          projected
            ? pieSpec('Projected source contribution (after)', projected.shares, 'Only traffic and industry measures are applied to the study shares; other sources are unchanged. A projection, not a guarantee.')
            : { kind: 'none', title: 'Projected source contribution', message: shares ? 'A projection cannot be made: none of the selected measures acts on a source in the study.' : NO_PIE_MESSAGE },
        ],
      },
      { t: 'note', text: 'These are modelled projections from a scenario model, not guaranteed improvements. Actual results depend on weather, enforcement and local conditions, and should be confirmed with measured readings.' },
    ],
  };

  // ---- G. Before-and-after comparison ----
  const G: ReportSection = {
    id: 'G',
    title: 'Before and after',
    blocks: [
      {
        t: 'charts',
        specs: [
          o.modelledEffect && o.currentPm25 !== null && o.projectedPm25 !== null && o.lowPm25 !== null
            ? {
                kind: 'bars',
                title: 'PM2.5 now and expected',
                unit: 'µg/m³',
                decimals: 1,
                caption: 'Now is estimated from model data. Expected values are simulations.',
                bars: [
                  { label: 'Now', value: o.currentPm25, color: '#9a8a80' },
                  { label: 'If half the effect', value: o.lowPm25, color: '#d9a441' },
                  { label: 'Expected', value: o.projectedPm25, color: '#2fae8b' },
                ],
              }
            : { kind: 'none', title: 'PM2.5 now and expected', message: 'No modelled change to compare for the selected measures.' },
          {
            kind: 'bars',
            title: 'Proposed cost by category',
            unit: '₹',
            decimals: 0,
            caption: 'One-time plus first-year running cost.',
            bars: costs.groups.map((g, i) => ({ label: g.group.split(' ')[0], value: g.total, color: PIE_COLORS[i % PIE_COLORS.length] })),
          },
        ],
      },
      {
        t: 'charts',
        specs: [
          shares ? pieSpec('Source contribution: now', shares.shares, 'From the source-apportionment study.') : { kind: 'none', title: 'Source contribution: now', message: NO_PIE_MESSAGE },
          projected ? pieSpec('Source contribution: after', projected.shares, 'Projected; traffic and industry measures only.') : { kind: 'none', title: 'Source contribution: after', message: shares ? 'No projection for the selected measures.' : NO_PIE_MESSAGE },
        ],
      },
      { t: 'h', text: 'Measured check' },
      {
        t: 'table',
        head: ['When', 'PM2.5 (µg/m³)', 'Status', 'Source'],
        body: [
          ['Before (now)', o.currentPm25 !== null ? o.currentPm25.toFixed(1) : 'n/a', 'Estimated', `Model data, ${when}`],
          ['Expected', o.modelledEffect && o.projectedPm25 !== null ? o.projectedPm25.toFixed(1) : 'Not modelled', 'Simulation', 'Scenario model'],
          [`Day 7 (${dayDate(generated, 7)})`, '__________', 'Measured', 'Nearest station or portable monitor'],
          [`Day 14 (${dayDate(generated, 14)})`, '__________', 'Measured', 'Nearest station or portable monitor'],
        ],
      },
      { t: 'note', text: 'Record the measured values on Day 7 and Day 14. They replace the simulated figures.' },
    ],
  };

  // ---- H. Implementation timeline ----
  const H: ReportSection = { id: 'H', title: 'Implementation timeline', blocks: timelineBlocks(o, sched, generated) };

  // ---- I. Final recommendations ----
  const I: ReportSection = {
    id: 'I',
    title: 'Final recommendations',
    blocks: [
      {
        t: 'table',
        head: ['', ''],
        body: [
          ['What to do', o.measures.join('; ')],
          ['Why', `${domName} is ${aqiName(zone.category)} in ${place}. ${CPCB_IMPACT[zone.category]}`],
          ['Who to inform', unique(sched.flatMap((s) => s.department.split('; '))).join('; ') || dept(causeKey)],
          ['Estimated cost', `${inr(costs.total)} (${inr(costs.oneTime)} one-time, ${inr(costs.running)} first-year running)`],
          ['Expected outcome', o.modelledEffect && o.projectedPm25 !== null ? `PM2.5 about ${o.projectedPm25.toFixed(1)} µg/m³ from ${o.currentPm25?.toFixed(1)} (${signed(o.changePct, 0)}%), a modelled estimate` : 'Effect to be confirmed by readings on Day 7 and Day 14'],
          ['Recommended deadline', `Decide by ${approveBy}; start on ${firstDay}`],
        ],
      },
    ],
  };

  return {
    title: `Intervention report: ${place}`,
    subtitle: input.scenarioName ? `Scenario: ${input.scenarioName}` : 'Costed implementation plan',
    generatedText: `Generated ${when}`,
    meta: [
      ['Prepared for', 'Municipal Commissioner, Pune and Pimpri-Chinchwad'],
      ['Area', place],
      ['Generated', when],
      ['Data', `Model update ${formatIst(zone.time)}`],
    ],
    sections: [A, B, C, D, E, F, G, H, I],
    appendix: {
      title: 'Data quality and assumptions',
      blocks: [
        {
          t: 'table',
          head: ['Label', 'Meaning'],
          body: [
            ['Measured', 'A station reading from the last few hours.'],
            ['Outdated', 'A real station reading that is not current; its date is shown.'],
            ['Estimated', 'Estimated from model data (CAMS) with the CPCB AQI method, about 40 km resolution. Not an official station reading.'],
            ['Forecast', 'A forecast from a model, with no published error band for this location.'],
            ['Simulation', 'A modelled what-if result from a scenario model. Not a guaranteed outcome.'],
          ],
        },
        {
          t: 'list',
          items: [
            'Neighbouring areas can share one model value because of the coarse model grid.',
            'Likely factors come from mapped roads and industry near the area and from the PM2.5/PM10 ratio. They are indications, not a measured breakdown.',
            'Simulated changes are relative changes applied to the current estimated value. Dust control is not modelled; it is costed and checked by readings.',
            'Implementation periods, quantities of labour, vehicles and materials, and operating rates are planning assumptions, stated where used.',
            'Prices come from the AeroMatrix price list; sourced items name their source and estimates are marked *.',
          ],
        },
      ],
    },
  };
}

const unique = <T,>(a: T[]): T[] => [...new Set(a)];

function resourcesFor(o: SimOutcome, type: 'traffic' | 'trees' | 'industry'): string {
  const opt = o.options.find((x) => x.type === type);
  if (!opt) return '';
  if (type === 'traffic') return `${opt.quantity} ANPR cameras, ${opt.quantity * 2} signs, enforcement staff`;
  if (type === 'trees') return `${opt.quantity} saplings with guards and compost, tempo trips, watering tankers`;
  return `${opt.quantity} unit${opt.quantity === 1 ? '' : 's'}: ${opt.location}`;
}

function benefits(o: SimOutcome): string[] {
  const out = ['A costed, scheduled plan the concerned departments can start on.', 'Fixed review points on Day 7 and Day 14 to confirm the effect with readings.'];
  if (o.options.some((x) => x.type === 'traffic')) out.push('Camera records of traffic violations in the area.');
  if (o.options.some((x) => x.type === 'industry')) out.push('Inspection and compliance records for the industrial units.');
  if (o.options.some((x) => x.type === 'trees')) out.push('More green cover that keeps benefiting the area for years.');
  if (o.dust) out.push('Less settled dust on the main roads and a daily water-use schedule.');
  return out;
}

function operations(o: SimOutcome, place: string, generated: Date): Block[] {
  const out: Block[] = [];
  const step = (n: number, text: string) => `${n}. ${text}`;
  for (const opt of o.options) {
    if (opt.type === 'traffic') {
      out.push({ t: 'h', text: opt.label });
      out.push({
        t: 'list',
        items: [
          step(1, `Select ${opt.quantity} camera sites on the main roads of ${place}.`),
          step(2, `Install ${opt.quantity} ANPR cameras with poles, power and network, and ${opt.quantity * 2} traffic signs (two per camera).`),
          step(3, 'Run a public awareness campaign before enforcement starts.'),
          step(4, 'Staff the enforcement and send a weekly summary of violations and traffic to the Commissioner.'),
        ],
      });
    } else if (opt.type === 'trees') {
      out.push({ t: 'h', text: opt.label });
      out.push({
        t: 'list',
        items: [
          step(1, `Choose planting sites in ${place} with the garden authority; mark them on the map.`),
          step(2, `Plant ${qty(opt.quantity)} native saplings with tree guards and 10 kg of compost per pit.`),
          step(3, `Water every fortnight for the first year: one tanker serves about 100 trees per round.`),
          step(4, 'Record how many trees survive after 3 months and after 12 months.'),
        ],
      });
    } else {
      out.push({ t: 'h', text: opt.label });
      out.push({
        t: 'list',
        items: [
          step(1, `Units: ${opt.location}.`),
          step(2, opt.lines.length > 0 ? 'Serve compliance notices and obtain site quotations for bag filters and ducting.' : 'Serve a notice for the temporary restriction, with the start and end dates.'),
          step(3, opt.lines.length > 0 ? 'Install the filters and take a stack emission test at an approved laboratory after commissioning.' : 'Inspect each unit during the restriction to confirm that output is reduced.'),
        ],
      });
    }
  }
  if (o.closure) {
    out.push({ t: 'h', text: `Close ${o.closure.roadName}` });
    out.push({
      t: 'list',
      items: [
        step(1, `Place 4 signs at the closure and the diversion${o.closure.divertToName ? ` (traffic moves to ${o.closure.divertToName})` : ''}.`),
        step(2, 'Post 2 traffic marshals for the first 30 days.'),
        step(3, 'Check congestion on the diversion after one week and adjust.'),
      ],
    });
  }
  if (o.dust) {
    const d = o.dust;
    out.push({ t: 'h', text: 'Dust control by water sprinkling' });
    if (d.roads.length === 0) {
      out.push({ t: 'p', text: d.notes[1] });
    } else {
      out.push({
        t: 'table',
        head: ['Road', 'Stretch in the area', 'Road width', 'Water per round'],
        body: d.roads.map((r) => [r.name, `${r.lengthKm.toFixed(1)} km`, `${Math.round((r.areaM2 / (r.lengthKm * 1000)) * 10) / 10} m`, `${Math.round(r.litresPerPass).toLocaleString('en-IN')} L`]),
      });
      out.push({
        t: 'table',
        head: ['Item', 'Detail'],
        body: [
          ['Sprinkling locations', d.roads.map((r) => `${r.name} (full ${r.lengthKm.toFixed(1)} km stretch)`).join('; ')],
          ['Time slots', d.slots.join(', ')],
          ['Frequency', `${d.slots.length} rounds a day, every day`],
          ['Water per round (all roads)', `${Math.round(d.litresPerSlot).toLocaleString('en-IN')} L`],
          ['Total water per day', `${Math.round(d.litresPerDay).toLocaleString('en-IN')} L`],
          ['Duration', `${d.days} days, from ${dayDate(generated, 2)} to ${dayDate(generated, 1 + d.days)}`],
          ['Tankers needed', `${d.tankers} (${d.tripsPerDay} trips a day)`],
          ['Manpower', `${d.crew} people (driver and helper for each tanker)`],
          ['Water and transport cost', `${inr(d.total)} for ${d.days} days (${inr(d.perDay)} a day)`],
          ['Responsible', `${DEPARTMENTS.construction.name}; ${DEPARTMENTS.roads.name}`],
        ],
      });
      out.push({ t: 'h', text: 'Assumptions used' });
      out.push({ t: 'list', items: d.assumptions.map((a) => `${a[0]}: ${a[1]}`) });
      out.push({ t: 'list', items: d.verification.map((v) => `Day ${v.day}: ${v.check}`) });
    }
  }
  if (out.length === 0) out.push({ t: 'p', text: 'No measures are selected.' });
  return out.map((b) => (b.t === 'list' ? { ...b, items: b.items.map((s) => plain(s)) } : b));
}

function timelineBlocks(o: SimOutcome, sched: ScheduleItem[], generated: Date): Block[] {
  const rows: string[][] = [
    ['Day 1', dayDate(generated, 1), 'Initial inspection and preparation: record the starting readings, brief the departments, confirm the sites.'],
    ['Day 2', dayDate(generated, 2), 'Deployment of resources: bring in tankers, crew, signs and materials.'],
  ];
  const impl = sched.filter((s) => s.startDay <= 7);
  rows.push(['Day 3 to 7', `${dayDate(generated, 3)} to ${dayDate(generated, 7)}`, impl.length > 0 ? `Implementation: ${impl.map((s) => s.label).join('; ')}.` : 'Implementation of the selected measures.']);
  rows.push(['Day 7', dayDate(generated, 7), 'Review of air-quality readings against the starting values.']);
  rows.push(['Day 8 to 13', `${dayDate(generated, 8)} to ${dayDate(generated, 13)}`, 'Continue the measures; resolve any problems found on Day 7.']);
  rows.push(['Day 14', dayDate(generated, 14), 'Effectiveness assessment: decide to continue, extend or stop.']);
  for (const s of sched.filter((x) => x.endDay > 14)) rows.push([`Day ${s.startDay} to ${s.endDay}`, `${dayDate(generated, s.startDay)} to ${dayDate(generated, s.endDay)}`, `${s.label}: ${s.note}.`]);
  return [
    { t: 'table', head: ['Day', 'Date', 'What happens'], body: rows },
    { t: 'note', text: `Day 1 is ${dayDate(generated, 1)}. Dates move if the start is delayed; the order stays the same. The full plan takes about ${o.weeks} week${o.weeks === 1 ? '' : 's'}.` },
  ];
}
