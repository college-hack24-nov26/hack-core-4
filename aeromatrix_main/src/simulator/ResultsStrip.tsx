import { ArrowRight } from 'lucide-react';
import { StatusBadge } from '../components/ui';
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
    <div className="rounded-2xl bg-ink-850 p-3 hairline" aria-label="Scenario results">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status="MODELED_SCENARIO" />
        <button
          type="button"
          onClick={() => openResult(true)}
          className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-accent-500 hover:bg-ink-700"
        >
          Details <ArrowRight size={12} />
        </button>
      </div>
      {errors.length > 0 && (
        <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-[11px] text-red-700" role="alert">
          Some values are out of range, so the scenario is not re-running. These results are from the last valid input.
        </p>
      )}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-xl font-bold text-sand-50">{fmt(s.meanBaseline)}</span>
        <ArrowRight size={14} className="text-sand-400" />
        <span className="font-display text-xl font-bold text-sand-50">{fmt(s.meanScenario)}</span>
        <span className="text-[11px] text-sand-400">ug/m3 mean PM2.5</span>
      </div>
      <p className={`text-sm font-bold ${tone}`}>
        {fmtSigned(s.meanDelta, 2)} ug/m3 ({fmtSigned(s.meanDeltaPct, 1)}%)
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-sand-400">Zones affected</dt>
          <dd className="font-mono font-semibold text-sand-50">{s.affectedCount}</dd>
        </div>
        <div>
          <dt className="text-sand-400">High-risk zones</dt>
          <dd className="font-mono font-semibold text-sand-50">
            {s.highRiskBaseline} → {s.highRiskScenario}
          </dd>
        </div>
        <div>
          <dt className="text-sand-400">Exposed to rises</dt>
          <dd className="font-mono font-semibold text-sand-50">{fmtInt(s.exposedPopulation)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[10px] leading-snug text-sand-500">{result.metadata.disclaimer}</p>
    </div>
  );
}
