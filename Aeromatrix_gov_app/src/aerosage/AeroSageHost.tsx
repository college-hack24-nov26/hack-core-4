import { useEffect, useState } from 'react';
import { AeroSageAvatar } from './AeroSageAvatar';
import { AeroSageChat } from './AeroSageChat';

/** True at 1024 px and wider, where the chat docks at the side instead of covering the screen as a bottom sheet. */
function useWide(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Launcher button plus the chat. Wide screens get a docked panel that is never wider than the screen minus 320 px,
 * so that much of the map stays visible. Narrow screens get a bottom sheet.
 */
export function AeroSageHost() {
  const [open, setOpen] = useState(false);
  const wide = useWide();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the AeroSage assistant"
          className="absolute bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink-900 shadow-xl hairline hover:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-accent-400"
        >
          <AeroSageAvatar size={40} />
        </button>
      )}
      {open && (
        <div
          className={
            wide
              ? 'absolute bottom-4 right-4 z-40 h-[min(640px,calc(100%-2rem))] w-[min(380px,calc(100%-320px))]'
              : 'absolute inset-x-0 bottom-0 z-40 h-[75%] p-2'
          }
        >
          <AeroSageChat onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
