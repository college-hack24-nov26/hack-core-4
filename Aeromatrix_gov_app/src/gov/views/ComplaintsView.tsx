import { useCallback, useEffect, useState } from 'react';
import { FileText, Inbox, Paperclip, RefreshCw } from 'lucide-react';
import { STATUSES, STATUS_LABEL, fileUrl, formatBytes, loadComplaints, setComplaintStatus, type Complaint, type ComplaintList, type ComplaintStatus } from '../lib/complaintsApi';
import { Btn, Card, EmptyState, PageTitle, Pills, Skeleton } from '../ui';
import { Sheet } from '../Sheet';

const TONE: Record<ComplaintStatus, string> = {
  new: 'bg-accent-500/12 text-accent-500',
  reviewing: 'bg-amber-500/15 text-amber-700',
  action_taken: 'bg-violet-500/15 text-violet-700',
  resolved: 'bg-emerald-500/15 text-emerald-700',
  closed: 'bg-slate-500/15 text-slate-600',
};

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

function Detail({ c, onClose, onChanged }: { c: Complaint; onClose: () => void; onChanged: () => void }) {
  const [note, setNote] = useState(c.note ?? '');
  const [busy, setBusy] = useState<ComplaintStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const change = async (status: ComplaintStatus) => {
    setBusy(status);
    setError(null);
    const r = await setComplaintStatus(c.reference, status, note);
    setBusy(null);
    if (r.ok) onChanged();
    else setError(r.reason);
  };
  return (
    <Sheet full title={c.station_name} subtitle={`${c.reference} · ${when(c.created_at)}`} onClose={onClose} chips={<span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>}>
      <div className="space-y-6">
        <section>
          <h3 className="gov-eyebrow mb-2">What the user reported</h3>
          <p className="whitespace-pre-wrap rounded-2xl bg-ink-800 p-4 text-[15px] leading-relaxed text-sand-100">{c.text}</p>
        </section>
        {c.files.length > 0 && (
          <section>
            <h3 className="gov-eyebrow mb-2">Files</h3>
            <ul className="space-y-2">
              {c.files.map((f) => (
                <li key={f.id}>
                  <a href={fileUrl(c.reference, f.id)} target="_blank" rel="noreferrer noopener" className="gov-tap flex items-center gap-3 rounded-2xl bg-ink-800 p-3 hover:bg-ink-700">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/12 text-accent-500">
                      <FileText size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-sand-50">{f.name}</span>
                      <span className="block text-xs text-sand-300">{formatBytes(f.size)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="gov-eyebrow mb-2">Take action</h3>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="A note for the record (optional)" className="gov-tap w-full resize-none rounded-2xl border border-sand-500/25 bg-ink-850 p-3 text-base text-sand-50 placeholder:text-sand-500 md:text-sm" />
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <Btn key={s} variant={c.status === s ? 'primary' : 'secondary'} disabled={busy !== null} onClick={() => void change(s)} className="!min-h-10 text-sm">
                {busy === s ? 'Saving…' : STATUS_LABEL[s]}
              </Btn>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-3 rounded-2xl bg-red-500/10 p-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <p className="mt-3 text-xs text-sand-400">The person who filed it can see the status you set.</p>
        </section>
      </div>
    </Sheet>
  );
}

/** Complaints filed by users in the AeroMatrix user app, for the authorities to review and act on. */
export function ComplaintsView() {
  const [filter, setFilter] = useState<'all' | ComplaintStatus>('all');
  const [list, setList] = useState<ComplaintList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await loadComplaints(filter === 'all' ? undefined : filter);
    setLoading(false);
    if (r.ok) {
      setList(r.data);
      setError(null);
    } else setError(r.reason);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = list?.counts ?? {};
  const total = Object.values(counts).reduce((a, n) => a + (n ?? 0), 0);
  const selected = list?.complaints.find((c) => c.reference === open) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Complaints" sub="Raised by users about monitoring stations." right={<Btn variant="ghost" icon={RefreshCw} ariaLabel="Refresh complaints" onClick={() => void load()} className="!px-3" />} />
      <div className="mb-5">
        <Pills
          label="Complaint status"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All', count: total }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] ?? 0 }))]}
        />
      </div>
      {error ? (
        <Card>
          <EmptyState title="Complaints are not available" reason={error} />
        </Card>
      ) : loading && !list ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !list || list.complaints.length === 0 ? (
        <Card>
          <EmptyState icon={Inbox} title="No complaints here" reason={filter === 'all' ? 'Nothing has been filed yet.' : `No complaint is ${STATUS_LABEL[filter].toLowerCase()}.`} />
        </Card>
      ) : (
        <ul className="gov-stagger space-y-3">
          {list.complaints.map((c) => (
            <li key={c.reference}>
              <button type="button" onClick={() => setOpen(c.reference)} className="gov-card gov-tap w-full p-4 text-left transition-colors hover:bg-ink-800 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-sand-50">{c.station_name}</div>
                    <div className="text-xs text-sand-300">
                      {c.reference} · {when(c.created_at)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-sand-200">{c.text}</p>
                {c.files.length > 0 && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-sand-400">
                    <Paperclip size={12} /> {c.files.length} file{c.files.length === 1 ? '' : 's'}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <Detail
          key={selected.reference}
          c={selected}
          onClose={() => setOpen(null)}
          onChanged={() => {
            void load();
          }}
        />
      )}
    </div>
  );
}
