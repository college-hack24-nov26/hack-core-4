import { useEffect, useMemo, useState } from 'react';
import { Loader2, MapPinned, TriangleAlert } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { evaluateActions, meanReduction, rankActions, type ActionEvaluation } from './actions';
import { actionInsight } from './actionInsights';
import { checkRankingStability, type StabilityReport } from './actionStability';
import { fmt, fmtSigned } from '../utils/format';

export function ActionsPanel() {
  const base = useTwinStore((s) => s.base);
  const names = useTwinStore((s) => s.placeNames);
  const applyParams = useTwinStore((s) => s.applyParams);
  const setDisplayMode = useTwinStore((s) => s.setDisplayMode);
  const setPlanItOpen = useTwinStore((s) => s.setPlanItOpen);
  const [evals, setEvals] = useState<ActionEvaluation[] | null>(null);
  const [stability, setStability] = useState<StabilityReport | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  useEffect(() => {
    if (!base) return;
    let stale = false;
    setEvals(null);
    setStability(null);
    evaluateActions(base).then((e) => {
      if (stale) return;
      setEvals(e);
      // The stability check re-runs every action 12 times: defer it so the ranking shows first.
      window.setTimeout(() => {
        if (!stale) setStability(checkRankingStability(base));
      }, 30);
    });
    return () => {
      stale = true;
    };
  }, [base]);

  const ranked = useMemo(() => (evals ? rankActions(evals) : []), [evals]);

  if (!base) return null;

  const best = Math.max(0.01, ...ranked.map((e) => meanReduction(e)));

  return (
    <div className="space-y-3 py-3">
      <p className="px-1 text-sm text-sand-200">Six ways to bring PM2.5 down, best first.</p>

      <button
        type="button"
        onClick={() => setPlanItOpen(true)}
        className="flex min-h-11 w-full items-center justify-center rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400"
      >
        Plan-It: best package for a budget
      </button>

      {stability && !stability.stable && (
        <p role="note" className="flex gap-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          Close results can swap places, so treat near-equal actions as a tie.
        </p>
      )}

      {!evals && (
        <div role="status" className="flex items-center gap-2 text-sm text-sand-300">
          <Loader2 size={16} className="animate-spin" /> Checking the six actions…
        </div>
      )}

      <ol className="space-y-3">
        {ranked.map((ev, i) => {
          const r = ev.result;
          const reduction = meanReduction(ev);
          const applied = appliedId === ev.action.id;
          return (
            <li key={ev.action.id} className="overflow-hidden rounded-2xl bg-ink-900 shadow-sm hairline">
              <div className="flex items-start gap-3 p-3.5 pb-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-500 text-sm font-bold text-sand-50">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-bold text-sand-50">{ev.action.name}</h3>
                    {ev.action.core && <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-bold text-accent-600">Key action</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-sand-300">{ev.implementation.text}</p>
                </div>
                {r && (
                  <div className="text-right">
                    <div className={`font-display text-xl font-bold leading-none ${reduction > 0 ? 'text-emerald-600' : 'text-sand-50'}`}>{fmtSigned(r.summary.meanDeltaPct, 1)}%</div>
                    <div className="mt-1 text-[10px] text-sand-400">PM2.5</div>
                  </div>
                )}
              </div>
              {r ? (
                <>
                  <div className="mx-3.5 h-1.5 overflow-hidden rounded-full bg-ink-800" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${Math.max(4, (Math.max(0, reduction) / best) * 100)}%` }} />
                  </div>
                  <ul className="space-y-1 px-3.5 pt-3 text-xs text-sand-200">
                    <li className="flex gap-2">
                      <span className="text-accent-500">•</span> PM2.5 goes from {fmt(r.summary.meanBaseline)} to {fmt(r.summary.meanScenario)} ug/m3
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-500">•</span> {r.summary.affectedCount} zones feel the change
                    </li>
                    <li className="flex gap-2">
                      <span className="text-accent-500">•</span> {actionInsight(base, ev, names)}
                    </li>
                  </ul>
                </>
              ) : (
                <p className="px-3.5 pt-2 text-xs font-semibold text-amber-700">{ev.implementation.note ?? 'Not possible right now.'}</p>
              )}
              {ev.implementation.feasible ? (
                <button
                  type="button"
                  onClick={() => {
                    applyParams(ev.implementation.params);
                    setDisplayMode('delta');
                    setAppliedId(ev.action.id);
                  }}
                  className={`m-3.5 mt-3 flex h-11 w-[calc(100%-1.75rem)] items-center justify-center gap-2 rounded-xl text-xs font-bold md:h-10 ${applied ? 'bg-emerald-600 text-white' : 'bg-accent-500 text-sand-50 hover:bg-accent-400'}`}
                >
                  <MapPinned size={14} /> {applied ? 'Showing on the map' : 'See it on the map'}
                </button>
              ) : (
                <div className="h-3" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
