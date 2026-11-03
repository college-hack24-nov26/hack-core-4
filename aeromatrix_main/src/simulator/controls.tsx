import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

/** First validation error whose text starts with `prefix` (validateParams messages begin with the control label). */
export function errorFor(errors: string[], prefix: string): string | null {
  return errors.find((e) => e.startsWith(prefix)) ?? null;
}

export function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs font-medium text-red-600">
      {message}
    </p>
  );
}

export function GroupCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-ink-900 p-3.5 shadow-sm hairline">
      <h3 className="flex items-center gap-2 text-sm font-bold text-sand-50">
        <span className="h-4 w-1 rounded-full bg-accent-500" aria-hidden />
        {title}
      </h3>
      {hint && <p className="mb-2 mt-0.5 text-[11px] leading-snug text-sand-400">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  baseline,
  unit = '',
  format,
  hint,
  error,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** value that counts as "no change"; shows the reset affordance when different */
  baseline: number;
  unit?: string;
  format?: (v: number) => string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
}) {
  const finite = Number.isFinite(value);
  const changed = !finite || Math.abs(value - baseline) > 1e-9;
  return (
    <div className={`py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold text-sand-100" htmlFor={`ps-${label}`}>
          {label}
        </label>
        <div className="flex items-center gap-1">
          {format && finite && <span className="font-mono text-xs text-sand-300">{format(value)}</span>}
          <input
            id={`ps-${label}`}
            type="number"
            inputMode="decimal"
            value={finite ? value : ''}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
            className={`h-8 w-[64px] rounded-lg bg-ink-950 px-1.5 text-right font-mono text-xs text-sand-50 hairline ${
              error ? 'ring-1 ring-red-500' : ''
            }`}
          />
          {unit && <span className="w-9 text-[11px] text-sand-400">{unit}</span>}
          <button
            type="button"
            onClick={() => onChange(baseline)}
            disabled={!changed || disabled}
            aria-label={`Reset ${label} to baseline`}
            title="Reset to baseline"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-700 disabled:invisible"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
      <input
        type="range"
        aria-label={`${label} (slider)`}
        min={min}
        max={max}
        step={step}
        value={finite ? Math.min(max, Math.max(min, value)) : baseline}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 h-6 w-full cursor-pointer accent-accent-500"
      />
      {hint && <p className="text-[11px] leading-snug text-sand-400">{hint}</p>}
      <FieldError message={error ?? null} />
    </div>
  );
}

/** Small compass: drag or use arrow keys to set the direction the wind blows FROM. */
export function Compass({ value, onChange }: { value: number; onChange: (deg: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const safe = Number.isFinite(value) ? value : 0;

  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onChange(Math.round(((deg % 360) + 360) % 360));
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.shiftKey ? 15 : 5;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((safe + step + 360) % 360);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange((safe - step + 360) % 360);
    else return;
    e.preventDefault();
  };

  // The arrow points where the wind blows TOWARDS (from + 180 degrees).
  const towards = ((safe + 180) * Math.PI) / 180;
  const ax = 50 + Math.sin(towards) * 30;
  const ay = 50 - Math.cos(towards) * 30;
  const fx = 50 + Math.sin((safe * Math.PI) / 180) * 36;
  const fy = 50 - Math.cos((safe * Math.PI) / 180) * 36;

  return (
    <svg
      ref={ref}
      viewBox="0 0 100 100"
      role="slider"
      tabIndex={0}
      aria-label="Wind direction (blowing from)"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(safe)}
      aria-valuetext={`from ${Math.round(safe)} degrees`}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        setFromPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) setFromPointer(e);
      }}
      className="h-24 w-24 shrink-0 cursor-pointer touch-none select-none rounded-full bg-ink-950 hairline"
    >
      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" className="text-sand-600" strokeWidth="1" />
      {['N', 'E', 'S', 'W'].map((l, i) => {
        const a = (i * Math.PI) / 2;
        return (
          <text
            key={l}
            x={50 + Math.sin(a) * 38}
            y={50 - Math.cos(a) * 38 + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            className="fill-sand-300"
          >
            {l}
          </text>
        );
      })}
      <line x1={fx} y1={fy} x2={ax} y2={ay} stroke="#a3263f" strokeWidth="3" strokeLinecap="round" />
      <circle cx={fx} cy={fy} r="3.5" fill="#d9adb1" />
      <polygon
        points={`${ax},${ay} ${ax - Math.sin(towards - 0.45) * 9},${ay + Math.cos(towards - 0.45) * 9} ${ax - Math.sin(towards + 0.45) * 9},${ay + Math.cos(towards + 0.45) * 9}`}
        fill="#a3263f"
      />
    </svg>
  );
}
