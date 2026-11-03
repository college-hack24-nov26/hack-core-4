import { useMemo, useState } from 'react';
import { CheckCircle2, FileText, SlidersHorizontal } from 'lucide-react';
import { useGovStore, type AlertStatus } from '../govStore';
import { SEVERITY_LABEL, SEVERITY_ORDER, useAlerts, ALERT_THRESHOLD, type AlertSeverity, type GovAlert } from '../lib/alerts';
import { composeAlertInstruction, NOT_SENT_NOTE } from '../lib/instructions';
import { formatIst } from '../lib/format';
import { STATUS_LABEL } from '../lib/stations';
import { AqiChip, Btn, EmptyState, Field, PageTitle, StatusChip, inputCls } from '../ui';
import { Sheet } from '../Sheet';
import { InstructionComposer } from './InstructionComposer';
import type { ChipKind } from '../ui';

const SEV_COLOR: Record<AlertSeverity, string> = { critical: '#d9372f', high: '#f08c1a', watch: '#e0b100', info: '#9a8a80' };
const STATUS_TEXT: Record<AlertStatus, string> = { new: 'New', acknowledged: 'Acknowledged', assigned: 'Assigned', resolved: 'Resolved' };
const STATUS_FILTERS: Array<{ id: 'open' | AlertStatus; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'new', label: 'New' },
  { id: 'acknowledged', label: 'Acknowledged' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'resolved', label: 'Resolved' },
];

function SeverityDot({ s }: { s: AlertSeverity }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEV_COLOR[s] }} aria-hidden />;
}

