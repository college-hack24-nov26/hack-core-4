import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatbotError, chatbotBaseUrl, getHealth, parseSse, postChat, streamChat } from '../chatbotAdapter';

const payload = {
  session_id: 's1',
  session_token: 't1',
  reply: { text: 'PM2.5: 40.1 ug/m3', status: 'ok', intent: 'observation', language: 'en', sources: [], data: {}, actions: [], used_llm: false, followup: false },
};

function sse(parts: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('chatbot client', () => {
  it('defaults to the local service address', () => {
    expect(chatbotBaseUrl()).toBe('http://127.0.0.1:8010');
  });

  it('parses events split across chunks', () => {
    const a = parseSse('event: meta\ndata: {"a":1}\n\nevent: tok');
    expect(a.events).toEqual([{ event: 'meta', data: '{"a":1}' }]);
    const b = parseSse(a.rest + 'en\ndata: {"text":"x"}\n\n');
    expect(b.events).toEqual([{ event: 'token', data: '{"text":"x"}' }]);
    expect(b.rest).toBe('');
  });

  it('streams tokens and returns the final payload from the done event', async () => {
    const tokens: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          `event: meta\ndata: ${JSON.stringify({ session_id: 's1' })}\n\n`,
          'event: token\ndata: {"text":"PM2.5: "}\n\nevent: tok',
          'en\ndata: {"text":"40.1 ug/m3"}\n\n',
          `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
        ]),
      ),
    );
    const out = await streamChat({ message: 'hi', session: null, context: {}, onToken: (t) => tokens.push(t) });
    expect(tokens.join('')).toBe('PM2.5: 40.1 ug/m3');
    expect(out.reply.text).toBe('PM2.5: 40.1 ug/m3');
    expect(out.session_token).toBe('t1');
  });

  it('sends the session token as a header and the context as JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await postChat({ message: 'hi', session: { id: 's1', token: 'secret' }, context: { pollutant: 'pm10' } });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://127.0.0.1:8010/chat');
    expect((call[1].headers as Record<string, string>)['X-Session-Token']).toBe('secret');
    expect(JSON.parse(call[1].body as string)).toEqual({ message: 'hi', session_id: 's1', context: { pollutant: 'pm10' } });
  });

  it('reports an unreachable service as offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(getHealth()).rejects.toMatchObject({ kind: 'offline' });
    await expect(postChat({ message: 'x', session: null, context: {} })).rejects.toBeInstanceOf(ChatbotError);
  });

  it('reports a rejected token as a session problem and server errors as http', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await expect(postChat({ message: 'x', session: { id: 'a', token: 'b' }, context: {} })).rejects.toMatchObject({ kind: 'session' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    await expect(postChat({ message: 'x', session: null, context: {} })).rejects.toMatchObject({ kind: 'http' });
  });

  it('refuses a reply that is not the expected shape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ hello: 'world' }), { status: 200 })));
    await expect(postChat({ message: 'x', session: null, context: {} })).rejects.toMatchObject({ kind: 'http' });
  });

  it('fails when the stream ends without a done event', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse(['event: token\ndata: {"text":"half"}\n\n'])));
    await expect(streamChat({ message: 'x', session: null, context: {} })).rejects.toThrow(/stopped/);
  });
});
