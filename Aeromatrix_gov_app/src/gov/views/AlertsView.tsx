import { useMemo, useState } from 'react';
import { Check, ChevronRight, FileText, SlidersHorizontal } from 'lucide-react';
import { useGovStore, type AlertStatus } from '../govStore';
import { SEVERITY_LABEL, SEVERITY_ORDER, useAlerts, ALERT_THRESHOLD, type AlertSeverity, type GovAlert } from '../lib/alerts';
import { composeAlertInstruction, NOT_SENT_NOTE } from '../lib/instructions';
import { formatIst, istDate } from '../lib/format';
import { STATUS_LABEL } from '../lib/stations';
import { AqiChip, Btn, EmptyState, Field, PageTitle, Pills, StatusChip, inputCls, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';
import { InstructionComposer } from './InstructionComposer';

const SEV_COLOR: Record<AlertSeverity, string> = { critical: '#d9372f', high: '#f08c1a', watch: '#e0b100', info: '#9a8a80' };
const STATUS_TEXT: Record<AlertStatus, string> = { new: 'New', acknowledged: 'Acknowledged', assigned: 'Assigned', resolved: 'Resolved' };
const STEPS: AlertStatus[] = ['new', 'acknowledged', 'assigned', 'resolved'];

const stationChip = (s: keyof typeof STATUS_LABEL): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');

/** New, Acknowledged, Assigned, Resolved with the time each step happened. */
function Stepper({ a }: { a: GovAlert }) {
  const r = a.record;
  const at: Record<AlertStatus, number | undefined> = { new: r.firstSeen, acknowledged: r.acknowledgedAt, assigned: r.instruction?.sentAt, resolved: r.resolvedAt };
  const current = STEPS.indexOf(r.status);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Progress">
      {STEPS.map((s, i) => {
        const done = i <= current;
        return (
          <li key={s} className="min-w-0">
            <div className="flex items-center">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? 'bg-accent-500 text-white' : 'bg-ink-800 text-sand-400'}`}>{done && i < current ? <Check size={13} /> : i + 1}</span>
              {i < STEPS.length - 1 && <span className={`mx-1 h-0.5 flex-1 rounded ${i < current ? 'bg-accent-500' : 'bg-ink-700'}`} />}
            </div>
            <div className={`mt-1.5 text-xs font-medium ${done ? 'text-sand-100' : 'text-sand-400'}`}>{STATUS_TEXT[s]}</div>
            <div className="text-[11px] text-sand-400">{done && at[s] ? formatIst(at[s]).replace(/^\d+ \w+ \d+, /, '') : ''}</div>
          </li>
        );
      })}
    </ol>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-sand-400">{label}</dt>
      <dd className="mt-0.5 text-[15px] text-sand-50">{children}</dd>
    </div>
  );
}

function AlertDetail({ a, onClose }: { a: GovAlert; onClose: () => void }) {
  const acknowledge = useGovStore((s) => s.acknowledge);
  const assign = useGovStore((s) => s.assign);
  const resolve = useGovStore((s) => s.resolve);
  const openReport = useGovStore((s) => s.openReport);
  const openSimulator = useGovStore((s) => s.openSimulator);
  const [composing, setComposing] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const r = a.record;
  const overdue = r.status === 'assigned' && r.instruction && r.instruction.deadline < istDate(Date.now());

  return (
    <Sheet
      title={a.title}
      subtitle={a.location}
      onClose={onClose}
      chips={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-0.5 text-xs font-semibold text-sand-100">
            <span className="h-2 w-2 rounded-full" style={{ background: SEV_COLOR[a.severity] }} />
            {SEVERITY_LABEL[a.severity]}
          </span>
          {overdue && <span className="rounded-full bg-[#d9372f]/12 px-2.5 py-0.5 text-xs font-semibold text-[#d9372f]">Overdue</span>}
        </>
      }
    >
      <div className="space-y-7">
        <Stepper a={a} />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
          <Fact label="Condition">{a.condition}</Fact>
          <Fact label="Detected">{formatIst(r.firstSeen)}</Fact>
          {a.kind !== 'data' && (
            <>
              <Fact label="Current reading">
                <span className="block">{a.currentDetail}</span>
                <StatusChip kind="estimated" className="mt-1" />
              </Fact>
              <Fact label={a.kind === 'forecast' ? `Expected on ${a.forDate}` : 'Threshold'}>
                {a.kind === 'forecast' && a.expectedDetail ? (
                  <>
                    <span className="block">{a.expectedDetail}</span>
                    <StatusChip kind="forecast" className="mt-1" />
                  </>
                ) : (
                  `${ALERT_THRESHOLD} (AQI ${a.threshold}+)`
                )}
              </Fact>
              {a.kind === 'forecast' && <Fact label="Threshold">{`${ALERT_THRESHOLD} (AQI ${a.threshold}+)`}</Fact>}
            </>
          )}
          {a.kind === 'data' && <Fact label="Reading">{a.currentDetail}</Fact>}
          <Fact label="Confidence">{a.confidence}</Fact>
          <Fact label="Suggested deadline">{a.deadline}</Fact>
        </dl>

        <section>
          <h3 className="gov-eyebrow mb-2">Why this alert</h3>
          <ul className="space-y-1.5 text-[15px] text-sand-100">
            {a.reasons.slice(0, 3).map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sand-500" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="gov-eyebrow mb-2">Recommended action</h3>
          <p className="text-[15px] text-sand-50">{a.action}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {a.departments.map((d) => (
              <span key={d.key} className="rounded-full bg-ink-800 px-3 py-1 text-xs font-medium text-sand-100">
                {d.name}
              </span>
            ))}
          </div>
        </section>

        {a.stations.length > 0 && (
          <section>
            <h3 className="gov-eyebrow mb-2">Nearest stations</h3>
            <ul className="space-y-1.5">
              {a.stations.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-sand-100">{s.name}</span>
                  <StatusChip kind={stationChip(s.status)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.instruction && (
          <section className="rounded-xl bg-ink-800 p-4">
            <h3 className="gov-eyebrow mb-1">Instruction</h3>
            <p className="text-sm text-sand-300">
              To {r.instruction.to} · deadline {r.instruction.deadline}
            </p>
            <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap font-sans text-sm text-sand-100">{r.instruction.message}</pre>
          </section>
        )}
        {r.status === 'resolved' && r.note && <p className="text-sm text-sand-300">Note: {r.note}</p>}

        <section className="space-y-3 border-t border-sand-500/15 pt-5">
          {r.status === 'new' && (
            <Btn variant="primary" className="w-full" onClick={() => acknowledge(a.id)}>
              Acknowledge
            </Btn>
          )}
          {r.status === 'acknowledged' && !composing && (
            <Btn variant="primary" className="w-full" onClick={() => setComposing(true)}>
              Prepare instruction
            </Btn>
          )}
          {r.status === 'acknowledged' && composing && (
            <InstructionComposer
              departments={a.departments}
              deadline={a.deadline}
              message={composeAlertInstruction(a, a.deadline)}
              subject={a.title}
              approveLabel="Approve instruction"
              onApprove={(x) => {
                assign(a.id, { to: x.to, deadline: x.deadline, message: x.message });
                setComposing(false);
              }}
            />
          )}
          {r.status === 'assigned' && !resolving && (
            <Btn variant="primary" className="w-full" onClick={() => setResolving(true)}>
              Mark resolved
            </Btn>
          )}
          {r.status === 'assigned' && resolving && (
            <div className="space-y-3">
              <Field label="What was done?">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} py-2.5`} />
              </Field>
              <Btn
                variant="primary"
                className="w-full"
                onClick={() => {
                  resolve(a.id, note);
                  setResolving(false);
                  setNote('');
                }}
              >
                Confirm resolved
              </Btn>
            </div>
          )}
          {(r.status === 'new' || r.status === 'assigned') && <p className="text-xs text-sand-400">{NOT_SENT_NOTE}</p>}
        </section>

        {a.zoneId && (
          <div className="flex flex-wrap gap-2">
            <Btn icon={SlidersHorizontal} onClick={() => openSimulator(a.zoneId)}>
              Test an action
            </Btn>
            <Btn icon={FileText} onClick={() => openReport(a.zoneId)}>
              Create report
            </Btn>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function AlertsView() {
  const { alerts } = useAlerts();
  const selectedId = useGovStore((s) => s.selectedAlertId);
  const select = useGovStore((s) => s.selectAlert);
  const selectZone = useGovStore((s) => s.selectZone);
  const [status, setStatus] = useState<'open' | AlertStatus>('open');
  const [severity, setSeverity] = useState<AlertSeverity | 'all'>('all');

  const count = (s: AlertStatus) => alerts.filter((a) => a.record.status === s).length;
  const shown = useMemo(
    () =>
      alerts
        .filter((a) => (status === 'open' ? a.record.status !== 'resolved' : a.record.status === status))
        .filter((a) => severity === 'all' || a.severity === severity)
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title)),
    [alerts, status, severity],
  );
  const selected = alerts.find((a) => a.id === selectedId) ?? null;

  return (
    <div className={`mx-auto max-w-3xl px-4 pb-40 pt-6 transition-[margin] duration-300 sm:px-6 ${!!selected ? 'lg:ml-8 lg:mr-[460px] lg:max-w-none' : ''}`}>
      <PageTitle title="Alerts" />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Pills
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'open', label: 'Open', count: alerts.filter((a) => a.record.status !== 'resolved').length },
            { value: 'new', label: 'New', count: count('new') },
            { value: 'acknowledged', label: 'Acknowledged', count: count('acknowledged') },
            { value: 'assigned', label: 'Assigned', count: count('assigned') },
            { value: 'resolved', label: 'Resolved', count: count('resolved') },
          ]}
        />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity | 'all')} aria-label="Severity" className={`${inputCls} sm:!w-auto`}>
          <option value="all">All severities</option>
          {(['critical', 'high', 'watch', 'info'] as AlertSeverity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <div className="gov-card">
          <EmptyState title={alerts.length === 0 ? 'No alerts' : 'Nothing matches'} reason={alerts.length === 0 ? 'Nothing needs attention right now.' : 'Try a different filter.'} />
        </div>
      ) : (
        <ul className="gov-stagger space-y-3">
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  select(a.id);
                  if (a.zoneId) selectZone(a.zoneId);
                }}
                aria-pressed={selectedId === a.id}
                className={`gov-card gov-tap flex w-full items-center gap-4 border-l-4 p-4 text-left transition-colors hover:bg-ink-800 sm:p-5 ${selectedId === a.id ? '!bg-ink-800' : ''}`}
                style={{ borderLeftColor: SEV_COLOR[a.severity] }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-sand-50">{a.title}</span>
                  <span className="mt-0.5 block text-sm text-sand-300">
                    {a.location} · {formatIst(a.record.firstSeen).replace(/^\d+ \w+ \d+, /, 'Detected ')}
                  </span>
                  <span className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs font-medium text-sand-100">{SEVERITY_LABEL[a.severity]}</span>
                    <span className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs font-medium text-sand-200">{STATUS_TEXT[a.record.status]}</span>
                    {a.zone && a.kind === 'current' && <AqiChip aqi={a.current} category={a.zone.category} />}
                    {a.kind === 'forecast' && a.expected !== null && <StatusChip kind="forecast" label={`Expected AQI ${Math.round(a.expected)}`} />}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-sand-500" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <AlertDetail key={selected.id} a={selected} onClose={() => select(null)} />}
    </div>
  );
}
