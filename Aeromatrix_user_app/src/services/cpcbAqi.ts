/**
 * US EPA Air Quality Index (the scale used by AirNow and most phone apps), built on the original table-driven
 * calculation. Category KEYS keep their old internal names; what people read is `AQI_LABEL` (Good, Moderate,
 * Unhealthy for Sensitive Groups, Unhealthy, Very Unhealthy, Hazardous).
 *
 * Concentrations are in ug/m3 (CO in mg/m3), so the EPA ppb / ppm tables are converted at 25 C. Daily means are used
 * for the particles and gases as before, which smooths short spikes compared with an hourly NowCast.
 *
 * Series are ordered NEWEST FIRST: index 0 is the hour ending at `end`, index 1 the hour before, and so on.
 * PM2.5 / PM10 / NO2 / SO2 use the 24 h mean; CO and O3 use the trailing 8 h mean (all 8 hours required).
 * Every pollutant needs at least 16 valid hours in the trailing 24 h, and at least three pollutants (one of them
 * PM2.5 or PM10) are needed for an AQI. Open-ended severe concentrations give a lower bound (>= 401), never an
 * invented value. Ozone above 208 ug/m3 withholds the AQI.
 */
export type AqiPollutant = 'pm25' | 'pm10' | 'no2' | 'so2' | 'co' | 'o3';
export type AqiCategory = 'Good' | 'Satisfactory' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';
export type AqiStatus = 'AVAILABLE' | 'LOWER_BOUND' | 'UNAVAILABLE';

export const AQI_POLLUTANTS: AqiPollutant[] = ['pm25', 'pm10', 'no2', 'so2', 'co', 'o3'];

/** Upper edge of each concentration band (ug/m3, CO in mg/m3). Bands map to the index bands below. */
export const BREAKPOINTS: Record<AqiPollutant, number[]> = {
  pm25: [9, 35.4, 55.4, 125.4, 225.4],
  pm10: [54, 154, 254, 354, 424],
  no2: [100, 188, 677, 1220, 2348],
  so2: [92, 196, 485, 796, 1583],
  co: [5, 10.8, 14.2, 17.6, 34.8],
  o3: [106, 137, 167, 206, 392],
};

const INDEX_BANDS: Array<[number, number]> = [
  [0, 50],
  [51, 100],
  [101, 150],
  [151, 200],
  [201, 300],
  [301, 500],
];

/** What each internal category is called on screen. */
export const AQI_LABEL: Record<AqiCategory, string> = {
  Good: 'Good',
  Satisfactory: 'Moderate',
  Moderate: 'Unhealthy for Sensitive Groups',
  Poor: 'Unhealthy',
  'Very Poor': 'Very Unhealthy',
  Severe: 'Hazardous',
};
/** A shorter form for chips. */
export const AQI_SHORT: Record<AqiCategory, string> = {
  Good: 'Good',
  Satisfactory: 'Moderate',
  Moderate: 'Unhealthy (SG)',
  Poor: 'Unhealthy',
  'Very Poor': 'Very Unhealthy',
  Severe: 'Hazardous',
};
export const aqiName = (c: AqiCategory | null | undefined): string => (c ? AQI_LABEL[c] : 'Unknown');

export const AVERAGING_HOURS: Record<AqiPollutant, number> = { pm25: 24, pm10: 24, no2: 24, so2: 24, co: 8, o3: 8 };
export const MIN_VALID_HOURS = 16;
export const OZONE_WITHHOLD_ABOVE = 392;

export const METHOD_MEASURED = 'US EPA AQI; measured hourly data; conservative eight-hour completeness';
export const METHOD_MODEL =
  'ESTIMATED from CAMS model data with the US EPA AQI method; not an official station AQI';

export interface Subindex {
  value: number;
  bounded: boolean;
  concentration: number;
  averaging_hours: number;
}

export interface AqiResult {
  status: AqiStatus;
  value: number | null;
  category: AqiCategory | null;
  dominant_pollutant: AqiPollutant | null;
  reason: string | null;
  subindices: Partial<Record<AqiPollutant, Subindex>>;
  excluded: Partial<Record<AqiPollutant, string>>;
  coverage_hours: Partial<Record<AqiPollutant, number>>;
  period_end: string;
  method: string;
}

export type HourlySeries = Partial<Record<AqiPollutant, ReadonlyArray<number | null | undefined>>>;

export function aqiCategory(v: number): AqiCategory {
  if (v <= 50) return 'Good';
  if (v <= 100) return 'Satisfactory';
  if (v <= 150) return 'Moderate';
  if (v <= 200) return 'Poor';
  if (v <= 300) return 'Very Poor';
  return 'Severe';
}

