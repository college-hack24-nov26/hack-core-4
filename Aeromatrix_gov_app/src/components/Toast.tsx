import { useEffect } from 'react';
import { Info, X } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';

/** One transient notice at a time (e.g. "scenario reset because the geometry changed"). */
export function Toast() {
  const notice = useTwinStore((s) => s.notice);
  const setNotice = useTwinStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 9000);
    return () => window.clearTimeout(t);
  }, [notice, setNotice]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className="animate-rise absolute bottom-24 left-1/2 z-40 flex w-[min(92vw,460px)] -translate-x-1/2 items-start gap-2 rounded-2xl bg-ink-900 p-3 text-xs text-sand-100 shadow-2xl hairline max-md:bottom-[calc(50dvh)]"
    >
      <Info size={16} className="mt-0.5 shrink-0 text-accent-300" />
      <p className="min-w-0 flex-1 leading-snug">{notice.text}</p>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label="Dismiss"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-700"
      >
        <X size={14} />
      </button>
    </div>
  );
}
