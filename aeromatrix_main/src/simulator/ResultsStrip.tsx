import { ArrowRight } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { fmt, fmtInt, fmtSigned } from '../utils/format';

/** Headline numbers of the active scenario (always MODELED_SCENARIO). */
export function ResultsStrip() {
  const result = useTwinStore((s) => s.activeResult);
  const errors = useTwinStore((s) => s.paramErrors);
  const openResult = useTwinStore((s) => s.openResult);

  if (!result) {
    return (
      <div className="rounded-2xl bg-ink-850 p-3 text-xs text-sand-300 hairline" role="status">
        Running the scenario…
      </div>
    );
  }
  const s = result.summary;
  const better = s.meanDelta < -0.005;
  const worse = s.meanDelta > 0.005;
  const tone = better ? 'text-emerald-600' : worse ? 'text-red-600' : 'text-sand-200';

  return (
    <div className="overflow-hidden rounded-3xl bg-ink-900 shadow-sm hairline" aria-label="Scenario results">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="text-xs font-bold uppercase tracking-wider text-sand-400">Result</span>
        <button
          type="button"
          onClick={() => openResult(true)}
          className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-accent-500 hover:bg-ink-700"
        >
          Details <ArrowRight size={12} />
        </button>
      </div>
      {errors.length > 0 && (
        <p className="mx-4 mt-2 rounded-lg bg-red-500/10 p-2 text-[11px] text-red-700" role="alert">
          Some values are out of range, so the last valid result is shown.
        </p>
      )}
      <div className="px-4 pb-3 pt-1">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-bold text-sand-50">{fmt(s.meanScenario)}</span>
          <span className="text-xs text-sand-400">ug/m3 PM2.5 (was {fmt(s.meanBaseline)})</span>
        </div>
        <p className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-sm font-bold ${better ? 'bg-emerald-500/15' : worse ? 'bg-red-500/10' : 'bg-ink-800'} ${tone}`}>
          {fmtSigned(s.meanDelta, 2)} ug/m3 ({fmtSigned(s.meanDeltaPct, 1)}%)
        </p>
      </div>
      <dl className="grid grid-cols-3 divide-x divide-sand-400/15 border-t border-sand-400/15 bg-ink-850 text-center text-[11px]">
        <div className="p-2.5">
          <dd className="font-display text-base font-bold text-sand-50">{s.affectedCount}</dd>
          <dt className="text-sand-400">Zones affected</dt>
        </div>
        <div className="p-2.5">
          <dd className="font-display text-base font-bold text-sand-50">
            {s.highRiskBaseline} → {s.highRiskScenario}
          </dd>
          <dt className="text-sand-400">High-risk zones</dt>
        </div>
        <div className="p-2.5">
          <dd className="font-display text-base font-bold text-sand-50">{fmtInt(s.exposedPopulation)}</dd>
          <dt className="text-sand-400">People facing a rise</dt>
        </div>
      </dl>
    </div>
  );
}
