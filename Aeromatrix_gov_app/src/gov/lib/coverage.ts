/**
 * Monitoring coverage: which zones have no station with a data feed within the coverage radius. A station with no
 * feed (status no_feed or estimate) gives no coverage, and a station that was not placed is never counted.
 */
import type { GridCell } from '../../types';
import { COVERAGE_RADIUS_KM, distKm, type StationRow } from './stations';

export interface CoverageCell {
  id: string;
  center: GridCell['center'];
  bounds: GridCell['bounds'];
  /** nearest station with a feed, and how far */
  nearest: { id: string; name: string; km: number } | null;
}

export interface CoverageResult {
  radiusKm: number;
  /** zones with no feed-station within the radius */
  gaps: CoverageCell[];
  covered: number;
  /** zones whose nearest in-range station has only old (not current) readings */
  coveredOnlyByOutdated: number;
  total: number;
  /** why the analysis cannot run, or null */
  disabledReason: string | null;
}

/** A station provides coverage when the service has a feed for it (current or historical). */
export const providesCoverage = (s: StationRow): boolean => s.hasFeed && (s.status === 'live' || s.status === 'outdated');

export function coverageGaps(
  cells: Array<Pick<GridCell, 'id' | 'center' | 'bounds'>>,
  stations: StationRow[],
  radiusKm: number = COVERAGE_RADIUS_KM,
): CoverageResult {
  const empty = (reason: string): CoverageResult => ({ radiusKm, gaps: [], covered: 0, coveredOnlyByOutdated: 0, total: cells.length, disabledReason: reason });
  if (stations.length === 0) return empty('Station locations are not available, so monitoring gaps cannot be assessed.');
  const feed = stations.filter(providesCoverage);
  const gaps: CoverageCell[] = [];
  let covered = 0;
  let onlyOutdated = 0;
  for (const c of cells) {
    let best: { s: StationRow; km: number } | null = null;
    for (const s of feed) {
      const km = distKm(c.center, [s.lon, s.lat]);
      if (km <= radiusKm && (!best || km < best.km)) best = { s, km };
    }
    if (!best) {
      let nearest: CoverageCell['nearest'] = null;
      for (const s of stations) {
        const km = distKm(c.center, [s.lon, s.lat]);
        if (!nearest || km < nearest.km) nearest = { id: s.id, name: s.name, km };
      }
      gaps.push({ id: c.id, center: c.center, bounds: c.bounds, nearest });
    } else {
      covered++;
      const anyCurrent = feed.some((s) => s.status === 'live' && distKm(c.center, [s.lon, s.lat]) <= radiusKm);
      if (!anyCurrent) onlyOutdated++;
    }
  }
  return { radiusKm, gaps, covered, coveredOnlyByOutdated: onlyOutdated, total: cells.length, disabledReason: null };
}