export const AQI_COLORS: Record<AqiCategory, string> = {
  Good: '#2fae8b',
  Satisfactory: '#e8c100',
  Moderate: '#f08c1a',
  Poor: '#d9372f',
  'Very Poor': '#8c1d5e',
  Severe: '#5e1535',
};

const precisionOf = (p: AqiPollutant) => (p === 'co' || p === 'pm25' ? 1 : 0);
const stepOf = (p: AqiPollutant) => (p === 'co' || p === 'pm25' ? 0.1 : 1);

function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export type SubindexOutcome = { kind: 'ok'; value: number; bounded: boolean; concentration: number } | { kind: 'withheld'; concentration: number };

/** Sub-index of one averaged concentration (rounded to table precision first). */
export function subindexFor(p: AqiPollutant, mean: number): SubindexOutcome {
  const c = roundTo(mean, precisionOf(p));
  const table = BREAKPOINTS[p];
  let prev = 0;
  for (let i = 0; i < table.length; i++) {
    const hi = table[i];
    if (c <= hi) {
      const [il, ih] = INDEX_BANDS[i];
      const bl = i === 0 ? 0 : prev + stepOf(p);
      const v = ((ih - il) / (hi - bl)) * (c - bl) + il;
      return { kind: 'ok', value: Math.round(v), bounded: false, concentration: c };
    }
    prev = hi;
  }
  if (p === 'o3') return { kind: 'withheld', concentration: c };
  // Open-ended top band: only a lower bound is known.
  return { kind: 'ok', value: INDEX_BANDS[INDEX_BANDS.length - 1][0], bounded: true, concentration: c };
}

const valid = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function calculateAqi(series: HourlySeries, end: Date | string, method: string = METHOD_MEASURED): AqiResult {
  const periodEnd = (end instanceof Date ? end : new Date(end)).toISOString();
  const subindices: AqiResult['subindices'] = {};
  const excluded: AqiResult['excluded'] = {};
  const coverage: AqiResult['coverage_hours'] = {};
  let ozoneWithheld = false;

  for (const p of AQI_POLLUTANTS) {
    const s = series[p];
    if (!s) continue;
    const last24 = s.slice(0, 24);
    const validCount = last24.filter(valid).length;
    coverage[p] = validCount;
    if (validCount < MIN_VALID_HOURS) {
      excluded[p] = 'Fewer than 16 valid hourly observations in 24h';
      continue;
    }
    const hours = AVERAGING_HOURS[p];
    const window = last24.slice(0, hours);
    if (hours === 8 && (window.length < 8 || !window.every(valid))) {
      excluded[p] = 'Incomplete trailing 8h average';
      continue;
    }
    const values = window.filter(valid);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sub = subindexFor(p, mean);
    if (sub.kind === 'withheld') {
      ozoneWithheld = true;
      excluded[p] = `Ozone ${sub.concentration} ug/m3 is above ${OZONE_WITHHOLD_ABOVE}: AQI withheld`;
      continue;
    }
    subindices[p] = { value: sub.value, bounded: sub.bounded, concentration: sub.concentration, averaging_hours: hours };
  }

  const have = AQI_POLLUTANTS.filter((p) => subindices[p]);
  const base = { subindices, excluded, coverage_hours: coverage, period_end: periodEnd, method };
  const unavailable = (reason: string): AqiResult => ({
    status: 'UNAVAILABLE',
    value: null,
    category: null,
    dominant_pollutant: null,
    reason,
    ...base,
  });

  if (ozoneWithheld) return unavailable(`Ozone above ${OZONE_WITHHOLD_ABOVE} ug/m3: the AQI is withheld rather than invented`);
  if (have.length < 3) return unavailable('Fewer than three pollutants have enough data for an AQI');
  if (!subindices.pm25 && !subindices.pm10) return unavailable('Neither PM2.5 nor PM10 has enough data for an AQI');

  let dominant = have[0];
  for (const p of have) if (subindices[p]!.value > subindices[dominant]!.value) dominant = p;
  const top = subindices[dominant]!;
  const bounded = top.bounded;
  return {
    status: bounded ? 'LOWER_BOUND' : 'AVAILABLE',
    value: top.value,
    category: aqiCategory(top.value),
    dominant_pollutant: dominant,
    reason: bounded ? 'Concentration is above the top of the EPA table: the AQI is a lower bound (>= 301)' : null,
    ...base,
  };
}

/** Text for an AQI value: "157 (Unhealthy)" or ">= 301 (Hazardous)". */
export function aqiLabel(a: Pick<AqiResult, 'status' | 'value' | 'category'>): string {
  if (a.status === 'UNAVAILABLE' || a.value === null) return 'unavailable';
  return `${a.status === 'LOWER_BOUND' ? '>= ' : ''}${a.value} (${a.category ? AQI_LABEL[a.category] : ''})`;
}
