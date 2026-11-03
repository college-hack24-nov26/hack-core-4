/**
 * Road-dust control by water sprinkling, as an OPERATING PLAN with every parameter stated. The application rate, road
 * width, tanker capacity, trips per slot and crew size are planning assumptions of this app, not standards. Costs use
 * the Plan-It price table (tanker trip and unskilled labour are sourced). The effect on air quality is NOT modelled:
 * no validated response exists, so the plan is costed and scheduled and then checked against readings on Day 7 and 14.
 */
import type { BaseState, GridCell } from '../../types';
import { PRICES, line, sumLines, type CostLine } from '../../plan/costModel';
import { majorRoadsInZone } from './airdata';

export interface DustAssumptions {
  /** litres of water per square metre per pass */
  rateLPerM2: number;
  /** total paved width treated, metres (both carriageways of a major road) */
  roadWidthM: number;
  tankerCapacityL: number;
  /** filling-and-spraying trips one tanker makes in one time slot */
  tripsPerTankerPerSlot: number;
  /** people per tanker (driver and helper) */
  crewPerTanker: number;
  /** days the programme runs before the Day 14 check */
  days: number;
  slots: string[];
}

export const DEFAULT_DUST: DustAssumptions = {
  rateLPerM2: 1,
  roadWidthM: 14,
  tankerCapacityL: 10_000,
  tripsPerTankerPerSlot: 3,
  crewPerTanker: 2,
  days: 14,
  slots: ['06:00-09:00', '12:00-15:00', '16:00-19:00'],
};

export interface DustRoad {
  name: string;
  roadClass: string;
  lengthKm: number;
  areaM2: number;
  litresPerPass: number;
}

export interface VerificationStep {
  day: number;
  check: string;
}

export interface DustPlan {
  zoneName: string;
  roads: DustRoad[];
  slots: string[];
  litresPerSlot: number;
  litresPerDay: number;
  tankers: number;
  tripsPerDay: number;
  crew: number;
  days: number;
  weeks: number;
  assumptions: Array<[string, string]>;
  lines: CostLine[];
  oneTime: number;
  recurring: number;
  total: number;
  perDay: number;
  verification: VerificationStep[];
  /** always false: the effect of dust control is not modelled */
  effectModelled: false;
  notes: string[];
}

/** Named major roads through the zone, longest stretch first, lengths from OpenStreetMap. */
export function roadsInZone(base: Pick<BaseState, 'roads'>, cell: GridCell, limit = 3) {
  return majorRoadsInZone(base, cell, limit, true);
}

export function dustPlan(base: Pick<BaseState, 'roads'>, cell: GridCell, zoneName: string, a: DustAssumptions = DEFAULT_DUST): DustPlan {
  const picked = roadsInZone(base, cell, 3);
  const roads: DustRoad[] = picked.map(({ road, lengthKm }) => {
    const areaM2 = lengthKm * 1000 * a.roadWidthM;
    return { name: road.name, roadClass: road.roadClass ?? 'road', lengthKm, areaM2, litresPerPass: areaM2 * a.rateLPerM2 };
  });
  const litresPerSlot = roads.reduce((s, r) => s + r.litresPerPass, 0);
  const slots = a.slots;
  const litresPerDay = litresPerSlot * slots.length;
  const perTankerPerSlot = a.tankerCapacityL * a.tripsPerTankerPerSlot;
  const tankers = litresPerSlot > 0 ? Math.max(1, Math.ceil(litresPerSlot / perTankerPerSlot)) : 0;
  const tripsPerDay = litresPerDay > 0 ? Math.ceil(litresPerDay / a.tankerCapacityL) : 0;
  const crew = tankers * a.crewPerTanker;

  const lines: CostLine[] = [];
  if (tripsPerDay > 0) {
    lines.push(
      line(PRICES, 'tankerTrip', tripsPerDay * a.days, 'Transport', false, 1, `${tripsPerDay} tanker trips a day for ${a.days} days (assumed from ${a.tankerCapacityL.toLocaleString('en-IN')} L tankers)`),
      line(PRICES, 'labourDay', crew * a.days, 'Labour', false, 1, `${crew} crew (${a.crewPerTanker} per tanker) for ${a.days} days (assumed)`),
    );
  }
  const sums = sumLines(lines);
  const verification: VerificationStep[] = [
    { day: 7, check: 'Compare PM10 and PM2.5 readings from the nearest monitoring station (or a portable monitor) with the values recorded before the programme started.' },
    { day: 14, check: 'Repeat the comparison, record the change and decide whether to continue, extend or stop the sprinkling.' },
  ];
  return {
    zoneName,
    roads,
    slots,
    litresPerSlot,
    litresPerDay,
    tankers,
    tripsPerDay,
    crew,
    days: a.days,
    weeks: Math.ceil(a.days / 7),
    assumptions: [
      ['Application rate', `${a.rateLPerM2} L per m2 per pass (assumed)`],
      ['Treated road width', `${a.roadWidthM} m, both carriageways (assumed)`],
      ['Tanker capacity', `${a.tankerCapacityL.toLocaleString('en-IN')} L (assumed; the sourced trip price does not state a size)`],
      ['Trips per tanker per slot', `${a.tripsPerTankerPerSlot} (assumed)`],
      ['Crew per tanker', `${a.crewPerTanker} (assumed)`],
      ['Time slots', `${slots.join(', ')} (assumed)`],
    ],
    lines,
    oneTime: sums.oneTime,
    recurring: sums.recurring,
    total: sums.total,
    perDay: a.days > 0 ? Math.round(sums.total / a.days) : 0,
    verification,
    effectModelled: false,
    notes: [
      'The effect of dust control on air quality is NOT modelled: no validated response exists. The plan is costed and scheduled, and its result is judged from readings on Day 7 and Day 14.',
      roads.length === 0
        ? 'No named major road (motorway, trunk, primary or secondary) of the OpenStreetMap snapshot passes through this zone, so no sprinkling route can be proposed.'
        : 'Road lengths are the stretches of mapped major roads inside the zone (OpenStreetMap). Water supply and source are not costed.',
    ],
  };
}
