/**
 * Plan-It cost model. Prices are planning inputs only: they never touch environmental data.
 * Every price is traceable to a source OR labelled an estimate with its basis. Line totals are rounded to whole
 * rupees so every total reconciles exactly with its lines. A missing price id throws MissingPriceError and the
 * option is then left out with a note, never guessed.
 */
import type { BaseState, ScenarioParams } from '../types';

export const ACCESSED = '10 Oct 2026';

export interface PriceSource {
  name: string;
  url: string;
  accessed: string;
  note: string;
}

export interface PriceRecord {
  id: string;
  item: string;
  unit: string;
  /** INR */
  unitPrice: number;
  kind: 'sourced' | 'estimate';
  source?: PriceSource;
  basis?: string;
}

export const PRICES: Record<string, PriceRecord> = {
  sapling: {
    id: 'sapling',
    item: 'Native tree sapling (neem)',
    unit: 'sapling',
    unitPrice: 199,
    kind: 'sourced',
    source: {
      name: 'Hunarsetu, neem plant listing',
      url: 'https://www.hunarsetu.com/en/product/neem-plant-nursery',
      accessed: ACCESSED,
      note: 'Online listing; sapling height not stated; not Pune-specific.',
    },
  },
  treeGuard: {
    id: 'treeGuard',
    item: 'Mild-steel tree guard, 5–6 ft',
    unit: 'guard',
    unitPrice: 900,
    kind: 'sourced',
    source: {
      name: 'IndiaMART, Pune tree guard listings (Saai Enterprises, Sasvad)',
      url: 'https://m.indiamart.com/city/pune/tree-guard.html',
      accessed: ACCESSED,
      note: 'Seller listing; other Pune listings on the page range from ₹400 to ₹2,100.',
    },
  },
  labourDay: {
    id: 'labourDay',
    item: 'Unskilled labour, Pune',
    unit: 'person-day',
    unitPrice: 524.42,
    kind: 'sourced',
    source: {
      name: 'Maharashtra minimum wages, Zone I unskilled (DCPSOL summary of the Jul–Dec 2025 notification)',
      url: 'https://www.dcpsol.com/maharashtra-minimum-wages-july-2025',
      accessed: ACCESSED,
      note: 'Statutory minimum for Pune Municipal Corporation (Zone I); a 2026 revision was not found.',
    },
  },
  labourMonth: {
    id: 'labourMonth',
    item: 'Unskilled staff, Pune',
    unit: 'person-month',
    unitPrice: 13635,
    kind: 'sourced',
    source: {
      name: 'Maharashtra minimum wages, Zone I unskilled (DCPSOL summary of the Jul–Dec 2025 notification)',
      url: 'https://www.dcpsol.com/maharashtra-minimum-wages-july-2025',
      accessed: ACCESSED,
      note: 'Statutory monthly minimum; a 2026 revision was not found.',
    },
  },
  compost: {
    id: 'compost',
    item: 'Compost for planting pits',
    unit: 'kg',
    unitPrice: 12,
    kind: 'estimate',
    basis: 'Lower end of a ₹12–15/kg retail range reported for Bengaluru (Citizen Matters, undated). No current Pune price was found.',
  },
  tankerTrip: {
    id: 'tankerTrip',
    item: 'Water tanker delivery',
    unit: 'trip',
    unitPrice: 1200,
    kind: 'sourced',
    source: {
      name: 'Pune Pulse, report on Pune tanker rates (2026)',
      url: 'https://www.mypunepulse.com/?p=204322',
      accessed: ACCESSED,
      note: 'Price reported by a housing-society chairman; tanker size not stated; not an official rate.',
    },
  },
  truckTrip: {
    id: 'truckTrip',
    item: 'Tempo hire for saplings and guards',
    unit: 'trip',
    unitPrice: 4000,
    kind: 'estimate',
    basis: 'No quotation found; assumed one local tempo trip within Pune.',
  },
  bagFilter: {
    id: 'bagFilter',
    item: 'Bag filter (dust collector), supply',
    unit: 'unit',
    unitPrice: 600000,
    kind: 'sourced',
    source: {
      name: 'Deepti Airsystem & Fabricators, Mumbai (GlobalLinker listing)',
      url: 'https://www.globallinker.com/seller/deepti-airsystem-and-fabricators-private-limited',
      accessed: ACCESSED,
      note: 'Seller listing; capacity not stated. Actual size and price depend on the unit’s airflow.',
    },
  },
  filterBag: {
    id: 'filterBag',
    item: 'Replacement filter bag',
    unit: 'bag',
    unitPrice: 500,
    kind: 'sourced',
    source: {
      name: 'Deepti Airsystem & Fabricators, Mumbai (GlobalLinker listing)',
      url: 'https://www.globallinker.com/seller/deepti-airsystem-and-fabricators-private-limited',
      accessed: ACCESSED,
      note: 'Seller listing, minimum order 10 bags.',
    },
  },
  ductInstall: {
    id: 'ductInstall',
    item: 'Ducting, fan and installation',
    unit: 'job',
    unitPrice: 150000,
    kind: 'estimate',
    basis: 'Assumed at 25% of the bag-filter supply price; needs a site quotation.',
  },
  stackTest: {
    id: 'stackTest',
    item: 'Stack emission test by an approved lab',
    unit: 'test',
    unitPrice: 25000,
    kind: 'estimate',
    basis: 'No public rate found; assumed per test.',
  },
  power: {
    id: 'power',
    item: 'Fan electricity',
    unit: 'kWh',
    unitPrice: 10,
    kind: 'estimate',
    basis: 'Assumed all-in industrial tariff of about ₹10/kWh; check the unit’s MSEDCL bill.',
  },
  anprCamera: {
    id: 'anprCamera',
    item: 'ANPR camera',
    unit: 'camera',
    unitPrice: 55000,
    kind: 'sourced',
    source: {
      name: 'Dhruva Technologies, Gurugram (IndiaMART listing)',
      url: 'https://m.indiamart.com/dhruvatechnologies/bullet-camera.html',
      accessed: ACCESSED,
      note: 'Camera only; excludes poles, power, network and software.',
    },
  },
  cameraInstall: {
    id: 'cameraInstall',
    item: 'Pole, power and network per camera',
    unit: 'camera',
    unitPrice: 20000,
    kind: 'estimate',
    basis: 'No quotation found; assumed per camera site.',
  },
  signBoard: {
    id: 'signBoard',
    item: 'Aluminium traffic sign, 900 mm square',
    unit: 'sq ft',
    unitPrice: 250,
    kind: 'sourced',
    source: {
      name: 'K.B. Fitness, Udaipur (IndiaMART traffic sign board listings)',
      url: 'https://m.indiamart.com/impcat/traffic-sign-board.html',
      accessed: ACCESSED,
      note: 'High-intensity aluminium board priced per sq ft; one 900 mm board is 8.72 sq ft.',
    },
  },
  anprSoftware: {
    id: 'anprSoftware',
    item: 'ANPR software and data',
    unit: 'camera-year',
    unitPrice: 12000,
    kind: 'estimate',
    basis: 'No public rate found; assumed annual licence and data per camera.',
  },
  awareness: {
    id: 'awareness',
    item: 'Public awareness campaign',
    unit: 'campaign',
    unitPrice: 50000,
    kind: 'estimate',
    basis: 'Assumed print and social-media outreach for one zone.',
  },
};

