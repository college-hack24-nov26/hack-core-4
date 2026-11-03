import { useMemo } from 'react';
import { useTwinStore } from '../store/useTwinStore';
import { POLLUTANT_LABEL, POLLUTANT_RANGE, POLLUTANT_UNIT, deltaScaleFor, legendGradient } from '../utils/colors';
import { StatusBadge } from '../components/ui';
import { OSM_ATTRIBUTION } from '../services/osmGeometry';

export function MapLegend() {
  const pollutant = useTwinStore((s) => s.pollutant);
  const mode = useTwinStore((s) => s.displayMode);
  const result = useTwinStore((s) => s.activeResult);
  const status = useTwinStore((s) => s.base?.status ?? 'DEMO');
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const geometry = useTwinStore((s) => s.geometryInfo);
  const [lo, hi] = POLLUTANT_RANGE[pollutant];
  const dp = pollutant === 'co' ? 1 : 0;
  const showDelta = mode === 'delta' && !!result;

  const scale = useMemo(
    () => (result ? deltaScaleFor(pollutant, Object.values(result.delta).map((d) => d[pollutant])) : 1),
    [result, pollutant],
  );
  const sdp = scale < 1 ? 2 : scale < 10 ? 1 : 0;

  return (
    <>
    <div
      className={`sheet-surface theme-cream hairline pointer-events-auto absolute bottom-8 z-10 w-[200px] p-3 max-md:hidden ${
        rightOpen ? 'right-3 md:right-[368px] xl:right-[416px]' : 'right-3'
      }`}
      role="img"
      aria-label={
        showDelta
          ? `Legend for the change in ${POLLUTANT_LABEL[pollutant]}, minus ${scale} to plus ${scale} ${POLLUTANT_UNIT[pollutant]}`
          : `Legend for ${POLLUTANT_LABEL[pollutant]}, ${lo} to ${hi} ${POLLUTANT_UNIT[pollutant]}`
      }
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-sand-50">
          {showDelta ? `Change in ${POLLUTANT_LABEL[pollutant]}` : POLLUTANT_LABEL[pollutant]}
        </span>
        <StatusBadge status={mode === 'baseline' ? status : 'MODELED_SCENARIO'} />
      </div>
      {showDelta ? (
        <>
          <div
            className="h-2.5 w-full rounded-full"
            style={{ background: 'linear-gradient(to right, rgb(56,189,248), rgb(30,41,59) 50%, rgb(244,63,94))' }}
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-sand-300">
            <span>-{scale.toFixed(sdp)}</span>
            <span>0</span>
            <span>+{scale.toFixed(sdp)}</span>
          </div>
          <div className="mt-1 text-[10px] text-sand-400">{POLLUTANT_UNIT[pollutant]}: blue = modeled decrease, rose = increase</div>
          <div className="mt-1 text-[10px] text-sand-400">Outlined zones changed by 0.5 ug/m3 PM2.5 or more.</div>
        </>
      ) : (
        <>
          <div className="h-2.5 w-full rounded-full" style={{ background: legendGradient() }} />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-sand-300">
            <span>{lo.toFixed(dp)}</span>
            <span>{((lo + hi) / 2).toFixed(dp)}</span>
            <span>{hi.toFixed(dp)}+</span>
          </div>
          <div className="mt-1 text-[10px] text-sand-400">
            {POLLUTANT_UNIT[pollutant]} (colour scale only){mode === 'scenario' ? ', scenario values' : ''}
          </div>
        </>
      )}
      {geometry.source === 'osm' && <div className="mt-1.5 border-t border-sand-400/15 pt-1 text-[9px] leading-snug text-sand-500">{geometry.attribution ?? OSM_ATTRIBUTION}</div>}
    </div>
    {geometry.source === 'osm' && (
      <div className="pointer-events-none absolute bottom-6 right-2 z-10 rounded bg-ink-950/70 px-1.5 py-0.5 text-[9px] text-sand-300 md:hidden">
        {geometry.attribution ?? OSM_ATTRIBUTION}
      </div>
    )}
    </>
  );
}
