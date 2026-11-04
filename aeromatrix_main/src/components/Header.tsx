import { LogoMark, Wordmark } from './Brand';
import { Segmented } from './ui';
import { useTwinStore } from '../store/useTwinStore';
import { POLLUTANT_LABEL } from '../utils/colors';
import { POLLUTANTS } from '../services/pollutionModel';
import type { Pollutant } from '../types';
import { Select } from './Select';

const env = import.meta.env as Record<string, string | undefined>;
/** The logo and name lead back to the landing page. */
export const LANDING_URL = env.VITE_LANDING_URL || 'http://localhost:3000/';

function GridLabel({ n }: { n: number }) {
  return (
    <>
      <span className="max-sm:hidden">{`${n}×${n}`}</span>
      <span className="sm:hidden">{n}</span>
    </>
  );
}

export function Header() {
  const pollutant = useTwinStore((s) => s.pollutant);
  const gridSize = useTwinStore((s) => s.gridSize);
  const setPollutant = useTwinStore((s) => s.setPollutant);
  const aqiView = useTwinStore((s) => s.aqiView);
  const setAqiView = useTwinStore((s) => s.setAqiView);
  const setGridSize = useTwinStore((s) => s.setGridSize);
  const setPlanItOpen = useTwinStore((s) => s.setPlanItOpen);

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-1.5 border-b border-sand-400/15 bg-ink-950 px-2.5 sm:gap-2 md:gap-4 md:px-4">
      <a href={LANDING_URL} aria-label="AeroMatrix home" className="flex items-center gap-2">
        <LogoMark size={30} />
        <Wordmark className="max-sm:hidden" />
      </a>

      <div className="ml-auto flex items-center gap-2 md:ml-4 md:flex-1">
        <label className="sr-only" htmlFor="pollutant-select">
          Pollutant
        </label>
        <Select
          id="pollutant-select"
          value={aqiView ? 'aqi' : pollutant}
          onChange={(e) => (e.target.value === 'aqi' ? setAqiView(true) : setPollutant(e.target.value as Pollutant))}
          className="h-11 rounded-xl bg-ink-800 px-2.5 text-sm font-semibold text-sand-100 hairline md:h-9"
        >
          <option value="aqi">AQI</option>
          {POLLUTANTS.map((p) => (
            <option key={p} value={p}>
              {POLLUTANT_LABEL[p]}
            </option>
          ))}
        </Select>

        <span className="ml-auto text-[11px] font-medium text-sand-400 max-lg:hidden">Grid</span>
        <Segmented
          className="md:ml-0"
          ariaLabel="Grid size"
          value={gridSize}
          onChange={(n) => void setGridSize(n)}
          options={[
            { value: 5, label: <GridLabel n={5} />, title: '5 by 5 zones' },
            { value: 10, label: <GridLabel n={10} />, title: '10 by 10 zones' },
            { value: 20, label: <GridLabel n={20} />, title: '20 by 20 zones' },
          ]}
        />
      </div>

      <button
        type="button"
        onClick={() => setPlanItOpen(true)}
        title="Plan-It: costed intervention planner"
        aria-label="Plan-It"
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500 text-base font-bold text-sand-50 hover:bg-accent-400 md:h-9 md:w-9"
      >
        P
      </button>
    </header>
  );
}
