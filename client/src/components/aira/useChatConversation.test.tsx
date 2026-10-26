import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { StreamEvent } from './types';

const m = vi.hoisted(() => ({ events: [] as StreamEvent[], gate: null as Promise<void> | null, fetchMessages: vi.fn(), stopSessionTurn: vi.fn(), signals: [] as AbortSignal[] }));
vi.mock('./sse', async () => ({
  ...(await vi.importActual<typeof import('./sse')>('./sse')),
  streamTurn: async function* (_req: unknown, signal: AbortSignal) {
    m.signals.push(signal);
    for (const e of m.events) {
      if (e.event === 'delta' && m.gate) await m.gate;
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      yield e;
    }
  },
}));
vi.mock('./chatApi', () => ({ fetchMessages: m.fetchMessages, stopSessionTurn: m.stopSessionTurn }));

import { FOLLOW_POLL_MS, useChatConversation } from './useChatConversation';

const opts = () => ({ onSessionId: vi.fn(), onSessionsChanged: vi.fn(), onEngineError: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  m.gate = null;
  m.signals = [];
  m.fetchMessages.mockResolvedValue({ data: [], hasMore: false });
  m.stopSessionTurn.mockResolvedValue(true);
});

describe('useChatConversation streaming', () => {
  it('renames optimistic ids on `turn`, then appends deltas, tool chips and cards to the SAME assistant message', async () => {
    let release!: () => void;
    m.gate = new Promise<void>((r) => { release = r; });
    m.events = [
      { event: 'session', data: { session_id: 's1', title: null } },
      { event: 'turn', data: { turn_id: 't1', message_id: 'a-real', user_message_id: 'u-real' } },
      { event: 'tool', data: { name: 'whoami', label: 'Memeriksa…', state: 'start' } },
      { event: 'delta', data: { text: 'Ha' } },
      { event: 'delta', data: { text: 'lo' } },
      { event: 'card', data: { kind: 'approval', title: 'Menunggu persetujuan', href: '/approvals' } },
      { event: 'done', data: { message_id: 'a-real', duration_ms: 12 } },
    ];
    const o = opts();
    const { result } = renderHook(() => useChatConversation(o));
    let outcome: Promise<unknown> | undefined;
    act(() => { outcome = result.current.send('halo', null); });
    await waitFor(() => expect(result.current.messages.map((x) => x.id)).toEqual(['u-real', 'a-real']));
    expect(result.current.messages[1].status).toBe('streaming');
    expect(result.current.messages[1].tools).toHaveLength(1);
    expect(result.current.busy).toBe(true);
    act(() => release());
    await act(async () => { await outcome; });
    const bot = result.current.messages[1];
    expect(bot).toMatchObject({ content: 'Halo', status: 'ok' });
    expect(bot.cards).toHaveLength(1);
    expect(result.current.sessionId).toBe('s1');
    expect(o.onSessionId).toHaveBeenCalledWith('s1');
    expect(result.current.announce).toBe('Jawaban AIRA selesai.');
    expect(result.current.busy).toBe(false);
  });

  it('server error event keeps partial text and marks the answer as error', async () => {
    m.events = [
      { event: 'session', data: { session_id: 's1', title: null } },
      { event: 'turn', data: { turn_id: 't1', message_id: 'a1', user_message_id: 'u1' } },
      { event: 'delta', data: { text: 'Sebagian' } },
      { event: 'error', data: { message: 'Engine AIRA tidak dapat dihubungi.', code: 'engine_offline', message_id: 'a1' } },
    ];
    const o = opts();
    const { result } = renderHook(() => useChatConversation(o));
    await act(async () => { await result.current.send('tanya', null); });
    expect(result.current.messages[1]).toMatchObject({ status: 'error', content: 'Sebagian', error: 'Engine AIRA tidak dapat dihubungi.' });
    expect(o.onEngineError).toHaveBeenCalled();
    expect(result.current.announce).toBe('Jawaban AIRA gagal.');
  });
});

