import { PlaceSearch } from './PlaceSearch';
import { useTwinStore } from '../store/useTwinStore';
import { useMapSource } from './heatSource';

/** Place search, floating over the map. */
export function MapTopBar() {
  const mode = useTwinStore((s) => s.displayMode);
  const leftOpen = useTwinStore((s) => s.leftOpen);
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const src = useMapSource();

  return (
    <div
      className={`pointer-events-none absolute top-3 z-10 flex flex-col gap-2 max-md:left-3 max-md:right-16 md:flex-row md:flex-wrap md:items-center ${
        leftOpen ? 'md:left-[356px] xl:left-[404px]' : 'md:left-16'
      } ${rightOpen ? 'md:right-[420px] xl:right-[468px]' : 'md:right-16'}`}
    >
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
