import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Factory, Grid3x3, LayoutDashboard, ListChecks, MapPinned, RadioTower, SlidersHorizontal, Wind, type LucideIcon } from 'lucide-react';
import { useTwinStore } from '../store/useTwinStore';
import type { Section } from '../types';

export const SECTION_LABEL: Record<Section, string> = {
  overview: 'Overview',
  air: 'Air Quality',
  zones: 'Zones',
  traffic: 'Traffic',
  industries: 'Industries',
  green: 'Green Cover',
  simulator: 'What-If',
  scenarios: 'Scenarios',
  actions: 'Actions',
  locations: 'Sites',
  sensors: 'Sensors',
  analytics: 'Analytics',
  data: 'Data',
};

/** Launcher order. Final order: Overview, Air Quality, Zones, Industries, Actions, What-If, Sites, Sensors. Traffic, Green, Scenarios, Analytics and Data stay mounted for deep links only. */
export const ORBIT_ITEMS: { id: Section; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'air', icon: Wind },
  { id: 'zones', icon: Grid3x3 },
  { id: 'industries', icon: Factory },
  { id: 'actions', icon: ListChecks },
  { id: 'simulator', icon: SlidersHorizontal },
  { id: 'locations', icon: MapPinned },
  { id: 'sensors', icon: RadioTower },
];

const RADIUS = 170;
const START_DEG = -100;
const END_DEG = 10;
const LAUNCHER = 56;
const ITEM = 44;

export function OrbitNav() {
  const [open, setOpen] = useState(false);
  const section = useTwinStore((s) => s.section);
  const leftOpen = useTwinStore((s) => s.leftOpen);
  const rightOpen = useTwinStore((s) => s.rightOpen);
  const setSection = useTwinStore((s) => s.setSection);
  const setLeftOpen = useTwinStore((s) => s.setLeftOpen);
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
      const idx = Math.max(0, ORBIT_ITEMS.findIndex((i) => i.id === section));
      // Wait for the items to become focusable.
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

  const choose = (id: Section) => {
    setSection(id);
    setLeftOpen(true);
    close(true);
  };

  const lifted = leftOpen || rightOpen;
  const lift = rightOpen ? 'calc(60dvh + 12px)' : leftOpen ? 'calc(46dvh + 12px)' : '16px';

  return (
    <div
      ref={wrapRef}
      onKeyDown={onKeyDown}
      className="absolute left-9 z-30 bottom-4 max-md:bottom-[var(--lift)]"
      style={{ width: LAUNCHER, height: LAUNCHER, ['--lift' as string]: lifted ? lift : '16px' }}
    >
      {ORBIT_ITEMS.map((item, i) => {
        const deg = START_DEG + (i * (END_DEG - START_DEG)) / Math.max(1, ORBIT_ITEMS.length - 1);
        const rad = (deg * Math.PI) / 180;
        const x = LAUNCHER / 2 + RADIUS * Math.cos(rad) - ITEM / 2;
        const y = LAUNCHER / 2 + RADIUS * Math.sin(rad) - ITEM / 2;
        const Icon = item.icon;
        const active = section === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            tabIndex={open ? 0 : -1}
            aria-label={SECTION_LABEL[item.id]}
            aria-current={active ? 'page' : undefined}
            onClick={() => choose(item.id)}
            className={`group absolute flex items-center justify-center rounded-full shadow-xl hairline transition-all duration-300 ease-out-soft hover:z-20 focus-visible:z-20 ${
              active ? 'bg-accent-500 text-sand-50' : 'bg-ink-900 text-sand-100 hover:bg-ink-700'
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
            {/* The name sits on the outer side of the arc (away from the launcher and the other icons), so it never covers a neighbour. */}
            <span
              className="pointer-events-none absolute whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs font-semibold text-sand-100 opacity-0 shadow-lg hairline transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${Math.cos(rad) * 50}% + ${Math.cos(rad) * (ITEM / 2 + 8)}px), calc(-50% + ${Math.sin(rad) * 50}% + ${Math.sin(rad) * (ITEM / 2 + 8)}px))`,
              }}
            >
              {SECTION_LABEL[item.id]}
            </span>
          </button>
        );
      })}

      <button
        ref={launcherRef}
        type="button"
        aria-label={open ? 'Close section launcher' : 'Open section launcher'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
        className={`absolute inset-0 z-30 flex aspect-square items-center justify-center overflow-hidden rounded-full bg-[#fcf1e6] shadow-2xl ring-2 transition-all ${
          open ? 'scale-95 ring-accent-500' : 'animate-pulse-ring ring-accent-500/50'
        }`}
      >
        <img src="/aeromatrix-logo.png" alt="" width={LAUNCHER} height={LAUNCHER} draggable={false} className="h-[70%] w-[70%] object-contain" />
      </button>
    </div>
  );
}
