import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { PUNE_LOCALITIES } from '../data/geojson/puneLocalities';
import { useTwinStore } from '../store/useTwinStore';

/** Typeahead over the known localities; flies the camera there. */
export function PlaceSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const flyTo = useTwinStore((s) => s.flyTo);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return PUNE_LOCALITIES.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 6);
  }, [q]);

  const pick = (i: number) => {
    const p = matches[i];
    if (!p) return;
    flyTo(p.center[0], p.center[1], 3500);
    setQ(p.name);
    setOpen(false);
  };

  return (
    <div className="relative flex items-center gap-1.5">
      <div className="relative min-w-0 flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sand-400" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls="place-results"
          aria-autocomplete="list"
          aria-label="Search a place in Pune"
          placeholder="Search a place (Kothrud, Hadapsar…)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(matches.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              pick(active);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="h-11 w-full rounded-xl bg-ink-900/90 pl-9 pr-3 text-sm text-sand-50 shadow-lg backdrop-blur placeholder:text-sand-500 hairline md:h-10"
        />
        {open && matches.length > 0 && (
          <ul
            id="place-results"
            role="listbox"
            className="sheet-surface theme-cream hairline absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden p-1"
          >
            {matches.map((m, i) => (
              <li key={m.name} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                  className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-sand-50 md:min-h-9 ${i === active ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
                >
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
