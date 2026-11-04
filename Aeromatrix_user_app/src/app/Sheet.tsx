import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const CLOSE_DISTANCE = 90;

/**
 * Detail panel: a bottom sheet on phones and tablets (drag the handle down to close), a card on the right on wide
 * screens. The bottom padding keeps the last controls clear of the two round launchers in the corners.
 */
export function Sheet({ title, subtitle, onClose, children, chips, full = false }: { title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode; chips?: ReactNode; full?: boolean }) {
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const down = (e: ReactPointerEvent) => {
    start.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    if (start.current === null) return;
    last.current = Math.max(0, e.clientY - start.current);
    setDy(last.current);
  };
  const up = () => {
    if (start.current === null) return;
    start.current = null;
    // The ref, not the state: a quick flick can release before the last move has re-rendered.
    if (last.current > CLOSE_DISTANCE) onClose();
    else setDy(0);
    last.current = 0;
  };

  // Drawn on the page itself: inside an animated page container a fixed panel would be sized to that container.
  return createPortal(
    <aside
      role="dialog"
      aria-label={title}
      style={dy > 0 ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
      className={`animate-sheet-up fixed inset-x-0 flex flex-col ${full ? 'inset-y-0 z-50 max-h-none rounded-none' : 'bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 max-h-[78dvh] rounded-t-3xl'} lg:max-h-none lg:rounded-2xl bg-ink-950 shadow-2xl hairline lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-16 lg:max-h-none lg:w-[420px]`}
    >
      <div
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center lg:hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-hidden
      >
        <span className="h-1.5 w-10 rounded-full bg-sand-500/50" />
      </div>
      <header className="flex items-start justify-between gap-3 border-b border-sand-500/20 px-4 pb-3 pt-1 lg:pt-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-snug text-sand-50">{title}</h2>
          {subtitle && <div className="mt-0.5 text-xs text-sand-300">{subtitle}</div>}
          {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="gov-tap flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-800">
          <X size={18} />
        </button>
      </header>
      <div className="panel-scroll min-h-0 flex-1 p-4 pb-8 lg:pb-6">{children}</div>
    </aside>,
    document.body,
  );
}
