import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info, type LucideIcon } from 'lucide-react';
import { colorOf, type AqiCategory, type ForecastDay, type Trend } from './lib/airdata';

/** The only five labels a number may carry in this app (plus an explicit "No data feed"). */
export type ChipKind = 'measured' | 'outdated' | 'estimated' | 'forecast' | 'simulation' | 'nofeed';

const CHIP: Record<ChipKind, { label: string; cls: string; hint: string }> = {
  measured: { label: 'Measured', cls: 'bg-teal-600/15 text-teal-700 ring-teal-600/40', hint: 'A station reading from the last few hours.' },
  outdated: { label: 'Outdated', cls: 'bg-amber-600/15 text-amber-700 ring-amber-600/45', hint: 'A real reading, but not current. Its date is shown.' },
  estimated: { label: 'Estimated', cls: 'bg-blue-600/15 text-blue-700 ring-blue-600/40', hint: 'Model estimate (Open-Meteo CAMS, about 40 km resolution), not a station reading.' },
  forecast: { label: 'Forecast', cls: 'bg-violet-600/15 text-violet-700 ring-violet-600/40', hint: 'A forecast from a model.' },
  simulation: { label: 'Simulation', cls: 'bg-pink-600/15 text-pink-700 ring-pink-600/40', hint: 'Hypothetical result from the uncalibrated prototype rule model.' },
  nofeed: { label: 'No data feed', cls: 'bg-slate-500/15 text-slate-600 ring-slate-500/40', hint: 'No data is connected for this value.' },
};

export function StatusChip({ kind, label, className = '' }: { kind: ChipKind; label?: string; className?: string }) {
  const c = CHIP[kind];
  return (
    <span title={c.hint} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${c.cls} ${className}`}>
      {label ?? c.label}
    </span>
  );
}

const DARK_TEXT: AqiCategory[] = ['Good', 'Satisfactory', 'Moderate'];

export function AqiChip({ aqi, category, className = '' }: { aqi?: number | null; category: AqiCategory | null | undefined; className?: string }) {
  const bg = colorOf(category);
  const dark = category ? DARK_TEXT.includes(category) : false;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${className}`}
      style={{ background: bg, color: dark ? '#1c0a10' : '#fff' }}
    >
      {aqi !== null && aqi !== undefined && <span className="tabular-nums">{Math.round(aqi)}</span>}
      <span>{category ?? 'Unknown'}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  chip,
  icon: Icon,
  onClick,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  chip?: ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  accent?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-sand-400">{label}</span>
        {Icon && <Icon size={16} className="shrink-0 text-sand-400" />}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-display text-3xl font-bold leading-tight text-sand-50" style={accent ? { color: accent } : undefined}>
          {value}
        </span>
        {chip}
      </div>
      {sub && <div className="mt-1 text-xs text-sand-300">{sub}</div>}
    </>
  );
  const cls = 'block w-full rounded-2xl bg-ink-900 p-4 text-left hairline';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-colors hover:bg-ink-800 focus-visible:outline-2`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className = '',
  id,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl bg-ink-900 p-4 hairline ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, reason, icon: Icon = Info, children }: { title: string; reason?: ReactNode; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-sand-500/40 px-4 py-8 text-center">
      <Icon size={22} className="text-sand-400" />
      <div className="text-sm font-bold text-sand-100">{title}</div>
      {reason && <p className="max-w-md text-xs leading-relaxed text-sand-300">{reason}</p>}
      {children}
    </div>
  );
}

/** A table that scrolls sideways inside its own card, so the page never scrolls sideways. */
export function Table({ head, rows, empty, caption }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string; caption?: string }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl hairline">
      <table className="w-full min-w-[480px] border-collapse text-left text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-ink-800 text-sand-300">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-3 py-4 text-center text-sand-400">
                {empty ?? 'Nothing to show.'}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-sand-500/15 align-top">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 text-sand-100">
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
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  title?: string;
  icon?: LucideIcon;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const cls = `gov-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    variant === 'primary'
      ? 'bg-accent-500 text-white hover:bg-accent-400'
      : variant === 'ghost'
        ? 'text-sand-200 hover:bg-ink-800'
        : 'bg-ink-800 text-sand-100 hairline hover:bg-ink-700'
  } ${className}`;
  const inner = (
    <>
      {Icon && <Icon size={16} />}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer noopener" title={title} className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={cls}>
      {inner}
    </button>
  );
}

export function TrendBadge({ trend, pct, known = true }: { trend: Trend; pct: number; known?: boolean }) {
  if (!known) return <span className="text-xs text-sand-400">trend unknown</span>;
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : ArrowRight;
  const color = trend === 'up' ? '#d9372f' : trend === 'down' ? '#2fae8b' : '#9a8a80';
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{ color }} title="PM2.5 now against six hours earlier (model data)">
      <Icon size={14} />
      {trend === 'flat' ? 'steady' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`}
    </span>
  );
}

/** 24 / 48 / 72 h outlook, one coloured tile per date. */
export function ForecastStrip({ days }: { days: ForecastDay[] }) {
  if (days.length === 0) return <p className="text-xs text-sand-400">No model outlook is available right now.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="Model outlook">
      {days.map((d) => (
        <li key={d.hours} className="rounded-xl p-2 text-center" style={{ background: `${colorOf(d.category)}22`, border: `1px solid ${colorOf(d.category)}` }}>
          <div className="text-[11px] font-bold text-sand-300">+{d.hours} h</div>
          <div className="text-[10px] text-sand-400">{d.date}</div>
          <div className="mt-1 font-display text-xl font-bold tabular-nums text-sand-50">{d.aqi}</div>
          <div className="text-[11px] font-semibold" style={{ color: colorOf(d.category) }}>
            {d.category}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold text-sand-50">{title}</h1>
        {sub && <p className="mt-0.5 text-xs text-sand-300">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-sand-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-sand-400">{hint}</span>}
    </label>
  );
}

export const inputCls = 'gov-tap min-h-11 w-full rounded-xl bg-ink-800 px-3 text-base text-sand-50 hairline placeholder:text-sand-500 md:text-sm';
