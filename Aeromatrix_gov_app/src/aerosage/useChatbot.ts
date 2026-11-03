import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatbotError, getHealth, resetSession, streamChat, postChat, type Session } from './chatbotAdapter';
import { parseActions, splitActions, type Action } from './aeromatrixActions';
import { buildUiContext, executeActions } from './existingTwinAdapter';
import type { ChatMessage, ChatPayload, Health } from './types';

const SESSION_KEY = 'aerosage.session';
const MAX_MESSAGES = 60;

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    return typeof s.id === 'string' && typeof s.token === 'string' ? { id: s.id, token: s.token } : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the chat just starts fresh next time */
  }
}

let counter = 0;
const mid = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text:
    'Hi, I am AeroSage. Ask me for a station reading ("PM2.5 at Hadapsar"), a historical forecast, how reliable the model is, or what AeroMatrix does. Numbers come straight from the model service; if it is not running I will say so rather than guess.',
};

export type ServiceState = 'checking' | 'online' | 'offline';

export function useChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [busy, setBusy] = useState(false);
  const [service, setService] = useState<ServiceState>('checking');
  const [health, setHealth] = useState<Health | null>(null);
  const session = useRef<Session | null>(loadSession());
  const abort = useRef<AbortController | null>(null);
  const lastSent = useRef<string>('');

  const patch = useCallback((id: string, p: Partial<ChatMessage>) => {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }, []);

  const check = useCallback(async () => {
    setService('checking');
    try {
      const h = await getHealth();
      setHealth(h);
      setService('online');
    } catch {
      setHealth(null);
      setService('offline');
    }
  }, []);

  useEffect(() => {
    void check();
    return () => abort.current?.abort();
  }, [check]);

  const finish = useCallback(
    (replyId: string, payload: ChatPayload) => {
      if (payload.session_token) {
        session.current = { id: payload.session_id, token: payload.session_token };
        saveSession(session.current);
      }
      const { actions } = parseActions(payload.reply.actions);
      // Looking around runs straight away; changing the person's scenario (and what follows it) waits for a click.
      const { now: auto, waiting: pending } = splitActions(actions);
      const outcomes = payload.reply.status === 'offline' ? [] : executeActions(auto);
      patch(replyId, {
        text: payload.reply.text,
        status: payload.reply.status,
        sources: payload.reply.sources,
        language: payload.reply.language,
        outcomes,
        pending,
        streaming: false,
        failed: false,
      });
    },
    [patch],
  );

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return;
      lastSent.current = message;
      const replyId = mid();
      setMessages((m) =>
        [...m, { id: mid(), role: 'user' as const, text: message }, { id: replyId, role: 'assistant' as const, text: '', streaming: true }].slice(-MAX_MESSAGES),
      );
      setBusy(true);
      abort.current?.abort();
      const ctl = new AbortController();
      abort.current = ctl;
      const base = { message, context: buildUiContext(), signal: ctl.signal };
      const attempt = async (): Promise<ChatPayload> => {
        try {
          return await streamChat({
            ...base,
            session: session.current,
            onToken: (t) => setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: x.text + t } : x))),
          });
        } catch (e) {
          if (e instanceof ChatbotError && e.kind === 'http') {
            patch(replyId, { text: '' });
            return postChat({ ...base, session: session.current });
          }
          throw e;
        }
      };
      try {
        let payload: ChatPayload;
        try {
          payload = await attempt();
        } catch (e) {
          if (e instanceof ChatbotError && e.kind === 'session') {
            // The token expired (24 h) or the server restarted: start a new session once and retry.
            session.current = null;
            saveSession(null);
            payload = await attempt();
          } else {
            throw e;
          }
        }
        finish(replyId, payload);
        setService('online');
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const offline = e instanceof ChatbotError && e.kind === 'offline';
        if (offline) setService('offline');
        patch(replyId, {
          text: e instanceof Error ? e.message : 'Something went wrong.',
          status: 'offline',
          streaming: false,
          failed: true,
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, finish, patch],
  );

  const retry = useCallback(() => {
    const text = lastSent.current;
    if (!text) return;
    setMessages((m) => {
      const copy = [...m];
      // Drop the failed reply and the question so it is sent again cleanly.
      if (copy.length >= 2 && copy[copy.length - 1]?.failed) copy.splice(-2, 2);
      return copy;
    });
    void send(text);
  }, [send]);

  /** Runs the confirmed disruptive actions of one message. */
  const confirm = useCallback(
    (id: string, actions: Action[]) => {
      const outcomes = executeActions(actions);
      setMessages((m) =>
        m.map((x) => (x.id === id ? { ...x, pending: [], outcomes: [...(x.outcomes ?? []), ...outcomes] } : x)),
      );
    },
    [],
  );

  const dismiss = useCallback((id: string) => patch(id, { pending: [] }), [patch]);

  const clear = useCallback(async () => {
    abort.current?.abort();
    const s = session.current;
    session.current = null;
    saveSession(null);
    setMessages([WELCOME]);
    setBusy(false);
    if (s) {
      try {
        await resetSession(s);
      } catch {
        /* the server drops the session after 24 h anyway */
      }
    }
  }, []);

  return { messages, busy, service, health, send, retry, confirm, dismiss, clear, recheck: check };
}
