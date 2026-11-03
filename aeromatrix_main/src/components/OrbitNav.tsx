import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Grid3x3, LayoutDashboard, Wind, type LucideIcon } from 'lucide-react';
import { LogoMark } from './Brand';
import { useTwinStore } from '../store/useTwinStore';
import type { Section } from '../types';

export const SECTION_LABEL: Record<Section, string> = {
  overview: 'Overview',
  air: 'Air Quality',
  zones: 'Zones',
  traffic: 'Traffic',
  industries: 'Industries',
  green: 'Green Cover',
  simulator: 'Simulator',
  scenarios: 'Scenarios',
  actions: 'Actions',
  locations: 'Locations',
  sensors: 'Sensors',
  analytics: 'Analytics',
  data: 'Data',
};

/** V1 wires only these three sections. */
export const ORBIT_ITEMS: { id: Section; icon: LucideIcon }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'air', icon: Wind },
  { id: 'zones', icon: Grid3x3 },
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
            className={`group absolute flex items-center justify-center rounded-full shadow-xl hairline transition-all duration-300 ease-out-soft ${
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
            <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs font-semibold text-sand-100 opacity-0 shadow-lg hairline transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
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
        className={`absolute inset-0 flex items-center justify-center rounded-full bg-ink-950 shadow-2xl ring-2 ring-sand-400/30 transition-transform ${
          open ? 'rotate-90' : 'animate-pulse-ring'
        }`}
      >
        <LogoMark size={LAUNCHER - 8} />
      </button>
    </div>
  );
}
