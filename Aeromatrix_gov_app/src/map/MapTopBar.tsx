import { Segmented } from '../components/ui';
import { PlaceSearch } from './PlaceSearch';
import { useTwinStore } from '../store/useTwinStore';
import { useMapSource } from './heatSource';
import type { DisplayMode } from '../types';

const MODELED: Array<{ value: DisplayMode; label: string; title: string }> = [
  { value: 'baseline', label: 'Baseline', title: 'Prototype rule model on DEMO inputs' },
  { value: 'scenario', label: 'Scenario', title: 'Active what-if scenario (MODELED_SCENARIO)' },
  { value: 'delta', label: 'Change', title: 'Scenario minus baseline' },
];
const DATA: Array<{ value: DisplayMode; label: string; title: string }> = [
  { value: 'current', label: 'Current', title: 'Open-Meteo CAMS model data (MODEL_DATA)' },
  { value: 'observed', label: 'Observed', title: 'Imported station observations (OBSERVED)' },
  { value: 'forecast', label: 'Forecast', title: 'Trained-model +24 h forecast (MODEL_PREDICTION)' },
];

/** Display mode and place search, floating over the map. */
export function MapTopBar() {
  const mode = useTwinStore((s) => s.displayMode);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const leftOpen = useTwinStore((s) => s.leftOpen);
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const src = useMapSource();

  return (
    <div
      className={`pointer-events-none absolute top-3 z-10 flex flex-col gap-2 max-md:left-3 max-md:right-16 md:flex-row md:flex-wrap md:items-center ${
        leftOpen ? 'md:left-[356px] xl:left-[404px]' : 'md:left-16'
      } ${rightOpen ? 'md:right-[420px] xl:right-[468px]' : 'md:right-16'}`}
    >
      <div className="pointer-events-auto flex shrink-0 flex-wrap gap-1.5">
        <Segmented<DisplayMode> ariaLabel="Modeled display mode" value={mode} onChange={setMode} options={MODELED} />
        <Segmented<DisplayMode> ariaLabel="Data display mode" value={mode} onChange={setMode} options={DATA} />
      </div>
      <div className="pointer-events-auto min-w-0 md:max-w-[360px] md:flex-1">
        <PlaceSearch />
      </div>
      {src.values === null && (
        <p
          role="status"
          className="pointer-events-auto w-full rounded-xl bg-ink-900/95 px-3 py-2 text-xs text-sand-200 shadow-lg hairline md:max-w-[520px]"
        >
          <strong className="text-sand-50">No {mode} overlay.</strong> {src.reason}
        </p>
      )}
    </div>
  );
}
