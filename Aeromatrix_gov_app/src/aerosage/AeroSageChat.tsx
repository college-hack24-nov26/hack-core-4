import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { RotateCcw, Send, X } from 'lucide-react';
import { AeroSageAvatar } from './AeroSageAvatar';
import { ConversationPanel } from './ConversationPanel';
import { MicButton, VoiceControls } from './VoiceControls';
import { chatbotBaseUrl } from './chatbotAdapter';
import { useChatbot } from './useChatbot';
import { useVoiceAssistant } from './useVoiceAssistant';

const SUGGESTIONS = ['PM2.5 at Hadapsar', 'How accurate is the model?', 'What if I cut traffic by 20%?', 'What is AeroMatrix?'];

export function AeroSageChat({ onClose }: { onClose: () => void }) {
  const chat = useChatbot();
  const [draft, setDraft] = useState('');

  const submit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      setDraft('');
      void chat.send(t);
    },
    [chat],
  );

  const voice = useVoiceAssistant(submit);

  const last = chat.messages[chat.messages.length - 1];
  // Read each finished reply aloud once (only the assistant's, never the person's own message).
  const spoken = useRef<string | null>(null);
  useEffect(() => {
    if (!last || last.role !== 'assistant' || last.streaming || last.failed || !last.text || last.id === 'welcome') return;
    if (spoken.current === last.id) return;
    spoken.current = last.id;
    voice.say(last.text);
  }, [last, voice]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };

  return (
    <section
      aria-label="AeroSage assistant"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl bg-ink-900 text-sand-100 shadow-2xl hairline"
    >
      <header className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
        <AeroSageAvatar size={28} />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">AeroSage</h2>
          <p className="truncate text-[11px] text-sand-400">
            {chat.service === 'online'
              ? chat.health?.model_api === 'online'
                ? 'Connected to the model service'
                : 'Chat is up; the model service is offline'
              : chat.service === 'checking'
                ? 'Connecting…'
                : 'Not running'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void chat.clear()}
          title="Start a new conversation"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-800"
        >
          <RotateCcw size={15} />
          <span className="sr-only">New conversation</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sand-300 hover:bg-ink-800"
        >
          <X size={16} />
          <span className="sr-only">Close AeroSage</span>
        </button>
      </header>

      {chat.service === 'offline' && (
        <div role="status" className="border-b border-ink-700 bg-ink-850 px-3 py-2 text-xs text-sand-200">
          <p className="font-semibold">AeroSage is not running.</p>
          <p className="text-sand-300">
            Start it with <code className="rounded bg-ink-800 px-1">backend\chatbot\START_CHATBOT.bat</code> (or run{' '}
            <code className="rounded bg-ink-800 px-1">RUN_AEROMATRIX.bat</code>). Looking for it at {chatbotBaseUrl()}. The map and
            simulator work without it.
          </p>
          <button
            type="button"
            onClick={() => void chat.recheck()}
            className="mt-1 h-7 rounded-lg bg-ink-800 px-2 text-sand-100 hairline hover:bg-ink-700"
          >
            Check again
          </button>
        </div>
      )}

      <ConversationPanel messages={chat.messages} onConfirm={chat.confirm} onDismiss={chat.dismiss} onRetry={chat.retry} />

      {chat.messages.length <= 1 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={chat.busy}
              className="rounded-full bg-ink-800 px-3 py-1 text-xs text-sand-200 hairline hover:bg-ink-700 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-ink-700 p-3">
        <VoiceControls voice={voice} />
        {voice.error && (
          <p role="alert" className="text-xs text-accent-300">
            {voice.error}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <MicButton voice={voice} disabled={chat.busy} />
          <label className="min-w-0 flex-1">
            <span className="sr-only">Message AeroSage</span>
            <input
              value={voice.listening && voice.interim ? voice.interim : draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              placeholder={voice.listening ? 'Listening…' : 'Ask about air quality…'}
              className="h-11 w-full rounded-xl bg-ink-800 px-3 text-sm text-sand-100 placeholder:text-sand-500 hairline focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
          </label>
          <button
            type="submit"
            disabled={chat.busy || !draft.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-sand-50 hover:bg-accent-400 disabled:opacity-50"
          >
            <Send size={18} />
            <span className="sr-only">Send</span>
          </button>
        </form>
      </div>
    </section>
  );
}