export class MissingPriceError extends Error {
  constructor(public priceId: string) {
    super(`No price for "${priceId}" in the price table`);
    this.name = 'MissingPriceError';
  }
}

export type InterventionType = 'trees' | 'industry' | 'traffic';
export const INTERVENTION_LABEL: Record<InterventionType, string> = {
  trees: 'Tree planting',
  industry: 'Industrial emission control',
  traffic: 'Traffic enforcement zone',
};

export type CostCategory = 'Materials' | 'Labour' | 'Equipment' | 'Transport' | 'Maintenance' | 'Monitoring' | 'Utilities' | 'Outreach';

export interface CostLine {
  category: CostCategory;
  priceId: string;
  item: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** whole rupees: round(quantity x unitPrice x multiplier) */
  total: number;
  kind: 'sourced' | 'estimate';
  /** first-year running cost rather than a one-time cost */
  recurring: boolean;
  /** how the quantity was derived (an assumption of this planner) */
  note?: string;
}

export interface InterventionOption {
  key: string;
  type: InterventionType;
  label: string;
  quantity: number;
  quantityUnit: string;
  location: string;
  lines: CostLine[];
  oneTime: number;
  recurring: number;
  total: number;
  /** the scenario parameters this option changes */
  patch: Partial<ScenarioParams>;
  effect: string;
  limitations: string[];
}

