import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info, type LucideIcon } from 'lucide-react';
import { CATEGORY_FLOOR, colorOf, type AqiCategory, type ForecastDay, type Trend } from './lib/airdata';

/** The five labels a number may carry, plus an explicit "Unavailable". */
export type ChipKind = 'measured' | 'outdated' | 'estimated' | 'forecast' | 'simulation' | 'nofeed';

const CHIP: Record<ChipKind, { label: string; cls: string; hint: string }> = {
  measured: { label: 'Measured', cls: 'bg-teal-600/12 text-teal-700 ring-teal-600/30', hint: 'A station reading from the last few hours.' },
  outdated: { label: 'Outdated', cls: 'bg-amber-600/12 text-amber-700 ring-amber-600/35', hint: 'A real reading, but not current. Its date is shown.' },
  estimated: { label: 'Estimated', cls: 'bg-blue-600/12 text-blue-700 ring-blue-600/30', hint: 'Estimated from model data, not a station reading.' },
  forecast: { label: 'Forecast', cls: 'bg-violet-600/12 text-violet-700 ring-violet-600/30', hint: 'A forecast, not a measurement.' },
  simulation: { label: 'Simulation', cls: 'bg-pink-600/12 text-pink-700 ring-pink-600/30', hint: 'A modelled what-if result, not a guarantee.' },
  nofeed: { label: 'Unavailable', cls: 'bg-slate-500/12 text-slate-600 ring-slate-500/30', hint: 'No data is available for this value.' },
};

