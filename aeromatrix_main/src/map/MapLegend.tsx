import { useTwinStore } from '../store/useTwinStore';
import { POLLUTANT_LABEL, POLLUTANT_RANGE, POLLUTANT_UNIT, legendGradient } from '../utils/colors';
import { StatusBadge } from '../components/ui';

export function MapLegend() {
  const pollutant = useTwinStore((s) => s.pollutant);
  const status = useTwinStore((s) => s.base?.status ?? 'DEMO');
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const [lo, hi] = POLLUTANT_RANGE[pollutant];
  const dp = pollutant === 'co' ? 1 : 0;

  return (
    <div
      className={`sheet-surface theme-cream hairline pointer-events-auto absolute bottom-8 z-10 w-[190px] p-3 max-md:hidden ${
        rightOpen ? 'right-3 md:right-[368px] xl:right-[416px]' : 'right-3'
      }`}
      role="img"
      aria-label={`Legend for ${POLLUTANT_LABEL[pollutant]}, ${lo} to ${hi} ${POLLUTANT_UNIT[pollutant]}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-sand-50">{POLLUTANT_LABEL[pollutant]}</span>
        <StatusBadge status={status} />
      </div>
      <div className="h-2.5 w-full rounded-full" style={{ background: legendGradient() }} />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-sand-300">
        <span>{lo.toFixed(dp)}</span>
        <span>{((lo + hi) / 2).toFixed(dp)}</span>
        <span>{hi.toFixed(dp)}+</span>
      </div>
      <div className="mt-1 text-[10px] text-sand-400">{POLLUTANT_UNIT[pollutant]} (colour scale only)</div>
    </div>
  );
}
