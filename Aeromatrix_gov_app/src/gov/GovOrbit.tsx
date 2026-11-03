import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Bell, FileText, Flame, LayoutDashboard, MapPinned, RadioTower, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { LogoMark } from '../components/Brand';
import { useGovStore, type GovView } from './govStore';
import { useAlerts } from './lib/alerts';

export const VIEW_LABEL: Record<GovView, string> = {
  home: 'Home',
  alerts: 'Alerts',
  map: 'Map',
  stations: 'Stations',
  hotspots: 'Hotspots',
  simulator: 'Simulator',
  reports: 'Reports',
};

export const ORBIT_ITEMS: { id: GovView; icon: LucideIcon }[] = [
  { id: 'home', icon: LayoutDashboard },
  { id: 'alerts', icon: Bell },
  { id: 'map', icon: MapPinned },
  { id: 'stations', icon: RadioTower },
  { id: 'hotspots', icon: Flame },
  { id: 'simulator', icon: SlidersHorizontal },
  { id: 'reports', icon: FileText },
];

const RADIUS = 170;
const START_DEG = -100;
const END_DEG = 10;
const LAUNCHER = 56;
const ITEM = 44;

/** The circular bottom-left launcher: tap the mark and the screens fan out on an arc. No sidebar, no top navigation. */
export function GovOrbit() {
  const [open, setOpen] = useState(false);
  const view = useGovStore((s) => s.view);
  const setView = useGovStore((s) => s.setView);
  const { newCount } = useAlerts();
  const wrapRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) launcherRef.current?.focus();
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const idx = Math.max(0, ORBIT_ITEMS.findIndex((i) => i.id === view));
      requestAnimationFrame(() => itemRefs.current[idx]?.focus());
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close(true);
      return;
    }
    if (!open) return;
    const items = itemRefs.current;
    const current = items.findIndex((el) => el === document.activeElement);
    const step = (d: number) => {
      const next = current === -1 ? (d > 0 ? 0 : items.length - 1) : (current + d + items.length) % items.length;
      items[next]?.focus();
    };
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      step(-1);
    }
  };

  const choose = (id: GovView) => {
    setView(id);
    close(true);
  };

  return (
    <div
      ref={wrapRef}
      onKeyDown={onKeyDown}
      className="absolute left-9 z-30 max-sm:left-5"
      style={{ width: LAUNCHER, height: LAUNCHER, bottom: 'max(16px, env(safe-area-inset-bottom))' }}
    >
      {ORBIT_ITEMS.map((item, i) => {
        const deg = START_DEG + (i * (END_DEG - START_DEG)) / Math.max(1, ORBIT_ITEMS.length - 1);
        const rad = (deg * Math.PI) / 180;
        const x = LAUNCHER / 2 + RADIUS * Math.cos(rad) - ITEM / 2;
        const y = LAUNCHER / 2 + RADIUS * Math.sin(rad) - ITEM / 2;
        const Icon = item.icon;
        const active = view === item.id;
        const badge = item.id === 'alerts' && newCount > 0 ? newCount : 0;
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label={badge ? `${VIEW_LABEL[item.id]}, ${badge} new` : VIEW_LABEL[item.id]}
            aria-current={active ? 'page' : undefined}
            onClick={() => choose(item.id)}
            className={`group absolute flex items-center justify-center rounded-full shadow-xl hairline transition-all duration-300 ease-out-soft ${
              active ? 'bg-accent-500 text-white' : 'bg-ink-900 text-sand-100 hover:bg-ink-700'
            } ${open ? 'scale-100 opacity-100' : 'pointer-events-none invisible scale-50 opacity-0'}`}
            style={{
              width: ITEM,
              height: ITEM,
              left: open ? x : LAUNCHER / 2 - ITEM / 2,
              top: open ? y : LAUNCHER / 2 - ITEM / 2,
              transitionDelay: open ? `${i * 40}ms` : '0ms',
            }}
          >
            <Icon size={20} />
            {badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d9372f] px-1 text-[10px] font-bold text-white ring-2 ring-ink-950">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
            <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs font-semibold text-sand-100 opacity-0 shadow-lg hairline transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {VIEW_LABEL[item.id]}
            </span>
          </button>
        );
      })}

      <button
        ref={launcherRef}
        type="button"
        aria-label={open ? 'Close the screen launcher' : 'Open the screen launcher'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
        className={`absolute inset-0 flex items-center justify-center rounded-full bg-ink-950 shadow-2xl ring-2 ring-sand-400/30 transition-transform ${open ? 'rotate-90' : 'animate-pulse-ring'}`}
      >
        <LogoMark size={LAUNCHER - 8} />
        {!open && newCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d9372f] px-1 text-[10px] font-bold text-white ring-2 ring-ink-950">
            {newCount > 99 ? '99+' : newCount}
          </span>
        )}
      </button>
    </div>
  );
}
