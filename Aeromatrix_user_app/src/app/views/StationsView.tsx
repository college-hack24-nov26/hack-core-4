import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, MapPinOff, MessageSquareWarning, RadioTower, RefreshCw, Search, X } from 'lucide-react';
import { useUserStore, type ComplaintRecord } from '../userStore';
import { countStations, useStations, type StationStatus } from '../lib/stations';
import { fetchComplaintStatus, STATUS_LABEL as COMPLAINT_STATUS } from '../lib/complaints';
import { formatAge } from '../lib/format';
import { AqiChip, Btn, Card, EmptyState, PageTitle, Pills, StatusChip, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';
import { StationDetail } from './StationDetail';
import { ComplaintSheet } from './ComplaintSheet';

const chipOf = (s: StationStatus): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');
const STATE_LABEL: Record<StationStatus, string> = { live: 'Working', outdated: 'Outdated', estimate: 'Estimated', no_feed: 'Unavailable' };

function MyComplaints() {
  const complaints = useUserStore((s) => s.complaints);
  const update = useUserStore((s) => s.updateComplaint);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    await Promise.all(
      complaints
        .filter((c) => c.state === 'sent' && c.reference)
        .map(async (c) => {
          const st = await fetchComplaintStatus(c.reference!);
          if (st && st !== c.remoteStatus) update(c.id, { remoteStatus: st });
        }),
    );
    setBusy(false);
  };

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (complaints.length === 0) return null;
  const label = (c: ComplaintRecord) => (c.state === 'queued' ? 'Saved, not sent' : (COMPLAINT_STATUS[c.remoteStatus ?? 'new'] ?? c.remoteStatus ?? 'Received'));
  return (
    <section className="mt-8" aria-label="Your complaints">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="gov-tap flex w-full items-center justify-between gap-3 rounded-2xl bg-ink-850 px-4 py-3 text-left ring-1 ring-white/40">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-sand-50">
          <MessageSquareWarning size={17} className="text-accent-500" /> Your complaints
        </span>
        <span className="flex items-center gap-2 text-sm text-sand-300">
          {complaints.length}
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="glass-swap mt-3 space-y-2">
          <div className="flex justify-end">
            <Btn variant="ghost" icon={RefreshCw} onClick={() => void refresh()} disabled={busy} className="!min-h-9 text-sm">
              {busy ? 'Checking…' : 'Check status'}
            </Btn>
          </div>
          <ul className="space-y-2">
            {complaints.map((c) => (
              <li key={c.id} className="gov-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-sand-50">{c.stationName}</div>
                    <div className="text-xs text-sand-300">{new Date(c.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.state === 'queued' ? 'bg-amber-500/15 text-amber-700' : 'bg-accent-500/12 text-accent-500'}`}>{label(c)}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-sand-200">{c.text}</p>
                {c.files.length > 0 && <p className="mt-1 text-xs text-sand-400">{c.files.length} file{c.files.length === 1 ? '' : 's'} attached</p>}
                {c.reference && <p className="mt-1 font-mono text-xs text-sand-300">{c.reference}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function StationsView() {
  const st = useStations();
  const selectedId = useUserStore((s) => s.selectedStationId);
  const select = useUserStore((s) => s.selectStation);
  const [filter, setFilter] = useState<'all' | 'working' | 'estimated' | 'outdated'>('all');
  const [query, setQuery] = useState('');
  const [unplaced, setUnplaced] = useState<{ name: string; type: string; city: string | null } | null>(null);
  const [unplacedComplaint, setUnplacedComplaint] = useState(false);
  const c = countStations(st);
  const selected = st.placed.find((s) => s.id === selectedId) ?? null;
  const q = query.trim().toLowerCase();
  const matches = (...parts: Array<string | null | undefined>) => !q || parts.some((p) => p?.toLowerCase().includes(q));

  const shown = useMemo(
    () =>
      st.placed
        .filter((s) => (filter === 'all' ? true : filter === 'working' ? s.status === 'live' : filter === 'outdated' ? s.status === 'outdated' : s.status === 'estimate' || s.status === 'no_feed'))
        .filter((s) => matches(s.name, s.agency, s.city, s.monitoring === 'manual' ? 'manual namp' : 'continuous caaqms'))
        .sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.placed, filter, q],
  );
  const shownUnplaced = filter === 'all' ? st.notPlaced.filter((n) => matches(n.name, n.city, n.monitoring === 'manual' ? 'manual namp' : 'continuous caaqms')) : [];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Stations" sub="Every air-quality monitoring station we know of." />

      {st.placed.length === 0 && st.notPlaced.length === 0 ? (
        <Card>
          <EmptyState icon={RadioTower} title="No stations to show" reason="The station list is not available yet." />
        </Card>
      ) : (
        <>
          <div className="relative mb-4">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-accent-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stations"
              aria-label="Search stations"
              autoComplete="off"
              className="gov-tap h-12 w-full rounded-2xl border-2 border-accent-500/30 bg-white pl-11 pr-11 text-[15px] font-medium text-slate-900 shadow-lg placeholder:font-normal placeholder:text-slate-500 focus:border-accent-500"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="gov-tap absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="mb-5">
            <Pills
              label="Station status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: c.total + c.notPlaced },
                { value: 'working', label: 'Working', count: c.live },
                { value: 'estimated', label: 'Estimated', count: c.estimate + c.noFeed },
                { value: 'outdated', label: 'Outdated', count: c.outdated },
              ]}
            />
          </div>

          {shown.length === 0 && shownUnplaced.length === 0 ? (
            <Card>
              <EmptyState title="No stations here" reason={q ? `Nothing matches "${query}".` : 'No station matches this filter.'} />
            </Card>
          ) : (
            <ul className="gov-stagger space-y-3">
              {shown.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => select(s.id)} className="gov-card gov-tap flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink-800 sm:p-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-sand-50">{s.name}</span>
                      <span className="mt-0.5 block truncate text-sm text-sand-300">
                        {s.monitoring === 'manual' ? 'Manual' : 'Continuous'}
                        {s.city ? ` · ${s.city}` : ''} · {s.lastReadingAt ? `Updated ${formatAge(s.ageMs)}` : 'No reading'}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      {s.aqi ? <AqiChip aqi={s.aqi.value} category={s.aqi.category} /> : s.estimate ? <AqiChip aqi={s.estimate.aqi} category={s.estimate.category} /> : null}
                      <StatusChip kind={s.aqi ? chipOf(s.status) : s.estimate ? 'estimated' : 'nofeed'} label={s.aqi ? STATE_LABEL[s.status] : s.estimate ? 'Estimated' : 'Unavailable'} />
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-sand-500" />
                  </button>
                </li>
              ))}
              {shownUnplaced.map((n) => (
                <li key={n.name}>
                  <button type="button" onClick={() => setUnplaced({ name: n.name, type: n.monitoring === 'manual' ? 'Manual (NAMP)' : 'Continuous (CAAQMS)', city: n.city ?? null })} className="gov-card gov-tap flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-ink-800 sm:p-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-sand-50">{n.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-sm text-sand-300">
                        <MapPinOff size={14} /> Location not available{n.city ? ` · ${n.city}` : ''}
                      </span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-sand-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <MyComplaints />
        </>
      )}

      {selected && <StationDetail key={selected.id} s={selected} onClose={() => select(null)} />}
      {unplaced && (
        <>
          <Sheet full title={unplaced.name} subtitle={[unplaced.type, unplaced.city].filter(Boolean).join(' · ')} onClose={() => setUnplaced(null)}>
            <div className="space-y-5">
              <p className="rounded-2xl bg-ink-850 p-4 text-sm text-sand-200 ring-1 ring-white/40">This station is on the official list, but its exact position and live readings are not available to us yet.</p>
              <Btn variant="primary" icon={MessageSquareWarning} className="w-full" onClick={() => setUnplacedComplaint(true)}>
                Register Complaint
              </Btn>
            </div>
          </Sheet>
          {unplacedComplaint && <ComplaintSheet target={{ id: `unplaced:${unplaced.name}`, name: unplaced.name }} onClose={() => setUnplacedComplaint(false)} />}
        </>
      )}
    </div>
  );
}
