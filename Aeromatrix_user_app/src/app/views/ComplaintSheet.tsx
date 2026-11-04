import { useRef, useState } from 'react';
import { CheckCircle2, FileText, Image as ImageIcon, Paperclip, Send, TriangleAlert, X } from 'lucide-react';
import { useUserStore } from '../userStore';
import { ACCEPT, MAX_FILES, MAX_TEXT, formatBytes, sendComplaint, validateComplaint } from '../lib/complaints';
import { serviceConfigured } from '../lib/service';
import { Btn } from '../ui';
import { Sheet } from '../Sheet';

export interface ComplaintTarget {
  id: string;
  name: string;
}

type Phase = { kind: 'form' } | { kind: 'sent'; reference: string } | { kind: 'queued'; reason: string };

/** The form for a complaint about one station: a description, optional files, and Submit. */
export function ComplaintSheet({ target, onClose }: { target: ComplaintTarget; onClose: () => void }) {
  const addComplaint = useUserStore((s) => s.addComplaint);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const input = useRef<HTMLInputElement>(null);

  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    setFiles(next.slice(0, MAX_FILES));
    setError(next.length > MAX_FILES ? `You can attach up to ${MAX_FILES} files. The first ${MAX_FILES} were kept.` : null);
    if (input.current) input.current.value = '';
  };

  const submit = async () => {
    const problem = validateComplaint(text, files);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await sendComplaint({ stationId: target.id, stationName: target.name, text, files });
    setBusy(false);
    const base = { id: `c-${Date.now().toString(36)}`, stationId: target.id, stationName: target.name, text: text.trim(), files: files.map((f) => f.name), createdAt: Date.now() };
    if (res.ok) {
      addComplaint({ ...base, state: 'sent', reference: res.reference, remoteStatus: 'new' });
      setPhase({ kind: 'sent', reference: res.reference });
    } else {
      addComplaint({ ...base, state: 'queued' });
      setPhase({ kind: 'queued', reason: res.reason });
    }
  };

  return (
    <Sheet full title="Register a complaint" subtitle={target.name} onClose={onClose}>
      {phase.kind === 'sent' ? (
        <div className="glass-swap flex flex-col items-center px-2 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
            <CheckCircle2 size={34} />
          </span>
          <h3 className="mt-4 text-xl font-semibold text-sand-50">Complaint sent</h3>
          <p className="mt-2 max-w-sm text-sm text-sand-200">It has been forwarded to the authorities, who will review it and take action.</p>
          <p className="mt-4 rounded-2xl bg-ink-800 px-4 py-2 font-mono text-sm font-semibold text-sand-50">{phase.reference}</p>
          <p className="mt-2 text-xs text-sand-300">Keep this reference to follow up.</p>
          <Btn variant="primary" className="mt-6 w-full max-w-xs" onClick={onClose}>
            Done
          </Btn>
        </div>
      ) : phase.kind === 'queued' ? (
        <div className="glass-swap flex flex-col items-center px-2 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600">
            <TriangleAlert size={32} />
          </span>
          <h3 className="mt-4 text-xl font-semibold text-sand-50">Saved, not sent yet</h3>
          <p className="mt-2 max-w-sm text-sm text-sand-200">{phase.reason}</p>
          <p className="mt-2 max-w-sm text-sm text-sand-300">{serviceConfigured ? 'Your text is saved on this phone. Try again in a moment.' : 'Your text is saved on this phone and can be sent once the service is connected.'}</p>
          <div className="mt-6 flex w-full max-w-xs gap-2">
            <Btn variant="primary" className="flex-1" onClick={() => setPhase({ kind: 'form' })}>
              Try again
            </Btn>
            <Btn variant="secondary" onClick={onClose}>
              Close
            </Btn>
          </div>
        </div>
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="text-sm font-semibold text-sand-50">What is the issue?</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={MAX_TEXT + 200}
              placeholder="For example: the station display has been blank for a week, or it sits next to a burning waste heap."
              className="gov-tap mt-2 w-full resize-none rounded-2xl border border-sand-500/25 bg-ink-850 p-3.5 text-base text-sand-50 placeholder:text-sand-500 focus:border-accent-400 md:text-sm"
            />
            <span className={`mt-1 block text-right text-xs ${text.length > MAX_TEXT ? 'text-red-600' : 'text-sand-400'}`}>
              {text.trim().length} / {MAX_TEXT}
            </span>
          </label>

          <div>
            <span className="text-sm font-semibold text-sand-50">Attach files (optional)</span>
            <p className="mt-0.5 text-xs text-sand-300">Photos, PDFs and documents. Up to {MAX_FILES} files, {formatBytes(10 * 1024 * 1024)} each.</p>
            <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" id="complaint-files" onChange={(e) => pick(e.target.files)} />
            <label htmlFor="complaint-files" className="gov-tap mt-2 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-500/40 bg-ink-850 px-4 text-sm font-semibold text-accent-500 transition-colors hover:bg-ink-800">
              <Paperclip size={17} /> Choose photos or documents
            </label>
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-2xl bg-ink-850 p-2.5 ring-1 ring-white/40">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/12 text-accent-500">{f.type.startsWith('image/') ? <ImageIcon size={18} /> : <FileText size={18} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-sand-50">{f.name}</span>
                      <span className="block text-xs text-sand-300">{formatBytes(f.size)}</span>
                    </span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== i))} className="gov-tap flex h-10 w-10 items-center justify-center rounded-xl text-sand-300 hover:bg-ink-700">
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-2xl bg-red-500/10 p-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <Btn type="submit" variant="primary" icon={Send} disabled={busy} className="w-full">
            {busy ? 'Sending…' : 'Submit'}
          </Btn>
          <p className="text-center text-xs text-sand-400">Your complaint goes to the authorities responsible for this station.</p>
        </form>
      )}
    </Sheet>
  );
}