export interface PlanAssumptions {
  costMultiplier: Record<InterventionType, number>;
  /** canopy cover of one mature tree, m2 (shared with the What-If tree helper) */
  treeCanopyM2: number;
  /** share of an industrial source's particulate emission a bag filter captures */
  bagFilterCapture: number;
  trafficReduction: { standard: number; intensive: number };
}

export const TREE_LEVELS = [250, 500, 1000, 2000];
/** One 900 mm square board. */
export const SIGN_SQFT = 8.72;
export const MIN_REDUCTION = 0.01;

export const DEFAULT_ASSUMPTIONS: PlanAssumptions = {
  costMultiplier: { trees: 1, industry: 1, traffic: 1 },
  treeCanopyM2: 40,
  bagFilterCapture: 0.9,
  trafficReduction: { standard: 0.1, intensive: 0.2 },
};

export const cloneAssumptions = (a: PlanAssumptions): PlanAssumptions => ({
  costMultiplier: { ...a.costMultiplier },
  treeCanopyM2: a.treeCanopyM2,
  bagFilterCapture: a.bagFilterCapture,
  trafficReduction: { ...a.trafficReduction },
});

export type PriceTable = Record<string, PriceRecord>;

/** One costed line. Throws MissingPriceError when the price id is absent. */
export function line(
  prices: PriceTable,
  priceId: string,
  quantity: number,
  category: CostCategory,
  recurring: boolean,
  multiplier = 1,
  note?: string,
): CostLine {
  const p = prices[priceId];
  if (!p) throw new MissingPriceError(priceId);
  return {
    category,
    priceId,
    item: p.item,
    quantity,
    unit: p.unit,
    unitPrice: p.unitPrice,
    total: Math.round(quantity * p.unitPrice * multiplier),
    kind: p.kind,
    recurring,
    note,
  };
}

export function sumLines(lines: CostLine[]): { oneTime: number; recurring: number; total: number } {
  let oneTime = 0;
  let recurring = 0;
  for (const l of lines) {
    if (l.recurring) recurring += l.total;
    else oneTime += l.total;
  }
  return { oneTime, recurring, total: oneTime + recurring };
}

// ---- number helpers ----

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** "₹12,34,567" (en-IN grouping). */
export const formatINR = (v: number): string => `₹${INR.format(Math.round(v))}`;
/** The same amount for the PDF, whose standard fonts cannot draw the rupee sign: "Rs 12,34,567". */
export const formatINRPdf = (v: number): string => `Rs ${INR.format(Math.round(v))}`;
export const pct = (v: number, digits = 1): string => `${v.toFixed(digits)}%`;
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---- targets ----

export interface PlanTarget {
  id: string;
  label: string;
  cellIds: string[];
  areaKm2: number;
}

// ---- option builders (quantities that are not prices are assumptions of this planner, stated in each note) ----

const TREES_PER_PERSON_DAY = 4;
const COMPOST_KG_PER_PIT = 10;
const TREES_PER_TRUCK = 100;
const WATER_ROUNDS_FIRST_YEAR = 26;
const TREES_PER_TANKER = 100;

/** Spread of the extra green cover over the target zones, in points per zone (capped by the engine's 60-point limit). */
export function treePoints(n: number, canopyM2: number, areaKm2: number): number {
  if (areaKm2 <= 0) return 0;
  return Math.min(60, ((n * canopyM2) / (areaKm2 * 1e6)) * 100);
}

