/** Cost presentation for the Commissioner: grouped lines, running-cost rates and the calculation basis. Amounts are whole rupees. */
import type { CostLine } from '../../plan/costModel';
import type { DustPlan } from './dustControl';

export type CostGroup = 'Equipment and materials' | 'Vehicles and tankers' | 'Labour' | 'Operations' | 'Maintenance';
export const COST_GROUPS: CostGroup[] = ['Equipment and materials', 'Vehicles and tankers', 'Labour', 'Operations', 'Maintenance'];

export function groupOf(l: CostLine): CostGroup {
  if (l.priceId === 'tankerTrip' || l.priceId === 'truckTrip') return 'Vehicles and tankers';
  if (l.priceId === 'labourDay' || l.priceId === 'labourMonth') return 'Labour';
  switch (l.category) {
    case 'Equipment':
    case 'Materials':
      return 'Equipment and materials';
    case 'Transport':
      return 'Vehicles and tankers';
    case 'Labour':
      return 'Labour';
    case 'Maintenance':
      return 'Maintenance';
    default:
      return 'Operations'; // Utilities, Monitoring, Outreach
  }
}

export interface CostGroupRow {
  group: CostGroup;
  oneTime: number;
  running: number;
  total: number;
  lines: CostLine[];
}

export interface CostBreakdown {
  groups: CostGroupRow[];
  oneTime: number;
  running: number;
  total: number;
}

export function costBreakdown(lines: CostLine[]): CostBreakdown {
  const groups = COST_GROUPS.map((group): CostGroupRow => ({ group, oneTime: 0, running: 0, total: 0, lines: [] }));
  for (const l of lines) {
    const row = groups.find((g) => g.group === groupOf(l))!;
    row.lines.push(l);
    if (l.recurring) row.running += l.total;
    else row.oneTime += l.total;
    row.total += l.total;
  }
  const used = groups.filter((g) => g.lines.length > 0);
  return {
    groups: used,
    oneTime: used.reduce((a, g) => a + g.oneTime, 0),
    running: used.reduce((a, g) => a + g.running, 0),
    total: used.reduce((a, g) => a + g.total, 0),
  };
}

export interface RunningRates {
  perDay: number;
  perWeek: number;
  perMonth: number;
  /** how the rates were worked out, in plain words */
  basis: string[];
}

/**
 * Daily, weekly and monthly (30-day) running cost. Running items are the first-year costs spread over 365 days; a
 * dust-control programme runs for its own number of days, so its daily cost is its total over those days.
 */
export function runningRates(recurringFirstYear: number, dust: Pick<DustPlan, 'total' | 'days'> | null): RunningRates {
  const yearly = recurringFirstYear / 365;
  const dustDaily = dust && dust.days > 0 ? dust.total / dust.days : 0;
  const perDay = Math.round(yearly + dustDaily);
  const basis: string[] = [];
  if (recurringFirstYear > 0) basis.push(`Running costs of ₹${Math.round(recurringFirstYear).toLocaleString('en-IN')} in the first year, spread over 365 days`);
  if (dust && dustDaily > 0) basis.push(`Dust control: ₹${Math.round(dust.total).toLocaleString('en-IN')} over ${dust.days} days`);
  return { perDay, perWeek: Math.round(perDay * 7), perMonth: Math.round(perDay * 30), basis };
}
