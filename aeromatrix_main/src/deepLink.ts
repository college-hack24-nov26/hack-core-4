import type { Section } from './types';

export const SECTIONS: Section[] = [
  'overview', 'air', 'zones', 'traffic', 'industries', 'green', 'simulator', 'scenarios', 'actions', 'locations', 'sensors', 'analytics', 'data',
];

const ALIASES: Record<string, Section> = {
  'what-if': 'simulator',
  whatif: 'simulator',
  sites: 'locations',
  site: 'locations',
  industry: 'industries',
  'air-quality': 'air',
  airquality: 'air',
};

function toSection(raw: string | null | undefined): Section | null {
  if (!raw) return null;
  const k = raw.replace(/^[#/]+/, '').toLowerCase().trim();
  if ((SECTIONS as string[]).includes(k)) return k as Section;
  return ALIASES[k] ?? null;
}

/**
 * The section named by the URL at startup: "#/air", "#air" or "?section=simulator". The query wins over the hash.
 */
export function parseDeepLink(hash: string, search: string): Section | null {
  const fromQuery = toSection(new URLSearchParams(search).get('section'));
  if (fromQuery) return fromQuery;
  return toSection(hash.split('?')[0]);
}
