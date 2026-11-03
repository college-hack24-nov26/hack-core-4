import { Segmented } from '../components/ui';
import { PlaceSearch } from './PlaceSearch';
import { useTwinStore } from '../store/useTwinStore';
import { useMapSource } from './heatSource';
import type { DisplayMode } from '../types';

/** The Commissioner sees the estimated surface now, or the forecast. */
const DATA: Array<{ value: DisplayMode; label: string; title: string }> = [
  { value: 'current', label: 'Estimated now', title: 'Estimated from model data' },
  { value: 'forecast', label: 'Forecast', title: 'Forecast, not a measurement' },
];

/** Display mode and place search, floating over the map. */
export function MapTopBar() {
  const mode = useTwinStore((s) => s.displayMode);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const src = useMapSource();

  return (
    <div className="pointer-events-none absolute top-3 z-10 flex flex-col gap-2 max-md:left-3 max-md:right-16 md:left-16 md:right-16 md:flex-row md:flex-wrap md:items-center">
      <div className="pointer-events-auto flex shrink-0 flex-wrap gap-1.5">
        <Segmented<DisplayMode> ariaLabel="Display" value={mode} onChange={setMode} options={DATA} />
      </div>
      <div className="pointer-events-auto min-w-0 md:max-w-[360px] md:flex-1">
        <PlaceSearch />
      </div>
      {src.values === null && (
        <p role="status" className="pointer-events-auto w-full rounded-xl bg-ink-900/95 px-3 py-2 text-xs text-sand-200 shadow-lg hairline md:max-w-[520px]">
          <strong className="text-sand-50">Nothing to show for this view.</strong> {src.reason}
        </p>
      )}
    </div>
  );
}
