import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useGovStore } from './govStore';
import { SEVERITY_LABEL, useAlerts, type GovAlert } from './lib/alerts';

/** The bell beside the theme button, with the count of new alerts. It rings once when a new alert arrives. */
export function AlertBell() {
  const { newCount } = useAlerts();
  const setView = useGovStore((s) => s.setView);
  const [ring, setRing] = useState(false);
  const prev = useRef(newCount);
  useEffect(() => {
    if (newCount > prev.current) {
      setRing(true);
      const t = setTimeout(() => setRing(false), 1400);
      prev.current = newCount;
      return () => clearTimeout(t);
    }
    prev.current = newCount;
  }, [newCount]);

  return (
    <button type="button" onClick={() => setView('alerts')} aria-label={newCount > 0 ? `Alerts, ${newCount} new` : 'Alerts'} className="gov-tap relative flex h-11 w-11 items-center justify-center rounded-xl text-sand-200 transition-colors hover:bg-ink-800">
      <Bell size={19} className={ring ? 'gov-ring' : ''} />
      {newCount > 0 && (
        <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#d9372f] px-1 text-[10px] font-bold text-white ring-2 ring-ink-900">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#d9372f]/50 [animation-iteration-count:3]" aria-hidden />
          <span className="relative">{newCount > 9 ? '9+' : newCount}</span>
        </span>
      )}
    </button>
  );
}

/** A banner that slides in when a new alert appears while the app is open, so it is seen without opening the inbox. */
export function AlertBanner() {
  const { alerts } = useAlerts();
  const setView = useGovStore((s) => s.setView);
  const select = useGovStore((s) => s.selectAlert);
  const known = useRef<Set<string> | null>(null);
  const [shown, setShown] = useState<GovAlert | null>(null);

  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    if (known.current === null) {
      if (alerts.length > 0 || ids.size === 0) known.current = ids; // the first load is not "new"
      return;
    }
    const fresh = alerts.find((a) => !known.current!.has(a.id) && a.record.status === 'new');
    known.current = ids;
    if (fresh) {
      setShown(fresh);
      try {
        navigator.vibrate?.(60);
      } catch {
        /* no vibration on this device */
      }
    }
  }, [alerts]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 8000);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <div role="status" className="gov-alert-in pointer-events-none absolute inset-x-3 top-[calc(4.75rem+env(safe-area-inset-top))] z-40 mx-auto max-w-md">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-sand-500/20 bg-ink-950 p-3 pl-4 shadow-2xl">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#d9372f]" />
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => {
            select(shown.id);
            setView('alerts');
            setShown(null);
          }}
        >
          <span className="block text-xs font-semibold text-sand-400">New {SEVERITY_LABEL[shown.severity].toLowerCase()} alert</span>
          <span className="block truncate text-sm font-medium text-sand-50">{shown.title}</span>
        </button>
        <button type="button" aria-label="Dismiss" onClick={() => setShown(null)} className="gov-tap flex h-10 w-10 items-center justify-center rounded-xl text-sand-400 hover:bg-ink-800">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
