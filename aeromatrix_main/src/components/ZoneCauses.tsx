import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import { liveValue, zonePointId } from '../services/liveData';
import { zoneCauses } from '../services/zoneCauses';
import { zoneLabel } from '../utils/zones';
import { Section } from './ui';

const STRENGTH: Record<string, string> = { Strong: 'bg-accent-500 text-white', Moderate: 'bg-amber-500/25 text-amber-800', Weak: 'bg-ink-700 text-sand-200' };

/** "Why the air is like this here": the likely causes of the selected zone, with their evidence. Nothing shows until a zone is selected. */
export function ZoneCauses() {
  const base = useTwinStore((s) => s.base);
  const id = useTwinStore((s) => s.selectedCellId);
  const names = useTwinStore((s) => s.placeNames);
  const live = useTwinStore((s) => s.live);
  const select = useTwinStore((s) => s.selectCell);
  const baseline = useTwinStore((s) => s.baseline);
  const zonePm = id ? baseline.find((b) => b.cellId === id)?.pm25 : undefined;
  const cell = id ? base?.cells.find((c) => c.id === id) : undefined;
  const causes = useMemo(() => {
    if (!base || !cell) return [];
    const point = live.points[zonePointId(cell.id)];
    return zoneCauses(base, cell, liveValue(point, 'pm25'), liveValue(point, 'pm10'));
  }, [base, cell, live.points]);
  if (!cell) return null;

  return (
    <Section
      title={`Why ${zoneLabel(cell, names)} is polluted`}
      action={
        <button type="button" onClick={() => select(null)} aria-label="Clear the selected zone" className="flex h-8 w-8 items-center justify-center rounded-lg text-sand-400 hover:bg-ink-800">
          <X size={14} />
        </button>
      }
    >
      {zonePm !== undefined && (
        <p className="mb-2 text-xs text-sand-300">
          This zone: <strong className="text-sand-50">{zonePm.toFixed(1)} ug/m3</strong> PM2.5, against a city average of {(baseline.reduce((a, b) => a + b.pm25, 0) / Math.max(1, baseline.length)).toFixed(1)}.
        </p>
      )}
      {causes.length === 0 ? (
        <p className="rounded-xl bg-ink-850 p-3 text-xs text-sand-300 hairline">No cause is supported by the available data for this zone.</p>
      ) : (
        <ul className="space-y-2">
          {causes.map((c) => (
            <li key={c.key} className="rounded-2xl bg-ink-900 p-3.5 shadow-sm hairline">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-sand-50">{c.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STRENGTH[c.strength]}`}>{c.strength}</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs leading-snug text-sand-200">
                {c.evidence.map((e, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden />
                    <span>{e.replace(/ \(DEMO source\)/g, '')}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-sand-500">Based on nearby roads, industry and the PM2.5/PM10 ratio. Construction and waste burning are not covered.</p>
    </Section>
  );
}
