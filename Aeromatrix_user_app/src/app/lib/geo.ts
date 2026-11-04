import type { LonLat } from '../../types';

/**
 * Keeps at most `maxPoints` points of a ring, evenly spread, always keeping the first and last. Used on phones so a
 * detailed boundary costs a fraction of the drawing work.
 */
export function simplifyRing(ring: LonLat[], maxPoints: number): LonLat[] {
  if (ring.length <= maxPoints || maxPoints < 3) return ring;
  const out: LonLat[] = [];
  const step = (ring.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) out.push(ring[Math.round(i * step)]);
  return out;
}
