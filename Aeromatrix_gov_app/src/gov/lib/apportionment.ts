/**
 * Source contribution data. A pie chart is drawn ONLY from a real source-apportionment study supplied as
 * public/data/source_apportionment.json. Without it, no chart is made and nothing is estimated or illustrated.
 *
 * File format:
 *   { "study": "Name of the study", "year": 2024, "pollutant": "PM2.5", "scope": "Pune and Pimpri-Chinchwad",
 *     "sources": [{ "key": "traffic", "label": "Traffic", "percent": 35 }, ...],
 *     "areas": [{ "name": "Hadapsar", "sources": [ ...same shape... ] }] }   // "areas" is optional
 */
export const APPORTIONMENT_URL = '/data/source_apportionment.json';

export interface SourceShare {
  key: string;
  label: string;
  percent: number;
}

export interface Apportionment {
  study: string;
  year: number | null;
  pollutant: string;
  scope: string;
  sources: SourceShare[];
  areas: Array<{ name: string; sources: SourceShare[] }>;
}

export type ApportionmentLoad = { status: 'loaded'; data: Apportionment } | { status: 'unavailable'; reason: string };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

function parseSources(raw: unknown): SourceShare[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out: SourceShare[] = [];
  for (const s of raw) {
    if (!isObj(s) || typeof s.percent !== 'number' || !Number.isFinite(s.percent) || s.percent < 0 || s.percent > 100) return null;
    const key = typeof s.key === 'string' && s.key ? s.key : typeof s.label === 'string' ? s.label.toLowerCase() : '';
    const label = typeof s.label === 'string' && s.label ? s.label : key;
    if (!key) return null;
    out.push({ key, label, percent: s.percent });
  }
  const total = out.reduce((a, s) => a + s.percent, 0);
  return Math.abs(total - 100) <= 1.5 ? out : null; // shares must make up the whole
}

export function parseApportionment(json: unknown): ApportionmentLoad {
  if (!isObj(json)) return { status: 'unavailable', reason: 'The source-contribution file is not in the expected format.' };
  const sources = parseSources(json.sources);
  if (!sources) return { status: 'unavailable', reason: 'The source-contribution file does not add up to 100 per cent.' };
  if (typeof json.study !== 'string' || !json.study.trim()) return { status: 'unavailable', reason: 'The source-contribution file does not name its study.' };
  const areas: Apportionment['areas'] = [];
  if (Array.isArray(json.areas)) {
    for (const a of json.areas) {
      if (!isObj(a) || typeof a.name !== 'string') continue;
      const s = parseSources(a.sources);
      if (s) areas.push({ name: a.name, sources: s });
    }
  }
  return {
    status: 'loaded',
    data: {
      study: json.study,
      year: typeof json.year === 'number' ? json.year : null,
      pollutant: typeof json.pollutant === 'string' ? json.pollutant : 'PM2.5',
      scope: typeof json.scope === 'string' ? json.scope : 'the city',
      sources,
      areas,
    },
  };
}

export async function loadApportionment(url: string = APPORTIONMENT_URL): Promise<ApportionmentLoad> {
  const none: ApportionmentLoad = { status: 'unavailable', reason: 'No source-apportionment study is available for this city yet.' };
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return none;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('text/html')) return none;
    return parseApportionment(await res.json());
  } catch {
    return none;
  }
}

/** The shares for a place: its own study area when there is one, otherwise the whole-city shares. */
export function sharesFor(load: ApportionmentLoad, placeName: string): { shares: SourceShare[]; scope: string } | null {
  if (load.status !== 'loaded') return null;
  const own = load.data.areas.find((a) => a.name.toLowerCase() === placeName.toLowerCase());
  return own ? { shares: own.sources, scope: own.name } : { shares: load.data.sources, scope: load.data.scope };
}

export interface ProjectionCuts {
  /** fraction (0..1) by which the traffic contribution falls */
  traffic: number;
  /** fraction (0..1) by which the industry contribution falls */
  industry: number;
}

/**
 * Shares after an intervention, from the current concentration. Only traffic and industry measures are applied; every
 * other source stays as it is. Returns null when no selected measure touches a source in the study (nothing to project).
 */
export function projectShares(shares: SourceShare[], currentConcentration: number, cuts: ProjectionCuts): { shares: SourceShare[]; before: number; after: number } | null {
  if (!(currentConcentration > 0) || (cuts.traffic <= 0 && cuts.industry <= 0)) return null;
  const hit = shares.some((s) => (s.key === 'traffic' && cuts.traffic > 0) || (s.key === 'industry' && cuts.industry > 0));
  if (!hit) return null;
  const absolute = shares.map((s) => {
    const cut = s.key === 'traffic' ? cuts.traffic : s.key === 'industry' ? cuts.industry : 0;
    return { ...s, abs: (s.percent / 100) * currentConcentration * (1 - cut) };
  });
  const after = absolute.reduce((a, s) => a + s.abs, 0);
  return { shares: absolute.map((s) => ({ key: s.key, label: s.label, percent: (s.abs / after) * 100 })), before: currentConcentration, after };
}
