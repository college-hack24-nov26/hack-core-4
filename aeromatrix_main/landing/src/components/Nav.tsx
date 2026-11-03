import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { APP_URL } from '@/lib/links';
import { Button } from '@/components/ui/button';

const LINKS = [
  { href: '#understand', label: 'Understand' },
  { href: '#predict', label: 'Predict' },
  { href: '#simulate', label: 'Simulate' },
  { href: '#capabilities', label: 'Capabilities' },
];

export function Nav() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors ${solid || open ? 'bg-cherry-950/95 shadow-lg backdrop-blur' : 'bg-transparent'}`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <a href="#top" className="flex items-center gap-2 font-display text-xl font-semibold text-cream-50">
          <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#a3263f" />
            <path d="M14 36c6-1 8-8 14-8s7 6 13 6 7-5 9-5" fill="none" stroke="#fbf5e9" strokeWidth="4" strokeLinecap="round" />
            <path d="M16 46c5-1 7-5 12-5s6 4 11 4 6-3 9-3" fill="none" stroke="#fbf5e9" strokeOpacity=".6" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <span>
            Aero<span className="text-cherry-300">Matrix</span>
          </span>
        </a>

        <ul className="hidden items-center gap-7 text-sm font-medium text-cream-200 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-cherry-200">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <a href={APP_URL}>Explore the System</a>
          </Button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-cream-50 md:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-cream-100/10 bg-cherry-950/95 px-4 pb-4 md:hidden">
          <ul className="flex flex-col py-2 text-cream-100">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="block py-3 text-base">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Button asChild className="w-full">
            <a href={APP_URL}>Explore the System</a>
          </Button>
        </div>
      )}
    </header>
  );
}
