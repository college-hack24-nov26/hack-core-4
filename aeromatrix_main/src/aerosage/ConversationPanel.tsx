import { useEffect, useRef } from 'react';
import { Check, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { RichText } from './RichText';
import { AeroSageAvatar } from './AeroSageAvatar';
import { describeAction, type Action } from './aeromatrixActions';
import type { ChatMessage } from './types';

interface Props {
  messages: ChatMessage[];
  onConfirm: (id: string, actions: Action[]) => void;
  onDismiss: (id: string) => void;
  onRetry: () => void;
}

const STATUS_NOTE: Record<string, string> = {
  unavailable: 'Unavailable',
  offline: 'Service offline',
};

function Bubble({ m, onConfirm, onDismiss, onRetry }: { m: ChatMessage } & Omit<Props, 'messages'>) {
  const mine = m.role === 'user';
  return (
    <li className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
      {!mine && (
        <span className="mt-1 shrink-0">
          <AeroSageAvatar size={24} pulse={m.streaming && !m.text} />
        </span>
      )}
      <div className={`max-w-[85%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            mine ? 'bg-accent-500 text-sand-50' : 'bg-ink-800 text-sand-100 hairline'
          }`}
        >
          {m.text ? <RichText text={m.text} /> : m.streaming ? <span className="text-sand-400">Thinking…</span> : null}
        </div>

        {!mine && m.status && m.status !== 'ok' && (
          <span className="flex items-center gap-1 text-[11px] text-sand-400">
            <TriangleAlert size={12} /> {STATUS_NOTE[m.status]}
          </span>
        )}

        {!mine && m.sources && m.sources.length > 0 && (
          <span className="text-[11px] text-sand-500">Source: {m.sources.join(', ')}</span>
        )}

        {!mine && m.outcomes && m.outcomes.length > 0 && (
          <ul className="space-y-0.5 text-[11px]" aria-label="What I did in the app">
            {m.outcomes.map((o, i) => (
              <li key={i} className={`flex items-start gap-1 ${o.ok ? 'text-sand-300' : 'text-accent-300'}`}>
                {o.ok ? <Check size={12} className="mt-0.5 shrink-0" /> : <X size={12} className="mt-0.5 shrink-0" />}
                <span>
                  {o.label}
                  {o.message !== 'Done' ? `: ${o.message}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}

        {!mine && m.pending && m.pending.length > 0 && (
          <div className="rounded-xl bg-ink-850 p-2 text-xs text-sand-200 hairline">
            <p className="mb-1 font-semibold">This would change your scenario:</p>
            <ul className="mb-2 list-disc pl-4">
              {m.pending.map((a, i) => (
                <li key={i}>{describeAction(a)}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onConfirm(m.id, m.pending ?? [])}
                className="h-8 rounded-lg bg-accent-500 px-3 font-bold text-sand-50 hover:bg-accent-400"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => onDismiss(m.id)}
                className="h-8 rounded-lg bg-ink-800 px-3 text-sand-200 hairline hover:bg-ink-700"
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {m.failed && (
          <button
            type="button"
            onClick={onRetry}
            className="flex h-8 items-center gap-1 rounded-lg bg-ink-800 px-3 text-xs text-sand-100 hairline hover:bg-ink-700"
          >
            <RefreshCw size={12} /> Try again
          </button>
        )}
      </div>
    </li>
  );
}

export function ConversationPanel({ messages, onConfirm, onDismiss, onRetry }: Props) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" role="log" aria-live="polite" aria-label="Conversation with AeroSage">
      <ul className="space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} onConfirm={onConfirm} onDismiss={onDismiss} onRetry={onRetry} />
        ))}
      </ul>
      <div ref={end} />
    </div>
  );
}
