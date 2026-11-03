import { Segmented } from '../components/ui';
import { PlaceSearch } from './PlaceSearch';
import { useTwinStore } from '../store/useTwinStore';
import type { DisplayMode } from '../types';

/** Display mode (Baseline | Scenario | Change) and place search, floating over the map. */
export function MapTopBar() {
  const mode = useTwinStore((s) => s.displayMode);
  const setMode = useTwinStore((s) => s.setDisplayMode);
  const leftOpen = useTwinStore((s) => s.leftOpen);
  const rightOpen = useTwinStore((s) => s.rightOpen);

  return (
    <div
      className={`pointer-events-none absolute top-3 z-10 flex flex-col gap-2 max-md:left-3 max-md:right-16 md:flex-row md:items-center ${
        leftOpen ? 'md:left-[356px] xl:left-[404px]' : 'md:left-16'
      } ${rightOpen ? 'md:right-[420px] xl:right-[468px]' : 'md:right-16'}`}
    >
      <div className="pointer-events-auto shrink-0">
        <Segmented<DisplayMode>
          ariaLabel="Map display mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'baseline', label: 'Baseline', title: 'Current conditions (DEMO)' },
            { value: 'scenario', label: 'Scenario', title: 'Active what-if scenario' },
            { value: 'delta', label: 'Change', title: 'Scenario minus baseline' },
          ]}
        />
      </div>
      <div className="pointer-events-auto min-w-0 md:max-w-[420px] md:flex-1">
        <PlaceSearch />
      </div>
    </div>
  );
}