export function treeOption(
  target: PlanTarget,
  n: number,
  assumptions: PlanAssumptions = DEFAULT_ASSUMPTIONS,
  prices: PriceTable = PRICES,
): InterventionOption {
  const m = assumptions.costMultiplier.trees;
  const trucks = Math.ceil(n / TREES_PER_TRUCK);
  const tankers = Math.ceil(n / TREES_PER_TANKER) * WATER_ROUNDS_FIRST_YEAR;
  const lines = [
    line(prices, 'sapling', n, 'Materials', false, m),
    line(prices, 'treeGuard', n, 'Materials', false, m),
    line(prices, 'compost', n * COMPOST_KG_PER_PIT, 'Materials', false, m, `${COMPOST_KG_PER_PIT} kg per planting pit (assumed)`),
    line(prices, 'labourDay', Math.round((n / TREES_PER_PERSON_DAY) * 100) / 100, 'Labour', false, m, `${TREES_PER_PERSON_DAY} trees planted per person-day (assumed)`),
    line(prices, 'truckTrip', trucks, 'Transport', false, m, `one tempo trip per ${TREES_PER_TRUCK} trees (assumed)`),
    line(prices, 'tankerTrip', tankers, 'Maintenance', true, m, `${WATER_ROUNDS_FIRST_YEAR} fortnightly rounds, one tanker per ${TREES_PER_TANKER} trees (assumed)`),
    line(prices, 'labourDay', Math.round(tankers * 0.5 * 100) / 100, 'Maintenance', true, m, 'half a person-day per tanker round for watering (assumed)'),
  ];
  const pts = treePoints(n, assumptions.treeCanopyM2, target.areaKm2);
  const greenCoverByCell: Record<string, number> = {};
  for (const id of target.cellIds) greenCoverByCell[id] = pts;
  return {
    key: `trees-${n}`,
    type: 'trees',
    label: `Plant ${n.toLocaleString('en-IN')} trees`,
    quantity: n,
    quantityUnit: 'trees',
    location: target.label,
    lines,
    ...sumLines(lines),
    patch: { greenCoverByCell },
    effect: `Adds about ${pts.toFixed(2)} points of green cover per zone in ${target.label} (${assumptions.treeCanopyM2} m2 canopy per mature tree).`,
    limitations: [
      'Canopy takes years to grow: the modeled effect is for mature trees, not the first season.',
      'The prototype engine treats green cover as a small reduction of local PM2.5; it does not model tree species or survival.',
      'Quantities of compost, labour, transport and watering are planner assumptions (see the cost lines).',
    ],
  };
}

/** Modeled industrial sources that lie in the target zones and can be controlled, highest intensity first. */
export function eligibleSources(base: BaseState, target: PlanTarget) {
  const inTarget = new Set(target.cellIds);
  const cellOf = (lon: number, lat: number) =>
    base.cells.find((c) => lon >= c.bounds.west && lon < c.bounds.east && lat >= c.bounds.south && lat <= c.bounds.north);
  return base.industries
    .filter((i) => i.emissionIntensity > 0)
    .filter((i) => {
      const c = cellOf(i.location[0], i.location[1]);
      return !!c && inTarget.has(c.id);
    })
    .sort((a, b) => b.emissionIntensity - a.emissionIntensity || a.id.localeCompare(b.id));
}

const FILTER_BAGS_PER_UNIT = 50;
const FAN_KWH_PER_YEAR = 18000;
const MAINTENANCE_MONTHS = 1;

