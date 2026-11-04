import { useState } from 'react';
import { Check, ExternalLink, ShoppingBag, Sparkles } from 'lucide-react';
import { PRODUCTS, formatRupees, type Product } from '../lib/shop';
import { PageTitle } from '../ui';

/** A drawn picture of the prototype: a solar panel, a weather-sealed box and a wind sensor. */
export function DeviceArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 200" className={className} role="img" aria-label="The AeroMatrix AQI monitoring prototype">
      <defs>
        <linearGradient id="da-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="da-panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a8a" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
        <linearGradient id="da-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a1a30" />
          <stop offset="100%" stopColor="#4f111f" />
        </linearGradient>
      </defs>
      <ellipse cx="110" cy="186" rx="78" ry="8" fill="#0b1f44" opacity="0.14" />
      {/* solar panel */}
      <path d="M22 44 L96 26 L108 56 L34 74 Z" fill="url(#da-panel)" stroke="#e0ecff" strokeWidth="2" strokeLinejoin="round" />
      <path d="M40 40 L46 70 M58 36 L64 66 M76 32 L82 62 M27 56 L103 38" stroke="#bfdbfe" strokeWidth="1" opacity="0.6" />
      <rect x="62" y="62" width="6" height="40" rx="2" fill="#475569" />
      {/* wind sensor */}
      <rect x="150" y="58" width="5" height="44" rx="2" fill="#94a3b8" />
      <circle cx="152" cy="52" r="5" fill="#334155" />
      <path d="M152 52 C140 40 128 46 132 58 C142 56 148 54 152 52 Z" fill="#1e293b" />
      <path d="M152 52 C164 40 176 46 172 58 C162 56 156 54 152 52 Z" fill="#1e293b" />
      {/* the box */}
      <rect x="40" y="100" width="140" height="78" rx="14" fill="url(#da-glass)" stroke="#93c5fd" strokeWidth="2" />
      <rect x="56" y="118" width="108" height="34" rx="8" fill="url(#da-face)" />
      <text x="110" y="139" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fbf5e9" fontFamily="Inter Variable, system-ui, sans-serif">
        AeroMatrix
      </text>
      <circle cx="58" cy="166" r="3" fill="#22c55e" />
      <circle cx="68" cy="166" r="3" fill="#3b82f6" />
      <rect x="120" y="162" width="44" height="6" rx="3" fill="#2563eb" opacity="0.35" />
    </svg>
  );
}

function BuyButton({ p }: { p: Product }) {
  const [note, setNote] = useState(false);
  const price = p.price !== null ? formatRupees(p.price) : '';
  if (p.url) {
    return (
      <a href={p.url} target="_blank" rel="noreferrer noopener" className="gov-tap mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 px-5 text-[15px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.99]">
        <ShoppingBag size={18} /> Buy now {price && <span className="opacity-90">· {price}</span>} <ExternalLink size={14} className="opacity-80" />
      </a>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setNote(true)} className="gov-tap mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 px-5 text-[15px] font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 active:scale-[0.99]">
        <ShoppingBag size={18} /> Buy now {price && <span className="opacity-90">· {price}</span>}
      </button>
      {note && (
        <p role="status" className="glass-swap mt-3 rounded-2xl bg-ink-800 p-3 text-sm text-sand-200">
          The purchase link for this product has not been added yet. It will open here as soon as it is set.
        </p>
      )}
    </>
  );
}

export function ShopView() {
  const hero = PRODUCTS.find((p) => p.status === 'available')!;
  const soon = PRODUCTS.filter((p) => p.status === 'soon');
  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Shop" sub="Bring AeroMatrix into your own space." />
      <div className="gov-stagger space-y-6">
        <section className="glass-hero p-5 sm:p-7" aria-label={hero.name}>
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/12 px-3 py-1 text-xs font-semibold text-accent-500">
                <Sparkles size={13} /> Available now
              </span>
              <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-sand-50 sm:text-3xl">{hero.name}</h2>
              <p className="mt-1 text-sm text-sand-200">{hero.tagline}</p>
              <div className="mt-4 font-display text-4xl font-bold tabular-nums text-sand-50">{hero.price !== null ? formatRupees(hero.price) : ''}</div>
              <ul className="mt-4 space-y-2">
                {hero.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-sand-100">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500 text-white">
                      <Check size={12} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <DeviceArt className="glass-face mx-auto h-48 w-auto sm:h-56" />
          </div>
          <BuyButton p={hero} />
        </section>

        <section aria-label="Coming soon">
          <h2 className="gov-eyebrow mb-3">Coming soon</h2>
          <ul className="grid gap-3 sm:grid-cols-3">
            {soon.map((p) => (
              <li key={p.id} className="gov-card relative overflow-hidden p-4">
                <span className="absolute right-3 top-3 rounded-full bg-sand-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-sand-200">Coming Soon</span>
                <h3 className="mt-6 text-[15px] font-semibold text-sand-50">{p.name}</h3>
                <p className="mt-1 text-sm text-sand-300">{p.tagline}</p>
                <ul className="mt-3 space-y-1 text-xs text-sand-300">
                  {p.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
