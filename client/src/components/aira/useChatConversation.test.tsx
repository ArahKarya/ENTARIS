import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { StreamEvent } from './types';

const m = vi.hoisted(() => ({ events: [] as StreamEvent[], gate: null as Promise<void> | null, fetchMessages: vi.fn() }));
vi.mock('./sse', async () => ({
  ...(await vi.importActual<typeof import('./sse')>('./sse')),
  streamTurn: async function* () {
    for (const e of m.events) {
      if (e.event === 'delta' && m.gate) await m.gate;
      yield e;
    }
  },
}));
vi.mock('./chatApi', () => ({ fetchMessages: m.fetchMessages }));

import { useChatConversation } from './useChatConversation';

const opts = () => ({ onSessionId: vi.fn(), onSessionsChanged: vi.fn(), onEngineError: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  m.gate = null;
  m.fetchMessages.mockResolvedValue({ data: [], hasMore: false });
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
