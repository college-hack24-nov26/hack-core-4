import type { ChatPayload, Health, UiContext } from './types';

const DEFAULT_URL = 'http://127.0.0.1:8010';

export function chatbotBaseUrl(): string {
  const v = (import.meta.env.VITE_CHATBOT_API_URL as string | undefined)?.trim();
  return (v || DEFAULT_URL).replace(/\/+$/, '');
}

export class ChatbotError extends Error {
  constructor(
    message: string,
    /** offline = could not reach the service; session = token rejected; http = the service said no */
    readonly kind: 'offline' | 'session' | 'http',
  ) {
    super(message);
    this.name = 'ChatbotError';
  }
}

export interface Session {
  id: string;
  token: string;
}

async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${chatbotBaseUrl()}${path}`, { ...init, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ChatbotError(`AeroSage is not reachable at ${chatbotBaseUrl()}.`, 'offline');
  }
  if (res.status === 401) throw new ChatbotError('The chat session expired.', 'session');
  if (!res.ok) throw new ChatbotError(`AeroSage answered with an error (${res.status}).`, 'http');
  return res;
}

function headers(session: Session | null): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(session ? { 'X-Session-Token': session.token } : {}) };
}

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const res = await request('/health', { method: 'GET' }, signal);
  return (await res.json()) as Health;
}

export interface ChatOptions {
  message: string;
  session: Session | null;
  context: UiContext;
  signal?: AbortSignal;
  /** called with each piece of text as it arrives */
  onToken?: (text: string) => void;
}

function isPayload(x: unknown): x is ChatPayload {
  return !!x && typeof x === 'object' && typeof (x as ChatPayload).session_id === 'string' && typeof (x as ChatPayload).reply?.text === 'string';
}

/** Plain request/response. Used as the fallback when streaming is not possible. */
export async function postChat(o: ChatOptions): Promise<ChatPayload> {
  const res = await request(
    '/chat',
    {
      method: 'POST',
      headers: headers(o.session),
      body: JSON.stringify({ message: o.message, session_id: o.session?.id, context: o.context }),
    },
    o.signal,
  );
  const json: unknown = await res.json().catch(() => null);
  if (!isPayload(json)) throw new ChatbotError('AeroSage sent a reply the app could not read.', 'http');
  return json;
}

/** Parses a server-sent-events body into {event, data} records. Exported for tests. */
export function parseSse(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf('\n\n');
    if (end < 0) break;
    const block = rest.slice(0, end);
    rest = rest.slice(end + 2);
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

/** Streams a reply. The final payload (from the `done` event) is authoritative; tokens are only for display. */
export async function streamChat(o: ChatOptions): Promise<ChatPayload> {
  const res = await request(
    '/chat/stream',
    {
      method: 'POST',
      headers: headers(o.session),
      body: JSON.stringify({ message: o.message, session_id: o.session?.id, context: o.context }),
    },
    o.signal,
  );
  if (!res.body) return postChatFromResponse(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: ChatPayload | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const parsed = parseSse(buffer);
    buffer = parsed.rest;
    for (const ev of parsed.events) {
      let data: unknown;
      try {
        data = JSON.parse(ev.data);
      } catch {
        continue;
      }
      if (ev.event === 'token' && data && typeof (data as { text?: unknown }).text === 'string') o.onToken?.((data as { text: string }).text);
      if (ev.event === 'done' && isPayload(data)) final = data;
    }
  }
  if (!final) throw new ChatbotError('The reply stopped before it finished.', 'http');
  return final;
}

async function postChatFromResponse(res: Response): Promise<ChatPayload> {
  const json: unknown = await res.json().catch(() => null);
  if (!isPayload(json)) throw new ChatbotError('AeroSage sent a reply the app could not read.', 'http');
  return json;
}

export async function resetSession(session: Session): Promise<void> {
  await request('/session/reset', { method: 'POST', headers: headers(session), body: JSON.stringify({ session_id: session.id }) });
}
