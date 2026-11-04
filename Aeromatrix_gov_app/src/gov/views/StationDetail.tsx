import { useMemo, useState } from 'react';
import { Check, ClipboardList, FileText, Hammer, Wrench } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { DEFAULT_LIMITS, OBJECTIVE_LABEL, planProject, type Objective, type Plan } from '../../plan/planEngine';
import { formatINR, type InterventionType } from '../../plan/costModel';
import { useGovStore } from '../govStore';
import { POLLUTANT_KEYS, POLLUTANT_NAME, POLLUTANT_UNIT, useAirData, type ZoneRow } from '../lib/airdata';
import { nearestZone } from '../lib/hotspots';
import { useWeeklyHistory } from '../lib/useHistory';
import { runMeasures, WEEKS, NO_MEASURES, type MeasureSelection } from '../lib/measures';
import { STATUS_LABEL, type StationRow, type StationStatus } from '../lib/stations';
import { formatAge, formatIst } from '../lib/format';
import { WeeklyChart } from '../charts';
import { AqiChip, Btn, StatusChip, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';

const chipOf = (s: StationStatus): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');

type ActionId = 'traffic' | 'dust' | 'industry' | 'trees' | 'monitor';

const ACTIONS: Array<{ id: ActionId; label: string; note: string }> = [
  { id: 'traffic', label: 'Traffic management', note: 'Fewer and cleaner vehicles near the station.' },
  { id: 'dust', label: 'Dust suppression', note: 'Water sprinkling and road cleaning.' },
  { id: 'industry', label: 'Industrial emission control', note: 'Filters on nearby industrial units.' },
  { id: 'trees', label: 'Plantation', note: 'About 500 trees around the area.' },
  { id: 'monitor', label: 'Monitoring and maintenance', note: 'Keeps this station reporting reliably.' },
];

const toSelection = (ids: ActionId[]): MeasureSelection => ({
  ...NO_MEASURES,
  traffic: ids.includes('traffic') ? 'standard' : 'off',
  dust: ids.includes('dust'),
  industry: ids.includes('industry') ? 1 : 0,
  trees: ids.includes('trees') ? 500 : 0,
});

const typeKey = (o: { type: InterventionType }) => o.type;
const planWeeks = (p: Plan): number =>
  Math.max(0, ...p.options.map((o) => (typeKey(o) === 'trees' ? WEEKS.trees : typeKey(o) === 'industry' ? WEEKS.industry : /intensive/i.test(o.label) ? WEEKS.traffic.intensive : WEEKS.traffic.standard)));
const priority = (pct: number): 'High' | 'Medium' | 'Low' => (pct <= -5 ? 'High' : pct <= -2 ? 'Medium' : 'Low');
const PRIORITY_CLS = { High: 'bg-red-500/15 text-red-600', Medium: 'bg-amber-500/15 text-amber-700', Low: 'bg-slate-500/15 text-slate-600' } as const;

function TakeAction({ zone, station }: { zone: ZoneRow; station: StationRow }) {
  const base = useTwinStore((s) => s.base);
  const setMeasures = useGovStore((s) => s.setMeasures);
  const resetMeasures = useGovStore((s) => s.resetMeasures);
  const openSimulator = useGovStore((s) => s.openSimulator);
  const [picked, setPicked] = useState<ActionId[]>([]);
  const cell = base?.cells.find((c) => c.id === zone.id);
  const sel = useMemo(() => toSelection(picked), [picked]);
  const out = useMemo(() => (base && cell ? runMeasures({ base, cell, zoneName: zone.place, currentPm25: zone.pm25, selection: sel }) : null), [base, cell, zone, sel]);
  const toggle = (id: ActionId) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div className="space-y-3 rounded-2xl bg-ink-800 p-4">
      <h3 className="gov-eyebrow">Choose actions for {station.name}</h3>
      <ul className="space-y-1.5">
        {ACTIONS.map((a) => {
          const on = picked.includes(a.id);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => toggle(a.id)} aria-pressed={on} className={`gov-tap flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${on ? 'bg-accent-500 text-white' : 'bg-ink-900 text-sand-100 hover:bg-ink-700'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-white bg-white/20' : 'border-sand-500/40'}`}>{on && <Check size={13} />}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{a.label}</span>
                  <span className={`block text-xs ${on ? 'text-white/80' : 'text-sand-300'}`}>{a.note}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {picked.length > 0 && (
        <div className="glass-swap rounded-xl bg-ink-900 p-3 text-sm">
          {out && out.modelledEffect ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-sand-400">Expected PM2.5 change</div>
                  <div className="font-display text-2xl font-bold text-emerald-600">{out.changePct.toFixed(1)}%</div>
                </div>
                <div className="text-right text-xs text-sand-300">
                  <div>One-time {formatINR(out.oneTime)}</div>
                  <div>Yearly {formatINR(out.recurring)}</div>
                </div>
              </div>
              <p className="mt-1 text-xs text-sand-400">Likely range down to {out.lowPct.toFixed(1)}%. About {out.weeks} weeks to put in place.</p>
              {picked.includes('dust') && <p className="mt-1 text-xs text-sand-400">Dust suppression is costed but its effect is not counted here.</p>}
            </>
          ) : (
            <p className="text-sm text-sand-200">{picked.every((p) => p === 'monitor' || p === 'dust') ? 'These actions support the work but do not change the modelled air quality.' : (out?.notes[0] ?? 'No modelled effect for this choice.')}</p>
          )}
          <div className="mt-3 flex gap-2">
            <Btn variant="secondary" className="flex-1" onClick={() => { setMeasures(sel); openSimulator(zone.id); }}>
              Open in What if
            </Btn>
            <Btn variant="ghost" onClick={() => { setPicked([]); resetMeasures(); }}>
              Clear
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

const BUDGETS = [500_000, 1_000_000, 2_500_000];

function PlanIt({ zone, station }: { zone: ZoneRow; station: StationRow }) {
  const base = useTwinStore((s) => s.base);
  const [budget, setBudget] = useState(1_000_000);
  const [objective, setObjective] = useState<Objective>('pm25');
  const [maxMeasures, setMaxMeasures] = useState(3);
  const [off, setOff] = useState<InterventionType[]>([]);
  const plan = useMemo(
    () => (base ? planProject({ base, budget, targetId: zone.id, objective, limits: { ...DEFAULT_LIMITS, maxInterventions: maxMeasures, unavailable: off } }) : null),
    [base, budget, zone.id, objective, maxMeasures, off],
  );
  const RESOURCES: Array<{ id: InterventionType; label: string }> = [
    { id: 'traffic', label: 'Traffic teams' },
    { id: 'industry', label: 'Industry inspection' },
    { id: 'trees', label: 'Planting crews' },
  ];
  return (
    <div className="space-y-4 rounded-2xl bg-ink-800 p-4">
      <h3 className="gov-eyebrow">Plan for {station.name} and its area</h3>
      <div>
        <div className="mb-1.5 text-xs font-medium text-sand-300">Budget</div>
        <div className="flex flex-wrap gap-2">
          {BUDGETS.map((b) => (
            <button key={b} type="button" onClick={() => setBudget(b)} className={`gov-tap min-h-9 rounded-full px-3.5 text-sm font-semibold ${budget === b ? 'bg-accent-500 text-white' : 'bg-ink-900 text-sand-100'}`}>
              {formatINR(b)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-sand-300">
          Goal
          <select value={objective} onChange={(e) => setObjective(e.target.value as Objective)} className="gov-tap mt-1 min-h-10 w-full rounded-xl bg-ink-900 px-2.5 text-sm text-sand-50">
            {(Object.keys(OBJECTIVE_LABEL) as Objective[]).map((o) => (
              <option key={o} value={o}>
                {OBJECTIVE_LABEL[o]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-sand-300">
          Most measures together
          <select value={maxMeasures} onChange={(e) => setMaxMeasures(Number(e.target.value))} className="gov-tap mt-1 min-h-10 w-full rounded-xl bg-ink-900 px-2.5 text-sm text-sand-50">
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium text-sand-300">Resources available</div>
        <div className="flex flex-wrap gap-2">
          {RESOURCES.map((r) => {
            const on = !off.includes(r.id);
            return (
              <button key={r.id} type="button" aria-pressed={on} onClick={() => setOff((v) => (on ? [...v, r.id] : v.filter((x) => x !== r.id)))} className={`gov-tap min-h-9 rounded-full px-3 text-sm font-medium ${on ? 'bg-emerald-500/15 text-emerald-700' : 'bg-ink-900 text-sand-400 line-through'}`}>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {plan && plan.status === 'OK' && plan.plans.length > 0 ? (
        <ol className="space-y-3">
          {plan.plans.map((p) => {
            const pr = priority(p.impact.pct);
            return (
              <li key={p.id} className="glass-swap rounded-2xl bg-ink-900 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-sand-50">Plan {p.id}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_CLS[pr]}`}>{pr} priority</span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-sand-100">
                  {p.options.map((o) => (
                    <li key={o.key} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                      <span>
                        {o.label}
                        <span className="block text-xs text-sand-400">
                          {o.quantity} {o.quantityUnit} · {formatINR(o.total)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-ink-800 py-2">
                    <dd className="text-sm font-bold text-emerald-600">{p.impact.pct.toFixed(1)}%</dd>
                    <dt className="text-sand-400">PM2.5</dt>
                  </div>
                  <div className="rounded-xl bg-ink-800 py-2">
                    <dd className="text-sm font-bold text-sand-50">{formatINR(p.total)}</dd>
                    <dt className="text-sand-400">Cost</dt>
                  </div>
                  <div className="rounded-xl bg-ink-800 py-2">
                    <dd className="text-sm font-bold text-sand-50">{planWeeks(p)} wk</dd>
                    <dt className="text-sand-400">Timeline</dt>
                  </div>
                </dl>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-sand-200">{plan?.messages[0] ?? 'No plan fits this budget. Try a larger budget or allow more resources.'}</p>
      )}
    </div>
  );
}

/** The station dashboard: readings, trend, health, causes and the two actions (Take Action, Plan It). */
export function StationDetail({ s, onClose }: { s: StationRow; onClose: () => void }) {
  const air = useAirData();
  const openReport = useGovStore((x) => x.openReport);
  const zone = useMemo(() => nearestZone(air.zones, [s.lon, s.lat]), [air.zones, s.lon, s.lat]);
  const hist = useWeeklyHistory(zone ? [{ id: s.id, location: [s.lon, s.lat] }] : [], true);
  const [panel, setPanel] = useState<'action' | 'plan' | null>(null);
  // no station reading: the surrounding area's model value stands in, and is marked as an estimate
  const aqi = s.aqi ?? (s.estimate ? { value: s.estimate.aqi, category: s.estimate.category } : zone ? { value: zone.aqi, category: zone.category } : null);
  const estimated = !s.aqi && !!aqi;
  const daily = hist.byId[s.id] ?? [];

  // measured readings, else the surrounding area's model values (shown as estimates)
  const readings: Array<{ label: string; text: string }> =
    s.readings.length > 0
      ? s.readings.map((r) => ({ label: r.label, text: `${r.value.toFixed(r.value < 10 ? 2 : 0)} ${r.unit}` }))
      : zone
        ? POLLUTANT_KEYS.filter((k) => zone.values[k] !== undefined).map((k) => ({ label: POLLUTANT_NAME[k], text: `${zone.values[k]!.toFixed(k === 'co' ? 2 : 0)} ${POLLUTANT_UNIT[k]}` }))
        : [];

  return (
    <Sheet
      full
      title={s.name}
      subtitle={[s.monitoring === 'manual' ? 'Manual station' : 'Continuous station', s.agency, s.city].filter(Boolean).join(' · ')}
      onClose={onClose}
      chips={<StatusChip kind={chipOf(s.status)} label={STATUS_LABEL[s.status]} />}
    >
      <div className="space-y-6">
        <section className="flex items-center justify-between gap-3">
          {aqi ? <AqiChip aqi={aqi.value} category={aqi.category} className="!px-4 !py-1.5 !text-sm" /> : <span className="text-sm text-sand-300">No reading yet</span>}
          <div className="text-right text-xs text-sand-300">
            {estimated ? <StatusChip kind="estimated" /> : null}
            <div className="mt-1">{s.lastReadingAt ? `Updated ${formatAge(s.ageMs)}` : 'No reading received'}</div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Btn variant={panel === 'action' ? 'primary' : 'secondary'} icon={Hammer} onClick={() => setPanel(panel === 'action' ? null : 'action')} ariaLabel="Take action">
            Take Action
          </Btn>
          <Btn variant={panel === 'plan' ? 'primary' : 'secondary'} icon={ClipboardList} onClick={() => setPanel(panel === 'plan' ? null : 'plan')} ariaLabel="Plan it">
            Plan It
          </Btn>
        </div>
        {panel === 'action' && zone && <TakeAction zone={zone} station={s} />}
        {panel === 'plan' && zone && <PlanIt zone={zone} station={s} />}
        {panel && !zone && <p className="text-sm text-sand-300">Area readings are needed to plan actions here.</p>}

        {readings.length > 0 && (
          <section>
            <h3 className="gov-eyebrow mb-2">Pollutants{s.readings.length === 0 ? ' (area estimate)' : ''}</h3>
            <ul className="grid grid-cols-2 gap-2">
              {readings.map((r) => (
                <li key={r.label} className="rounded-xl bg-ink-800 p-3">
                  <div className="text-xs text-sand-400">{r.label}</div>
                  <div className="mt-0.5 text-base font-semibold tabular-nums text-sand-50">{r.text}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="gov-eyebrow mb-2">Recent AQI</h3>
          {daily.length > 0 ? <WeeklyChart daily={daily} /> : <p className="text-sm text-sand-300">{hist.status === 'loading' ? 'Loading the last week…' : 'The weekly trend is not available right now.'}</p>}
        </section>

        <section>
          <h3 className="gov-eyebrow mb-2">Station health</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-sand-400">Connection</dt>
              <dd className="text-sand-50">{s.hasFeed ? 'Connected' : 'No data feed'}</dd>
            </div>
            <div>
              <dt className="text-xs text-sand-400">Last reading</dt>
              <dd className="text-sand-50">{s.lastReadingAt ? formatIst(s.lastReadingAt) : 'None'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-sand-400">Location</dt>
              <dd className="text-sand-50">
                {s.lat.toFixed(4)}°N, {s.lon.toFixed(4)}°E{zone ? ` · near ${zone.place}` : ''}
              </dd>
            </div>
          </dl>
          {s.status !== 'live' && <p className="mt-2 text-sm text-amber-700">This station needs attention: its reading is not current.</p>}
        </section>

        {zone && zone.causes.length > 0 && (
          <section>
            <h3 className="gov-eyebrow mb-2">Main contributors</h3>
            <ul className="space-y-2">
              {zone.causes.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 rounded-xl bg-ink-800 px-3 py-2.5 text-sm">
                  <span className="font-medium text-sand-50">{c.label}</span>
                  <span className="rounded-full bg-ink-700 px-2.5 py-0.5 text-xs font-semibold text-sand-100">{c.strength}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-sm text-sand-200">
              <Wrench size={15} className="mt-0.5 shrink-0 text-accent-500" />
              Suggested first step: {zone.causes[0].key === 'traffic' ? 'traffic management' : zone.causes[0].key === 'industry' ? 'industrial emission control' : 'dust suppression'}.
            </p>
          </section>
        )}

        {zone && (
          <Btn icon={FileText} onClick={() => openReport(zone.id)} className="w-full">
            Create report for {zone.place}
          </Btn>
        )}
      </div>
    </Sheet>
  );
}