const msg = (over: Record<string, unknown>) => ({ id: 'x', role: 'assistant', content: '', status: 'ok', attachments: [], parts: null, ...over });
const streamingTurn = (): StreamEvent[] => [
  { event: 'session', data: { session_id: 's1', title: null } },
  { event: 'turn', data: { turn_id: 't1', message_id: 'a1', user_message_id: 'u1' } },
  { event: 'delta', data: { text: 'Seba' } },
  { event: 'delta', data: { text: 'gian' } },
  { event: 'done', data: { message_id: 'a1', duration_ms: 5 } },
];

describe('useChatConversation background turns', () => {
  it('leaving the page (unmount) mid-answer only drops the connection: the server turn is NOT stopped', async () => {
    m.gate = new Promise<void>(() => undefined); // tertahan selamanya
    m.events = streamingTurn();
    const { result, unmount } = renderHook(() => useChatConversation(opts()));
    act(() => { void result.current.send('jawab panjang', null); });
    await waitFor(() => expect(result.current.messages.map((x) => x.id)).toEqual(['u1', 'a1']));
    unmount();
    expect(m.signals[0].aborted).toBe(true);
    expect(m.stopSessionTurn).not.toHaveBeenCalled();
  });

  it('opening a session whose turn is still running follows it by polling until it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const running = { data: [msg({ id: 'u1', role: 'user', content: 'tanya', seq: 1 }), msg({ id: 'a1', content: 'Seba', status: 'streaming', seq: 2 })], hasMore: false, session: { busy: true } };
      const done = { data: [msg({ id: 'u1', role: 'user', content: 'tanya', seq: 1 }), msg({ id: 'a1', content: 'Sebagian lengkap', status: 'ok', seq: 2 })], hasMore: false, session: { busy: false } };
      m.fetchMessages.mockResolvedValueOnce(running).mockResolvedValueOnce(running).mockResolvedValue(done);
      const o = opts();
      const { result } = renderHook(() => useChatConversation(o));
      await act(async () => { await result.current.open('s1'); });
      expect(result.current.busy).toBe(true);
      expect(result.current.announce).toBe('AIRA sedang menjawab…');
      expect(result.current.messages[1]).toMatchObject({ status: 'streaming', content: 'Seba' });
      await act(async () => { await vi.advanceTimersByTimeAsync(FOLLOW_POLL_MS * 3); });
      await waitFor(() => expect(result.current.busy).toBe(false));
      expect(result.current.messages[1]).toMatchObject({ status: 'ok', content: 'Sebagian lengkap' });
      expect(result.current.announce).toBe('Jawaban AIRA selesai.');
      expect(m.fetchMessages).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Stop while streaming asks the server to stop THIS turn and marks the answer stopped', async () => {
    let release!: () => void;
    m.gate = new Promise<void>((r) => { release = r; });
    m.events = streamingTurn();
    const { result } = renderHook(() => useChatConversation(opts()));
    let outcome: Promise<unknown> | undefined;
    act(() => { outcome = result.current.send('jawab', null); });
    await waitFor(() => expect(result.current.messages.map((x) => x.id)).toEqual(['u1', 'a1']));
    act(() => result.current.stop());
    expect(m.stopSessionTurn).toHaveBeenCalledWith('s1', 't1');
    act(() => release());
    await act(async () => { await outcome; });
    expect(result.current.messages[1].status).toBe('aborted');
    expect(result.current.busy).toBe(false);
    expect(result.current.announce).toBe('Jawaban dihentikan.');
  });

  it('Stop while following a background turn calls the stop endpoint for the session', async () => {
    const running = { data: [msg({ id: 'a1', content: 'x', status: 'streaming', seq: 2 })], hasMore: false, session: { busy: true } };
    m.fetchMessages.mockResolvedValueOnce(running).mockResolvedValue({ data: [msg({ id: 'a1', content: 'x', status: 'aborted', seq: 2 })], hasMore: false, session: { busy: false } });
    const { result } = renderHook(() => useChatConversation(opts()));
    await act(async () => { await result.current.open('s1'); });
    expect(result.current.busy).toBe(true);
    await act(async () => { result.current.stop(); });
    expect(m.stopSessionTurn).toHaveBeenCalledWith('s1', undefined);
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.announce).toBe('Jawaban dihentikan.');
  });
});
