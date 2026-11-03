import { useEffect, useMemo, useState } from 'react';
import { Loader2, MapPinned, TriangleAlert } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { ACTIONS, evaluateActions, meanReduction, rankActions, type ActionEvaluation } from './actions';
import { actionInsight } from './actionInsights';
import { checkRankingStability, type StabilityReport } from './actionStability';
import { StatusBadge } from '../components/ui';
import { fmt, fmtSigned } from '../utils/format';

export function ActionsPanel() {
  const base = useTwinStore((s) => s.base);
  const names = useTwinStore((s) => s.placeNames);
  const applyParams = useTwinStore((s) => s.applyParams);
  const setDisplayMode = useTwinStore((s) => s.setDisplayMode);
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

  return (
    <div className="space-y-3 py-3">
      <p className="rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
        Six reduction actions, each run on the current city model and ranked by mean PM2.5 reduction.{' '}
        <StatusBadge status="MODELED_SCENARIO" className="align-middle" /> Core actions are flagged.
      </p>

      {stability && !stability.stable && (
        <div role="note" className="flex gap-2 rounded-xl bg-amber-500/15 p-3 text-xs text-amber-800 ring-1 ring-amber-500/40">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <p>
            <strong>Ranking changes under assumption changes.</strong> Scaling the engine's illustrative coefficients by
            ±20% reorders the actions ({stability.sensitiveTo.join(', ')}). Treat close positions as ties.
          </p>
        </div>
      )}
      {stability?.stable && (
        <p className="rounded-xl bg-emerald-500/10 p-2.5 text-xs text-emerald-700 ring-1 ring-emerald-500/30">
          This ranking holds when the illustrative coefficients change by ±20%.
        </p>
      )}

      {!evals && (
        <div role="status" className="flex items-center gap-2 text-sm text-sand-300">
          <Loader2 size={16} className="animate-spin" /> Evaluating the six actions…
        </div>
      )}

      <ol className="space-y-2">
        {ranked.map((ev, i) => {
          const r = ev.result;
          const reduction = meanReduction(ev);
          const core = ev.action.core;
          return (
            <li key={ev.action.id} className="rounded-2xl bg-ink-850 p-3 hairline">
              <div className="flex items-start gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-500 text-xs font-bold text-sand-50">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-bold text-sand-50">{ev.action.name}</h3>
                    {core && (
                      <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wider text-accent-600 ring-1 ring-inset ring-accent-500/40">
                        CORE
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-sand-300">{ev.implementation.text}</p>
                </div>
              </div>
              {r ? (
                <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <dt className="text-sand-400">Mean PM2.5</dt>
                    <dd className="font-mono font-semibold text-sand-50">
                      {fmt(r.summary.meanBaseline)} → {fmt(r.summary.meanScenario)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sand-400">Change</dt>
                    <dd className={`font-mono font-semibold ${reduction > 0 ? 'text-emerald-600' : 'text-sand-50'}`}>
                      {fmtSigned(r.summary.meanDelta, 2)} ({fmtSigned(r.summary.meanDeltaPct, 1)}%)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sand-400">Zones affected</dt>
                    <dd className="font-mono font-semibold text-sand-50">{r.summary.affectedCount}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-2 text-xs font-semibold text-amber-700">{ev.implementation.note ?? 'Not feasible.'}</p>
              )}
              <p className="mt-2 text-xs leading-snug text-sand-200">{actionInsight(base, ev, names)}</p>
              {ev.implementation.feasible && (
                <button
                  type="button"
                  onClick={() => {
                    applyParams(ev.implementation.params);
                    setDisplayMode('delta');
                    setAppliedId(ev.action.id);
                  }}
                  className={`mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold md:h-9 ${
                    appliedId === ev.action.id ? 'bg-emerald-600 text-white' : 'bg-accent-500 text-sand-50 hover:bg-accent-400'
                  }`}
                >
                  <MapPinned size={14} /> {appliedId === ev.action.id ? 'Applied: showing change on the map' : 'Apply to map'}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-sand-500">
        {ACTIONS.filter((a) => a.core).length} core actions: traffic restriction, industrial control, green expansion.
      </p>
    </div>
  );
}
