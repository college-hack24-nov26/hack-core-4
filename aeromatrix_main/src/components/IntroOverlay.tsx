import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ClipboardList, Eye, Factory, ListChecks, RadioTower, ScanSearch, SlidersHorizontal, X, type LucideIcon } from 'lucide-react';
import { LogoMark } from './Brand';
import { useTwinStore } from '../store/useTwinStore';
import type { Section } from '../types';

const STEPS: Array<{ icon: LucideIcon; title: string; body: string; section: Section | null; planIt?: boolean }> = [
  {
    icon: Eye,
    title: 'Understand',
    body: 'Read the city zone by zone: pollution, traffic, industry and green cover in 3D.',
    section: 'overview',
  },
  {
    icon: ScanSearch,
    title: 'Inspect',
    body: 'Switch pollutants, find hotspots and see what drives each one.',
    section: 'air',
  },
  {
    icon: SlidersHorizontal,
    title: 'Simulate',
    body: 'Change traffic, industry, green cover or weather and watch the map respond live.',
    section: 'simulator',
  },
  {
    icon: ListChecks,
    title: 'Act',
    body: 'Rank six reduction actions and compare candidate sites for a new industry.',
    section: 'actions',
  },
  {
    icon: Factory,
    title: 'Industries',
    body: 'See MIDC estates and mapped industry sites, and test reducing, shutting down or relocating them.',
    section: 'industries',
  },
  {
    icon: RadioTower,
    title: 'Sensors',
    body: 'Replay a past hour with sensors removed and see how the second model recovers them.',
    section: 'sensors',
  },
  {
    icon: ClipboardList,
    title: 'Plan-It',
    body: 'Turn a budget into ranked, costed plans with sourced prices, and download a PDF.',
    section: null,
    planIt: true,
  },
];

export function IntroOverlay() {
  const introOpen = useTwinStore((s) => s.introOpen);
  const setIntroOpen = useTwinStore((s) => s.setIntroOpen);
  const setSection = useTwinStore((s) => s.setSection);
  const setLeftOpen = useTwinStore((s) => s.setLeftOpen);
  const setPlanItOpen = useTwinStore((s) => s.setPlanItOpen);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!introOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    return () => previous?.focus?.();
  }, [introOpen]);

  if (!introOpen) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setIntroOpen(false);
    } else if (e.key === 'Tab') {
      // Keep focus inside the dialog.
      const order = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
      const i = order.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (i <= 0 ? order.length - 1 : i - 1) : i === order.length - 1 ? 0 : i + 1;
      e.preventDefault();
      order[next]?.focus();
    }
  };

  return (
    <div
      className="animate-fade absolute inset-0 z-50 flex items-center justify-center bg-ink-950/70 p-4 backdrop-blur-sm"
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        className="sheet-surface theme-cream hairline animate-rise relative max-h-full w-full max-w-[560px] overflow-y-auto p-6"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={() => setIntroOpen(false)}
          aria-label="Close guide"
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-800"
        >
          <X size={18} />
        </button>
        <div className="mb-3 flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <h1 id="intro-title" className="font-display text-xl font-bold text-sand-50">
              Welcome to AeroMatrix
            </h1>
            <p className="text-xs text-sand-400">An urban air-quality digital twin of Pune and Pimpri-Chinchwad</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => {
                if (s.section) {
                  setSection(s.section);
                  setLeftOpen(true);
                }
                setIntroOpen(false);
                if (s.planIt) setPlanItOpen(true);
              }}
              className="rounded-2xl bg-ink-850 p-4 text-left hairline transition-colors hover:bg-ink-800"
            >
              <s.icon size={22} className="mb-2 text-accent-500" />
              <h2 className="mb-1 text-sm font-bold text-sand-50">{s.title}</h2>
              <p className="text-xs leading-relaxed text-sand-300">{s.body}</p>
            </button>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
          What-if results are hypothetical estimates, not forecasts.
        </p>
        <button
          ref={primaryRef}
          type="button"
          onClick={() => setIntroOpen(false)}
          className="mt-4 h-11 w-full rounded-xl bg-accent-500 text-sm font-bold text-sand-50 hover:bg-accent-400"
        >
          Start exploring
        </button>
      </div>
    </div>
  );
}
