import { Children, Fragment, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

interface Opt {
  value: string;
  label: string;
  disabled: boolean;
}

/** Reads <option> children (also inside fragments, arrays and <optgroup>) into a plain list. */
function readOptions(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (el.type === 'option') {
      const text = Children.toArray(el.props.children).join('');
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : text, label: text, disabled: !!el.props.disabled });
    } else if (el.type === Fragment || el.type === 'optgroup') {
      readOptions(el.props.children, out);
    }
  });
  return out;
}

export interface SelectProps {
  value: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  title?: string;
  'aria-label'?: string;
}

/**
 * A drop-in for the native select element that opens a menu in the app's own style (rounded, tinted, with the chosen item highlighted)
 * instead of the system's plain white list. It takes the same <option> children and calls onChange with { target: { value } }.
 */
export function Select({ value, onChange, children, className = '', disabled, id, title, 'aria-label': ariaLabel }: SelectProps) {
  const opts = readOptions(children);
  const current = opts.find((o) => o.value === String(value));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 200 && above > below;
    const maxH = Math.max(140, Math.min(320, up ? above : below));
    const width = Math.max(r.width, 176);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + 6, maxH } : { left, width, top: r.bottom + 6, maxH });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const idx = opts.findIndex((o) => o.value === String(value));
    setActive(Math.max(0, idx));
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || list.current?.contains(t)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    // Scrolling the menu itself must not close it; scrolling the page behind it does.
    const onScroll = (e: Event) => {
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', down);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', down);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    setOpen(false);
    btn.current?.focus();
    if (o.value !== String(value)) onChange?.({ target: { value: o.value } });
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(opts.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (opts[active]) pick(opts[active]);
    }
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKey}
        className={`flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className="min-w-0 flex-1 truncate">{current?.label ?? ''}</span>
        <ChevronDown size={15} className={`shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            role="listbox"
            style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
            className="animate-rise panel-scroll z-[100] overflow-y-auto overscroll-contain rounded-2xl border border-sand-400/20 bg-ink-950 p-1.5 shadow-2xl backdrop-blur-xl"
          >
            {opts.map((o, i) => {
              const on = o.value === String(value);
              return (
                <li key={o.value + i} role="option" aria-selected={on} aria-disabled={o.disabled} data-active={i === active}>
                  <button
                    type="button"
                    tabIndex={-1}
                    disabled={o.disabled}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm transition-colors disabled:opacity-40 ${
                      on ? 'bg-accent-500 font-semibold text-white' : i === active ? 'bg-ink-800 text-sand-50' : 'text-sand-100'
                    }`}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {on && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
