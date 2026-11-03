import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Eye, ScanSearch, X } from 'lucide-react';
import { LogoMark } from './Brand';
import { useTwinStore } from '../store/useTwinStore';

const STEPS = [
  {
    icon: Eye,
    title: 'Understand',
    body: 'Read the city zone by zone: pollution, traffic, industry and green cover in 3D.',
  },
  {
    icon: ScanSearch,
    title: 'Inspect',
    body: 'Switch pollutants, find hotspots and see what drives each one.',
  },
];

export function IntroOverlay() {
  const introOpen = useTwinStore((s) => s.introOpen);
  const setIntroOpen = useTwinStore((s) => s.setIntroOpen);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

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
      // Two focusable controls: keep focus inside the dialog.
      const order = [closeRef.current, primaryRef.current].filter(Boolean) as HTMLElement[];
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
            <div key={s.title} className="rounded-2xl bg-ink-850 p-4 hairline">
              <s.icon size={22} className="mb-2 text-accent-500" />
              <h2 className="mb-1 text-sm font-bold text-sand-50">{s.title}</h2>
              <p className="text-xs leading-relaxed text-sand-300">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-ink-850 p-3 text-xs leading-relaxed text-sand-300 hairline">
          Everything you see is <strong className="text-sand-100">DEMO</strong> data from a prototype model. It is not
          a measurement or a forecast.
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
