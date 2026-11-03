import type { Block, ChartSpec, ReportContent } from './reportContent';
import { Table } from '../ui';

function Pie({ spec }: { spec: Extract<ChartSpec, { kind: 'pie' }> }) {
  const r = 52;
  let a0 = -Math.PI / 2;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width="130" height="130" viewBox="-60 -60 120 120" role="img" aria-label={spec.title}>
        {spec.slices.map((s) => {
          const a1 = a0 + (s.percent / 100) * 2 * Math.PI;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const d = s.percent >= 99.9 ? '' : `M 0 0 L ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)} Z`;
          a0 = a1;
          return s.percent >= 99.9 ? <circle key={s.label} r={r} fill={s.color} /> : <path key={s.label} d={d} fill={s.color} stroke="#fff" strokeWidth="1" />;
        })}
      </svg>
      <ul className="space-y-1 text-sm text-sand-100">
        {spec.slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: s.color }} />
            {s.label} <span className="tabular-nums text-sand-300">{s.percent.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ spec }: { spec: Extract<ChartSpec, { kind: 'bars' }> }) {
  const max = Math.max(...spec.bars.map((b) => b.value), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-2">
        {spec.bars.map((b) => (
          <div key={b.label} className="flex min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-xs font-semibold tabular-nums text-sand-100">{spec.unit === '₹' ? `₹${Math.round(b.value).toLocaleString('en-IN')}` : b.value.toFixed(spec.decimals)}</span>
            <div className="w-full max-w-10 rounded-t-md" style={{ height: `${Math.max(2, (b.value / max) * 100)}%`, background: b.color }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {spec.bars.map((b) => (
          <span key={b.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-sand-300">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Chart({ spec }: { spec: ChartSpec }) {
  return (
    <figure className="min-w-0 rounded-xl border border-sand-500/20 p-4">
      <figcaption className="mb-3 text-sm font-semibold text-sand-50">{spec.title}</figcaption>
      {spec.kind === 'none' ? (
        <p className="rounded-lg border border-dashed border-sand-500/30 p-4 text-sm text-sand-300">{spec.message}</p>
      ) : (
        <>
          {spec.kind === 'pie' ? <Pie spec={spec} /> : <Bars spec={spec} />}
          <p className="mt-3 text-xs text-sand-400">{spec.kind === 'bars' ? `Unit: ${spec.unit}. ` : ''}{spec.caption}</p>
        </>
      )}
    </figure>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p':
      return <p className="text-[15px] leading-relaxed text-sand-100">{b.text}</p>;
    case 'h':
      return <h4 className="pt-2 text-[15px] font-semibold text-sand-50">{b.text}</h4>;
    case 'list':
      return (
        <ul className="space-y-1.5 text-[15px] text-sand-100">
          {b.items.map((i, k) => (
            <li key={k} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
              <span>{i}</span>
            </li>
          ))}
        </ul>
      );
    case 'note':
      return <p className="rounded-xl bg-ink-800 p-3.5 text-sm text-sand-300">{b.text}</p>;
    case 'table':
      return <Table head={b.head.every((h) => h === '') ? b.body[0].map(() => '') : b.head} rows={b.foot ? [...b.body, b.foot.map((x, i) => <b key={i}>{x}</b>)] : b.body} />;
    case 'charts':
      return (
        <div className={`grid gap-3 ${b.specs.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {b.specs.map((s) => (
            <Chart key={s.title} spec={s} />
          ))}
        </div>
      );
  }
}

/** The report as it will read in the PDF, for a quick look before downloading. */
export function ReportPreview({ content }: { content: ReportContent }) {
  return (
    <article aria-label="Report preview" className="space-y-8">
      <header>
        <h2 className="text-xl font-semibold text-sand-50">{content.title}</h2>
        <p className="mt-1 text-sm text-sand-300">
          {content.subtitle} · {content.generatedText}
        </p>
      </header>
      {[...content.sections, { id: '', title: content.appendix.title, blocks: content.appendix.blocks }].map((s) => (
        <section key={s.id + s.title} className="space-y-3">
          <h3 className="border-l-4 border-accent-500 pl-3 text-lg font-semibold text-sand-50">
            {s.id ? `${s.id}. ` : ''}
            {s.title}
          </h3>
          {s.blocks.map((b, i) => (
            <BlockView key={i} b={b} />
          ))}
        </section>
      ))}
    </article>
  );
}
