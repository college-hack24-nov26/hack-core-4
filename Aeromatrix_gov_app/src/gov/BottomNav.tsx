import { useEffect, useRef, useState } from 'react';
import { Bell, FileText, Flame, LayoutDashboard, MapPinned, MoreHorizontal, RadioTower, Settings, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { useGovStore, type GovView } from './govStore';

export const VIEW_LABEL: Record<GovView, string> = {
  home: 'Home',
  alerts: 'Alerts',
  map: 'Map',
  stations: 'Stations',
  hotspots: 'Hotspots',
  simulator: 'What if',
  reports: 'Reports',
  settings: 'Settings',
};

const MAIN: Array<{ id: GovView; icon: LucideIcon }> = [
  { id: 'home', icon: LayoutDashboard },
  { id: 'map', icon: MapPinned },
  { id: 'simulator', icon: SlidersHorizontal },
  { id: 'reports', icon: FileText },
];
const MORE: Array<{ id: GovView; icon: LucideIcon }> = [
  { id: 'alerts', icon: Bell },
  { id: 'hotspots', icon: Flame },
  { id: 'stations', icon: RadioTower },
  { id: 'settings', icon: Settings },
];

/** The bottom bar: Home, Map, What if and Reports within one tap; Alerts, Hotspots and Stations under More. */
export function BottomNav() {
  const view = useGovStore((s) => s.view);
  const setView = useGovStore((s) => s.setView);
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const inMore = MORE.some((m) => m.id === view);
  const slot = more || inMore ? 4 : Math.max(0, MAIN.findIndex((m) => m.id === view));

  useEffect(() => {
    if (!more) return;
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMore(false);
    };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [more]);

  const go = (id: GovView) => {
    setView(id);
    setMore(false);
  };

  return (
    <nav ref={ref} aria-label="Main" className="gov-nav-wrap">
      {more && (
        <ul className="gov-pop pointer-events-auto absolute bottom-full right-4 mb-2 w-52 overflow-hidden rounded-2xl border border-sand-500/20 bg-ink-950 p-1.5 shadow-2xl">
          {MORE.map(({ id, icon: Icon }) => (
            <li key={id}>
              <button type="button" onClick={() => go(id)} aria-current={view === id ? 'page' : undefined} className={`gov-tap flex w-full items-center gap-3 rounded-xl px-3 text-sm font-medium ${view === id ? 'bg-accent-500 text-white' : 'text-sand-100 hover:bg-ink-800'}`}>
                <Icon size={18} /> {VIEW_LABEL[id]}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="gov-nav-pill relative grid grid-cols-5 p-1.5">
        <span
          aria-hidden
          className="absolute bottom-1.5 top-1.5 rounded-2xl bg-accent-500/15 transition-transform duration-300 ease-out"
          style={{ left: '0.375rem', width: 'calc((100% - 0.75rem) / 5)', transform: `translateX(${slot * 100}%)` }}
        />
        {MAIN.map(({ id, icon: Icon }) => {
          const on = view === id && !more;
          return (
            <button key={id} type="button" onClick={() => go(id)} aria-current={on ? 'page' : undefined} className={`gov-tap flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${on ? 'text-accent-400' : 'text-sand-300 hover:text-sand-50'}`}>
              <Icon size={21} className={`transition-transform duration-200 ${on ? '-translate-y-0.5 scale-110' : ''}`} />
              {VIEW_LABEL[id]}
            </button>
          );
        })}
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} aria-haspopup="menu" className={`gov-tap flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${more || inMore ? 'text-accent-400' : 'text-sand-300 hover:text-sand-50'}`}>
          <MoreHorizontal size={21} />
          More
        </button>
      </div>
    </nav>
  );
}
