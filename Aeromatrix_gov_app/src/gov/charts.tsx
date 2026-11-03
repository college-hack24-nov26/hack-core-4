import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorOf, type AqiCategory, type ForecastDay } from './lib/airdata';
import type { DailyPoint } from './lib/history';
import { isLite } from './lib/perf';

const axis = { fill: 'currentColor', fontSize: 12, opacity: 0.7 } as const;

function Tip({ active, payload, unit }: { active?: boolean; payload?: Array<{ payload: { name: string; value: number; sub?: string } }>; unit?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-sand-500/20 bg-ink-950 px-3 py-2 text-xs text-sand-100 shadow-lg">
      <div className="font-semibold">{p.name}</div>
      <div>
        {Number.isInteger(p.value) ? p.value : p.value.toFixed(1)}
        {unit ? ` ${unit}` : ''}
        {p.sub ? ` · ${p.sub}` : ''}
      </div>
    </div>
  );
}

/** The next 24, 48 and 72 hours as coloured bars. */
export function ForecastChart({ days, height = 170 }: { days: ForecastDay[]; height?: number }) {
  const data = days.map((d) => ({ name: `+${d.hours} h`, value: d.aqi, sub: d.category, color: colorOf(d.category), date: d.date }));
  return (
    <div style={{ height }} className="text-sand-100">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axis} />
          <YAxis hide domain={[0, (max: number) => Math.max(100, Math.ceil(max * 1.15))]} />
          <Tooltip cursor={{ fill: 'currentColor', opacity: 0.06 }} content={<Tip unit="AQI" />} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={64} isAnimationActive={!isLite()} animationDuration={700}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
            <LabelList dataKey="value" position="top" style={{ fill: 'currentColor', fontSize: 13, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily PM2.5 for the last week, coloured by that day's AQI category. */
export function WeeklyChart({ daily, height = 150 }: { daily: DailyPoint[]; height?: number }) {
  const data = daily.map((d) => ({
    name: d.date.slice(8) + '/' + d.date.slice(5, 7),
    value: d.pm25 ?? 0,
    sub: d.category ?? 'No data',
    color: d.pm25 === null ? '#9a8a80' : colorOf(d.category as AqiCategory | null),
    has: d.pm25 !== null,
  }));
  return (
    <div style={{ height }} className="text-sand-100">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={axis} interval={0} />
          <YAxis hide />
          <Tooltip cursor={{ fill: 'currentColor', opacity: 0.06 }} content={<Tip unit="µg/m³ PM2.5" />} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={!isLite()} animationDuration={600}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} fillOpacity={d.has ? 1 : 0.25} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface CompareRow {
  name: string;
  value: number;
  color: string;
}

/** Existing against simulated values side by side. The scale starts below the lowest value so differences are visible, and says so. */
export function CompareChart({ rows, unit, height = 180 }: { rows: CompareRow[]; unit: string; height?: number }) {
  const lo = Math.min(...rows.map((r) => r.value));
  const hi = Math.max(...rows.map((r) => r.value));
  const base = hi > 0 && lo / hi > 0.5 ? Math.max(0, Math.floor(lo - (hi - lo) * 1.2)) : 0;
  return (
    <div className="text-sand-100">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }}>
            <XAxis type="number" hide domain={[base, Math.ceil(hi * 1.05)]} allowDataOverflow />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} tick={axis} />
            <Tooltip cursor={{ fill: 'currentColor', opacity: 0.06 }} content={<Tip unit={unit} />} />
            <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={22} isAnimationActive={!isLite()} animationDuration={900}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.color} />
              ))}
              <LabelList dataKey="value" position="right" formatter={(v: unknown) => (typeof v === 'number' ? v.toFixed(1) : String(v ?? ''))} style={{ fill: 'currentColor', fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {base > 0 && <p className="mt-1 text-[11px] text-sand-400">Bars start at {base} {unit} so the differences are easy to see.</p>}
    </div>
  );
}
