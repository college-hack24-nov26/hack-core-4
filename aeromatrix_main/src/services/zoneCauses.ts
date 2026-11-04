/**
 * Likely causes of the air quality in one zone, shown only where the data gives evidence: mapped major roads through the
 * zone, mapped industry near it, and the PM2.5/PM10 ratio of the live model data. These are indications, not a measured
 * breakdown, and a cause with no evidence is simply left out.
 */
import { industryLikelihood } from './industrySources';
import type { BaseState, GridCell, Road } from '../types';
import { distanceToBBoxKm, haversineKm, polygonCentroid } from '../utils/geo';

export type Strength = 'Strong' | 'Moderate' | 'Weak';

export interface ZoneCause {
  key: 'traffic' | 'industry' | 'dust';
  label: string;
  strength: Strength;
  evidence: string[];
}

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary'];
const NEAR_INDUSTRY_KM = 1.5;

function lengthInBounds(road: Road, b: GridCell['bounds']): number {
  let km = 0;
  for (const path of road.paths) {
    for (let i = 1; i < path.length; i++) {
      const mx = (path[i - 1][0] + path[i][0]) / 2;
      const my = (path[i - 1][1] + path[i][1]) / 2;
      if (mx >= b.west && mx <= b.east && my >= b.south && my <= b.north) km += haversineKm(path[i - 1], path[i]);
    }
  }
  return km;
}

export function zoneCauses(base: BaseState, cell: GridCell, pm25: number | null, pm10: number | null): ZoneCause[] {
  const out: ZoneCause[] = [];
  if (base.geometrySource === 'osm') {
    const roads = base.roads
      .filter((r) => r.roadClass && MAJOR.includes(r.roadClass))
      .map((road) => ({ road, km: lengthInBounds(road, cell.bounds) }))
      .filter((x) => x.km >= 0.2)
      .sort((a, b) => b.km - a.km)
      .slice(0, 5);
    const total = roads.reduce((a, r) => a + r.km, 0);
    const heavy = roads.filter((r) => r.road.roadClass === 'motorway' || r.road.roadClass === 'trunk').reduce((a, r) => a + r.km, 0);
    if (roads.length > 0 && total >= 0.5) {
      out.push({
        key: 'traffic',
        label: 'Road traffic',
        strength: total >= 6 || heavy >= 2 ? 'Strong' : total >= 2.5 ? 'Moderate' : 'Weak',
        evidence: [...roads.slice(0, 3).map((r) => `${r.road.name} (${r.road.roadClass}) runs ${r.km.toFixed(1)} km through the zone`), `${total.toFixed(1)} km of major road in the zone`],
      });
    }
    const sources = base.industries
      .filter((i) => distanceToBBoxKm(i.location, cell.bounds) <= NEAR_INDUSTRY_KM)
      .sort((a, b) => b.emissionIntensity * (1 - b.controlEfficiency) - a.emissionIntensity * (1 - a.controlEfficiency));
    const areas = base.industrialAreas.filter((a) => a.polygon.length > 0 && (distanceToBBoxKm(polygonCentroid(a.polygon), cell.bounds) <= NEAR_INDUSTRY_KM || a.polygon.some((p) => distanceToBBoxKm(p, cell.bounds) === 0)));
    const n = sources.length + areas.length;
    if (n > 0) {
      out.push({
        key: 'industry',
        label: 'Industry',
        strength: n >= 4 ? 'Strong' : n >= 2 ? 'Moderate' : 'Weak',
        evidence: [...sources.slice(0, 3).map((s) => `${s.name} (${s.category}): ${industryLikelihood(s).toLowerCase()} chance of adding to local pollution, within ${NEAR_INDUSTRY_KM} km`), ...(areas.length > 0 ? [`${areas.length} industrial area${areas.length === 1 ? '' : 's'} in or near the zone`] : [])],
      });
    }
  }
  if (pm25 !== null && pm10 !== null && pm10 > 0) {
    const ratio = pm25 / pm10;
    if (ratio < 0.55) {
      out.push({
        key: 'dust',
        label: 'Road and construction dust',
        strength: ratio < 0.35 ? 'Strong' : ratio < 0.45 ? 'Moderate' : 'Weak',
        evidence: [`PM2.5/PM10 is ${ratio.toFixed(2)}: a low ratio points to coarse dust from roads, soil and construction`],
      });
    }
  }
  const rank: Record<Strength, number> = { Strong: 0, Moderate: 1, Weak: 2 };
  return out.sort((a, b) => rank[a.strength] - rank[b.strength]);
}
