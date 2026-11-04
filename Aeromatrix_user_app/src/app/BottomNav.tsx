import { LayoutDashboard, MapPinned, RadioTower, Settings, ShoppingBag, type LucideIcon } from 'lucide-react';
import { useUserStore, type UserView } from './userStore';

export const VIEW_LABEL: Record<UserView, string> = {
  home: 'Home',
  map: 'Map',
  stations: 'Stations',
  shop: 'Shop',
  settings: 'Settings',
};

const ITEMS: Array<{ id: UserView; icon: LucideIcon }> = [
  { id: 'home', icon: LayoutDashboard },
  { id: 'map', icon: MapPinned },
  { id: 'stations', icon: RadioTower },
  { id: 'shop', icon: ShoppingBag },
  { id: 'settings', icon: Settings },
];

/** The floating bottom bar: Home, Map, Stations, Shop and Settings. */
export function BottomNav() {
  const view = useUserStore((s) => s.view);
  const setView = useUserStore((s) => s.setView);
  const slot = Math.max(
    0,
    ITEMS.findIndex((m) => m.id === view),
  );

  return (
    <nav aria-label="Main" className="gov-nav-wrap">
      <div className="gov-nav-pill relative grid grid-cols-5 p-1.5">
        <span
          aria-hidden
          className="absolute bottom-1.5 top-1.5 rounded-2xl bg-accent-500/15 transition-transform duration-300 ease-out"
          style={{ left: '0.375rem', width: 'calc((100% - 0.75rem) / 5)', transform: `translateX(${slot * 100}%)` }}
        />
        {ITEMS.map(({ id, icon: Icon }) => {
          const on = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-current={on ? 'page' : undefined}
              className={`gov-tap relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${on ? 'text-accent-500' : 'text-sand-300 hover:text-sand-50'}`}
            >
              <Icon size={21} className={`transition-transform duration-200 ${on ? '-translate-y-0.5 scale-110' : ''}`} />
              {VIEW_LABEL[id]}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