export function industryOption(
  sources: ReturnType<typeof eligibleSources>,
  k: number,
  assumptions: PlanAssumptions = DEFAULT_ASSUMPTIONS,
  prices: PriceTable = PRICES,
): InterventionOption {
  const chosen = sources.slice(0, k);
  const m = assumptions.costMultiplier.industry;
  const lines = [
    line(prices, 'bagFilter', chosen.length, 'Equipment', false, m),
    line(prices, 'ductInstall', chosen.length, 'Equipment', false, m),
    line(prices, 'stackTest', chosen.length, 'Monitoring', false, m),
    line(prices, 'filterBag', chosen.length * FILTER_BAGS_PER_UNIT, 'Maintenance', true, m, `${FILTER_BAGS_PER_UNIT} replacement bags per unit per year (assumed)`),
    line(prices, 'power', chosen.length * FAN_KWH_PER_YEAR, 'Utilities', true, m, `${FAN_KWH_PER_YEAR.toLocaleString('en-IN')} kWh per unit per year (assumed)`),
    line(prices, 'labourMonth', chosen.length * MAINTENANCE_MONTHS, 'Labour', true, m, `${MAINTENANCE_MONTHS} person-month of upkeep per unit per year (assumed)`),
  ];
  const overrides: Record<string, number> = {};
  for (const s of chosen) overrides[s.id] = Math.round(s.emissionIntensity * (1 - assumptions.bagFilterCapture) * 10) / 10;
  return {
    key: `industry-${k}`,
    type: 'industry',
    label: `Fit bag filters on ${chosen.length} industrial unit${chosen.length === 1 ? '' : 's'}`,
    quantity: chosen.length,
    quantityUnit: 'units',
    location: chosen.map((s) => s.name).join(', '),
    lines,
    ...sumLines(lines),
    patch: { industryIntensityOverrides: overrides },
    effect: `Cuts the modeled emission of ${listJoin(chosen.map((s) => s.name))} by ${Math.round(assumptions.bagFilterCapture * 100)}%.`,
    limitations: [
      'The industry data has no facility emissions: source intensities are assumptions of the prototype engine.',
      'A bag filter captures particulates; the engine scales the whole source (including gases), so the modeled effect is generous for SO2 and NO2.',
      'Bag-filter size and price depend on the unit’s airflow; a site quotation is needed.',
    ],
  };
}

export type TrafficLevel = 'standard' | 'intensive';

export function trafficOption(
  target: PlanTarget,
  level: TrafficLevel,
  assumptions: PlanAssumptions = DEFAULT_ASSUMPTIONS,
  prices: PriceTable = PRICES,
): InterventionOption {
  const m = assumptions.costMultiplier.traffic;
  const cameras = Math.min(20, Math.max(2, target.cellIds.length)) * (level === 'intensive' ? 2 : 1);
  const signs = cameras * 2;
  const staffMonths = level === 'intensive' ? 6 : 2;
  const reduction = assumptions.trafficReduction[level];
  const lines = [
    line(prices, 'anprCamera', cameras, 'Equipment', false, m, level === 'intensive' ? 'two cameras per zone, at least 4 (assumed)' : 'one camera per zone, at least 2, at most 20 (assumed)'),
    line(prices, 'cameraInstall', cameras, 'Equipment', false, m),
    line(prices, 'signBoard', Math.round(signs * SIGN_SQFT * 100) / 100, 'Materials', false, m, `${signs} boards of 900 mm (${SIGN_SQFT} sq ft each), two per camera (assumed)`),
    line(prices, 'awareness', 1, 'Outreach', false, m),
    line(prices, 'anprSoftware', cameras, 'Monitoring', true, m),
    line(prices, 'labourMonth', staffMonths, 'Labour', true, m, `${staffMonths} person-months of enforcement staffing in the first year (assumed)`),
  ];
  return {
    key: `traffic-${level}`,
    type: 'traffic',
    label: `${level === 'intensive' ? 'Intensive' : 'Standard'} traffic enforcement zone`,
    quantity: cameras,
    quantityUnit: 'cameras',
    location: target.label,
    lines,
    ...sumLines(lines),
    patch: { targetCells: [...target.cellIds], areaTrafficMultiplier: 1 - reduction },
    effect: `Assumes ${Math.round(reduction * 100)}% less vehicle traffic in ${target.label} from ANPR-based enforcement.`,
    limitations: [
      'The size of the traffic reduction is an assumption: no enforcement-effect study for Pune was used.',
      'Cameras, poles, signs, software and staffing quantities are planner assumptions.',
      'Traffic diverted to neighbouring roads is not modeled here.',
    ],
  };
}
