import { useEffect, useState } from 'react';
import { fetchWeeklyHistory, type DailyPoint, type HistoryTarget } from './history';

export interface HistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  byId: Record<string, DailyPoint[]>;
}

const cache = new Map<string, { at: number; daily: DailyPoint[] }>();
const TTL_MS = 30 * 60_000;

/**
 * Weekly history for a few places, fetched only when asked for (the `enabled` flag) and kept for 30 minutes, so
 * opening and closing a screen never repeats the request.
 */
export function useWeeklyHistory(targets: HistoryTarget[], enabled: boolean): HistoryState {
  const key = targets.map((t) => t.id).join('|');
  const [state, setState] = useState<HistoryState>({ status: 'idle', byId: {} });

  useEffect(() => {
    if (!enabled || targets.length === 0) return;
    const now = Date.now();
    const fresh: Record<string, DailyPoint[]> = {};
    const missing: HistoryTarget[] = [];
    for (const t of targets) {
      const hit = cache.get(t.id);
      if (hit && now - hit.at < TTL_MS) fresh[t.id] = hit.daily;
      else missing.push(t);
    }
    if (missing.length === 0) {
      setState({ status: 'ready', byId: fresh });
      return;
    }
    let alive = true;
    setState({ status: 'loading', byId: fresh });
    fetchWeeklyHistory(missing, now)
      .then((got) => {
        for (const [id, daily] of Object.entries(got)) cache.set(id, { at: now, daily });
        if (alive) setState({ status: 'ready', byId: { ...fresh, ...got } });
      })
      .catch(() => {
        if (alive) setState({ status: 'error', byId: fresh });
      });
    return () => {
      alive = false;
    };
    // `key` stands for the target ids; the objects themselves are recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return state;
}
