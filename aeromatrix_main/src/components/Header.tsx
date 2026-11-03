import { useEffect, useRef, useState } from 'react';
import { CircleHelp, Database } from 'lucide-react';
import { LogoMark, Wordmark } from './Brand';
import { Segmented, StatusBadge, STATUS_STYLE } from './ui';
import { useTwinStore } from '../store/useTwinStore';
import { POLLUTANT_LABEL } from '../utils/colors';
import { POLLUTANTS } from '../services/pollutionModel';
import type { DataStatus, Pollutant } from '../types';

const STATUS_ORDER: DataStatus[] = ['DEMO', 'MODELED_SCENARIO', 'OBSERVED', 'MODEL_DATA', 'MODEL_PREDICTION'];

function DataSourceMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-xl text-xs md:w-auto md:px-2.5 font-semibold text-sand-200 hairline hover:bg-ink-800 md:h-9"
      >
        <Database size={16} />
        <span className="max-md:hidden">Data</span>
        <StatusBadge status="DEMO" className="max-md:hidden" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="About the data"
          className="sheet-surface theme-cream hairline animate-rise absolute right-0 top-full z-50 mt-2 w-[min(88vw,340px)] p-4"
        >
          <h2 className="mb-1 text-sm font-bold text-sand-50">Where the numbers come from</h2>
          <p className="mb-3 text-xs text-sand-300">
            Every value in AeroMatrix carries one of these labels. In this version, everything is{' '}
            <strong>DEMO</strong>: seeded demo inputs run through an uncalibrated rule-based model.
          </p>
          <ul className="space-y-2">
            {STATUS_ORDER.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <StatusBadge status={s} className="mt-0.5 shrink-0" />
                <span className="text-xs text-sand-200">{STATUS_STYLE[s].hint}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-sand-400">
            Never use this prototype for health, legal or planning decisions.
          </p>
        </div>
      )}
    </div>
  );
}

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
  const setGridSize = useTwinStore((s) => s.setGridSize);
  const setIntroOpen = useTwinStore((s) => s.setIntroOpen);

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-1.5 border-b border-sand-400/15 bg-ink-950 px-2.5 sm:gap-2 md:gap-4 md:px-4">
      <div className="flex items-center gap-2">
        <LogoMark size={30} />
        <Wordmark className="max-sm:hidden" />
      </div>

      <div className="ml-auto flex items-center gap-2 md:ml-4 md:flex-1">
        <div className="md:hidden">
          <label className="sr-only" htmlFor="pollutant-select">
            Pollutant
          </label>
          <select
            id="pollutant-select"
            value={pollutant}
            onChange={(e) => setPollutant(e.target.value as Pollutant)}
            className="h-11 rounded-xl bg-ink-800 px-1.5 text-xs font-semibold text-sand-100 hairline"
          >
            {POLLUTANTS.map((p) => (
              <option key={p} value={p}>
                {POLLUTANT_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <Segmented
          className="max-md:hidden"
          ariaLabel="Pollutant"
          value={pollutant}
          onChange={setPollutant}
          options={POLLUTANTS.map((p) => ({ value: p, label: POLLUTANT_LABEL[p] }))}
        />

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

      <div className="flex items-center gap-1.5">
        <DataSourceMenu />
        <button
          type="button"
          aria-label="Open the guide"
          title="Open the guide"
          onClick={() => setIntroOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-sand-200 hairline hover:bg-ink-800 md:h-9 md:w-9"
        >
          <CircleHelp size={18} />
        </button>
      </div>
    </header>
  );
}
