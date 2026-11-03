import type { ReactNode } from 'react';
import type { DataStatus } from '../types';

export const STATUS_STYLE: Record<DataStatus, { label: string; cls: string; hint: string }> = {
  OBSERVED: {
    label: 'OBSERVED',
    cls: 'bg-teal-500/15 text-teal-600 ring-teal-500/40',
    hint: 'Measured by a real sensor or station.',
  },
  MODEL_DATA: {
    label: 'MODEL DATA',
    cls: 'bg-blue-500/15 text-blue-600 ring-blue-500/40',
    hint: 'Reanalysis or model-provided data (not a direct measurement).',
  },
  MODEL_PREDICTION: {
    label: 'PREDICTION',
    cls: 'bg-violet-500/15 text-violet-600 ring-violet-500/40',
    hint: 'Output of a trained, validated prediction model.',
  },
  MODELED_SCENARIO: {
    label: 'MODELED SCENARIO',
    cls: 'bg-amber-500/15 text-amber-700 ring-amber-500/45',
    hint: 'What-if estimate from the prototype model, not a forecast.',
  },
  DEMO: {
    label: 'DEMO',
    cls: 'bg-slate-500/15 text-slate-600 ring-slate-500/40',
    hint: 'Deterministic, seeded demo value. Not a measurement.',
  },
};

export function StatusBadge({ status, className = '' }: { status: DataStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      title={s.hint}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ring-1 ring-inset ${s.cls} ${className}`}
    >
      {s.label}
    </span>
  );
}

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-xl bg-ink-800 p-0.5 hairline ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`min-h-11 min-w-9 rounded-[10px] px-2.5 text-xs font-semibold transition-colors md:min-h-8 ${
              active ? 'bg-accent-500 text-sand-50 shadow-sm' : 'text-sand-300 hover:bg-ink-700 hover:text-sand-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`py-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  className = '',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium text-sand-400">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold leading-tight text-sand-50">{value}</span>
        {unit && <span className="text-xs text-sand-400">{unit}</span>}
      </div>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v: number) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-sand-300">{label}</span>
        <span className="font-mono text-sand-100">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-accent-500"
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm text-sand-200"
    >
      <span>{label}</span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent-500' : 'bg-ink-600'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-sand-50 transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export function Chip({
  children,
  active = false,
  onClick,
  className = '',
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = `inline-flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold hairline ${
    active ? 'bg-accent-500 text-sand-50' : 'bg-ink-800 text-sand-200'
  } ${className}`;
  if (!onClick) return <span className={base}>{children}</span>;
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${base} hover:bg-ink-700`}>
      {children}
    </button>
  );
}