const stationChip = (s: keyof typeof STATUS_LABEL): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');

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

  return (
    <Sheet
      title={a.title}
      subtitle={`${a.location}${a.forDate ? ` · for ${a.forDate}` : ''}`}
      onClose={onClose}
      chips={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-0.5 text-xs font-bold text-sand-100 hairline">
            <SeverityDot s={a.severity} />
            {SEVERITY_LABEL[a.severity]}
          </span>
          <span className="rounded-full bg-ink-800 px-2.5 py-0.5 text-xs font-bold text-sand-100 hairline">{STATUS_TEXT[r.status]}</span>
          {a.kind === 'forecast' ? <StatusChip kind="forecast" /> : a.kind === 'current' ? <StatusChip kind="estimated" /> : <StatusChip kind="outdated" label="Station feeds" />}
        </>
      }
    >
      <div className="space-y-5">
        {a.kind !== 'data' && (
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Current and expected</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-ink-800 p-3 hairline">
                <div className="text-[11px] text-sand-400">Now (model estimate)</div>
                <div className="mt-1">{a.zone && <AqiChip aqi={a.current} category={a.zone.category} />}</div>
              </div>
              <div className="rounded-xl bg-ink-800 p-3 hairline">
                <div className="text-[11px] text-sand-400">{a.kind === 'forecast' ? `Expected on ${a.forDate}` : 'Threshold'}</div>
                <div className="mt-1 text-sm font-bold text-sand-50">
                  {a.kind === 'forecast' && a.expected !== null ? `AQI about ${Math.round(a.expected)}` : `${ALERT_THRESHOLD} (AQI ${a.threshold}) or worse`}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-sand-300">
              Threshold: {ALERT_THRESHOLD}, CPCB AQI {a.threshold} or worse. The AQI is an estimate from CAMS model data (about 40 km resolution), not an official station AQI.
            </p>
            <p className="mt-1 text-xs text-sand-300">Confidence: {a.confidence}.</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Why</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-sand-100">
            {a.reasons.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Suggested action and who to inform</h3>
          <p className="text-sm text-sand-100">{a.action}</p>
          <p className="mt-2 text-xs text-sand-300">
            Suggested: {a.departments.map((d) => d.name).join('; ')}. Suggested deadline {a.deadline}. These are suggestions; you choose the recipient and approve the text.
          </p>
        </section>

        {a.stations.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Nearest monitoring stations</h3>
            <ul className="space-y-1.5 text-xs">
              {a.stations.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-ink-800 px-3 py-2 hairline">
                  <span className="min-w-0 truncate text-sand-100">{s.name}</span>
                  <StatusChip kind={stationChip(s.status)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.instruction && (
          <section className="rounded-xl bg-ink-800 p-3 hairline">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Recorded instruction</h3>
            <p className="text-xs text-sand-300">
              To {r.instruction.to}, deadline {r.instruction.deadline}, approved {formatIst(r.instruction.sentAt)}. Not sent by the app.
            </p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-sand-100">{r.instruction.message}</pre>
          </section>
        )}
        {r.status === 'resolved' && (
          <p className="text-xs text-sand-300">
            Resolved {formatIst(r.resolvedAt)}
            {r.note ? `: ${r.note}` : ''}
          </p>
        )}

        {/* workflow */}
        <section className="space-y-3 border-t border-sand-500/20 pt-4">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Workflow: New, Acknowledge, Assign, Resolve</h3>
          {r.status === 'new' && (
            <Btn variant="primary" className="w-full" icon={CheckCircle2} onClick={() => acknowledge(a.id)}>
              Acknowledge
            </Btn>
          )}
          {r.status === 'acknowledged' && !composing && (
            <Btn variant="primary" className="w-full" onClick={() => setComposing(true)}>
              Assign: prepare the instruction
            </Btn>
          )}
          {r.status === 'acknowledged' && composing && (
            <InstructionComposer
              departments={a.departments}
              deadline={a.deadline}
              message={composeAlertInstruction(a, a.deadline)}
              subject={a.title}
              approveLabel="Approve, record and mark Assigned"
              onApprove={(x) => {
                assign(a.id, { to: x.to, deadline: x.deadline, message: x.message });
                setComposing(false);
              }}
            />
          )}
          {r.status === 'assigned' && !resolving && (
            <Btn variant="primary" className="w-full" onClick={() => setResolving(true)}>
              Resolve
            </Btn>
          )}
          {r.status === 'assigned' && resolving && (
            <div className="space-y-2">
              <Field label="Resolution note (what was done, what the readings show)">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={`${inputCls} py-2`} />
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
                Mark resolved
              </Btn>
            </div>
          )}
          {r.status !== 'acknowledged' && <p className="text-[11px] text-sand-400">{NOT_SENT_NOTE}</p>}
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
    <div className="mx-auto max-w-4xl p-4 pb-32">
      <PageTitle title="Alerts" sub="An alert appears only when real data crosses a threshold: Poor or worse now or in the model outlook, or stale station feeds." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filters">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={status === f.id}
              onClick={() => setStatus(f.id)}
              className={`gov-tap min-h-11 rounded-full px-3.5 text-xs font-bold hairline ${status === f.id ? 'bg-accent-500 text-white' : 'bg-ink-800 text-sand-200 hover:bg-ink-700'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity | 'all')} aria-label="Severity" className={`${inputCls} !w-auto`}>
          <option value="all">All severities</option>
          {(['critical', 'high', 'watch', 'info'] as AlertSeverity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={alerts.length === 0 ? 'No alerts' : 'No alerts match these filters'}
          reason={alerts.length === 0 ? 'Nothing is crossing a threshold in the data right now. This screen fills only when real data reaches Poor or worse, or station feeds go stale.' : 'Change the status or severity filter.'}
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  select(a.id);
                  if (a.zoneId) selectZone(a.zoneId);
                }}
                aria-pressed={selectedId === a.id}
                className={`gov-tap w-full rounded-2xl p-4 text-left hairline transition-colors hover:bg-ink-800 ${selectedId === a.id ? 'bg-ink-800' : 'bg-ink-900'}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1.5">
                    <SeverityDot s={a.severity} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-sand-50">{a.title}</div>
                    <div className="mt-0.5 text-xs text-sand-300">
                      {a.location} · deadline {a.deadline}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-bold text-sand-100 hairline">{SEVERITY_LABEL[a.severity]}</span>
                      <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-bold text-sand-100 hairline">{STATUS_TEXT[a.record.status]}</span>
                      {a.zone && a.kind === 'current' && <AqiChip aqi={a.current} category={a.zone.category} />}
                      {a.kind === 'forecast' && a.expected !== null && <StatusChip kind="forecast" label={`Forecast AQI ${Math.round(a.expected)}`} />}
                    </div>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <AlertDetail key={selected.id} a={selected} onClose={() => select(null)} />}
    </div>
  );
}