export function StatusChip({ kind, label, className = '' }: { kind: ChipKind; label?: string; className?: string }) {
  const c = CHIP[kind];
  return (
    <span title={c.hint} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${c.cls} ${className}`}>
      {label ?? c.label}
    </span>
  );
}

const DARK_TEXT: AqiCategory[] = ['Good', 'Satisfactory', 'Moderate'];

export function AqiChip({ aqi, category, className = '' }: { aqi?: number | null; category: AqiCategory | null | undefined; className?: string }) {
  const bg = colorOf(category);
  const dark = category ? DARK_TEXT.includes(category) : false;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${className}`} style={{ background: bg, color: dark ? '#1c0a10' : '#fff' }}>
      {aqi !== null && aqi !== undefined && <span className="tabular-nums">{Math.round(aqi)}</span>}
      <span>{category ?? 'Unknown'}</span>
    </span>
  );
}

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`gov-card p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function SectionCard({ title, action, children, className = '', id }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <Card id={id} className={className}>
      {(title || action) && (
        <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
          {title && <h2 className="gov-eyebrow">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

export function EmptyState({ title, reason, icon: Icon = Info, children }: { title: string; reason?: ReactNode; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-800 text-sand-400">
        <Icon size={20} />
      </span>
      <div className="text-[15px] font-semibold text-sand-100">{title}</div>
      {reason && <p className="max-w-sm text-sm leading-relaxed text-sand-300">{reason}</p>}
      {children}
    </div>
  );
}

/** A loading placeholder with the same footprint as the content it stands for. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`gov-skeleton ${className}`} />;
}

/** A table that scrolls sideways inside its own card, so the page never scrolls sideways. */
export function Table({ head, rows, empty, caption }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string; caption?: string }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-sand-500/15">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-ink-800 text-sand-300">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-2.5 text-xs font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-4 py-5 text-center text-sand-400">
                {empty ?? 'Nothing to show.'}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-sand-500/12 align-top">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-3 text-sand-100">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  href,
  variant = 'secondary',
  disabled,
  title,
  icon: Icon,
  type = 'button',
  className = '',
  ariaLabel,
}: {
  children?: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  title?: string;
  icon?: LucideIcon;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}) {
  const cls = `gov-tap inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
    variant === 'primary' ? 'bg-accent-500 text-white shadow-sm hover:bg-accent-400' : variant === 'ghost' ? 'text-sand-200 hover:bg-ink-800' : 'bg-ink-800 text-sand-100 hover:bg-ink-700'
  } ${className}`;
  const inner = (
    <>
      {Icon && <Icon size={17} />}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener" title={title} aria-label={ariaLabel} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel} className={cls}>
      {inner}
    </button>
  );
}

/** A row of filter pills. */
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string; count?: number }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`gov-tap inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${on ? 'bg-accent-500 text-white' : 'bg-ink-800 text-sand-200 hover:bg-ink-700'}`}
          >
            {o.label}
            {o.count !== undefined && <span className={`text-xs tabular-nums ${on ? 'text-white/80' : 'text-sand-400'}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TrendBadge({ trend, pct, known = true }: { trend: Trend; pct: number; known?: boolean }) {
  if (!known) return null;
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ArrowRight;
  const color = trend === 'up' ? '#d9372f' : trend === 'down' ? '#2fae8b' : '#9a8a80';
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color }} title="Change in PM2.5 over the last six hours">
      <Icon size={15} />
      {trend === 'flat' ? 'Steady' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`}
    </span>
  );
}

/** The city gauge: a half ring scaled 0 to 500, coloured by category. It sweeps in once when it appears. */
export function Gauge({ value, category, size = 220 }: { value: number; category: AqiCategory; size?: number }) {
  const R = 80;
  const LEN = Math.PI * R;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(Math.min(500, Math.max(0, value))));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const offset = LEN * (1 - shown / 500);
  const color = colorOf(category);
  return (
    <svg width={size} height={(size * 120) / 200} viewBox="0 0 200 120" role="img" aria-label={`Air quality index ${Math.round(value)}, ${category}`}>
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="14" strokeLinecap="round" />
      <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={LEN} strokeDashoffset={offset} className="gov-gauge-arc" />
      <text x="100" y="88" textAnchor="middle" fontSize="48" fontWeight="700" fill="currentColor" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value)}
      </text>
    </svg>
  );
}

/** Where a value sits on the CPCB bands, as a compact scale under the gauge. */
export function CategoryScale({ category }: { category: AqiCategory }) {
  const names = Object.keys(CATEGORY_FLOOR) as AqiCategory[];
  return (
    <div className="flex h-1.5 w-full max-w-[220px] overflow-hidden rounded-full" aria-hidden>
      {names.map((n) => (
        <span key={n} className="h-full flex-1" style={{ background: colorOf(n), opacity: n === category ? 1 : 0.3 }} />
      ))}
    </div>
  );
}

export function ForecastStrip({ days }: { days: ForecastDay[] }) {
  if (days.length === 0) return <p className="text-sm text-sand-400">Forecast unavailable.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="Forecast">
      {days.map((d) => (
        <li key={d.hours} className="rounded-xl p-3 text-center" style={{ background: `${colorOf(d.category)}1f` }}>
          <div className="text-xs font-medium text-sand-300">+{d.hours} h</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-sand-50">{d.aqi}</div>
          <div className="text-xs font-medium" style={{ color: colorOf(d.category) }}>
            {d.category}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-sand-50 sm:text-[28px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-sand-300">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-sand-200">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-sand-400">{hint}</span>}
    </label>
  );
}

export const inputCls = 'gov-tap min-h-11 w-full rounded-xl border border-sand-500/20 bg-ink-800 px-3.5 text-base text-sand-50 placeholder:text-sand-500 focus:border-accent-400 md:text-sm';

/** A labelled figure: small label above, large value below. */
export function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-sand-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-sand-50">{value}</div>
      {sub && <div className="text-xs text-sand-300">{sub}</div>}
    </div>
  );
}

/** Kept for the screens that still use it. */
export function KpiCard({ label, value, sub, chip, onClick }: { label: string; value: ReactNode; sub?: ReactNode; chip?: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <div className="gov-eyebrow">{label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-3xl font-semibold text-sand-50">{value}</span>
        {chip}
      </div>
      {sub && <div className="mt-1 text-sm text-sand-300">{sub}</div>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="gov-card block w-full p-5 text-left">
      {body}
    </button>
  ) : (
    <div className="gov-card p-5">{body}</div>
  );
}
