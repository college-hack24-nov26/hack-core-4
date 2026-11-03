import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Detail panel: a bottom sheet on phones and tablets, a card on the right on wide screens. The bottom padding keeps
 * the last controls clear of the two round launchers in the corners.
 */
export function Sheet({ title, subtitle, onClose, children, chips }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; chips?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <aside
      role="dialog"
      aria-label={title}
      className="animate-sheet-up fixed inset-x-0 bottom-0 z-20 flex max-h-[78dvh] flex-col rounded-t-3xl bg-ink-950 shadow-2xl hairline lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-16 lg:max-h-none lg:w-[420px] lg:rounded-2xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-sand-500/20 p-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-snug text-sand-50">{title}</h2>
          {subtitle && <div className="mt-0.5 text-xs text-sand-300">{subtitle}</div>}
          {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="gov-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-800">
          <X size={18} />
        </button>
      </header>
      <div className="panel-scroll min-h-0 flex-1 p-4 pb-28 lg:pb-6">{children}</div>
    </aside>
  );
}
