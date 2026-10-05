import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockAgent, type MockAgent } from '../../../__tests__/helpers/mockAgent';
import { checkHealth, completeChat, EngineError, streamChat, type EngineStreamEvent } from '../engineClient';
import type { EngineConfig } from '../config';

let agent: MockAgent;
const cfg = (over: Partial<EngineConfig> = {}): EngineConfig => ({
  baseUrl: agent.url, apiKey: 'mock-key', model: 'aira', timeoutMs: 3_000, turnSecret: null, turnInMessage: true, acceptPdf: false, ...over,
});

beforeAll(async () => {
  agent = await startMockAgent();
});
afterAll(async () => {
  await agent.close();
});

async function collect(gen: AsyncGenerator<EngineStreamEvent>): Promise<EngineStreamEvent[]> {
  const out: EngineStreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}
const req = (extra: object = {}) => ({ messages: [{ role: 'system' as const, content: 'sys' }, { role: 'user' as const, content: 'hai' }], user: 'u1', ...extra });

describe('streamChat', () => {
  it('streams deltas then a done event, sending user/metadata/headers/Bearer', async () => {
    agent.setBehavior(() => ({ chunks: ['Ha', 'lo'] }));
    const events = await collect(streamChat(req({ metadata: { uid: 'u1', ch: 'panel', ref: 's:t' }, headers: { 'x-entaris-ref': 's:t' } }), cfg()));
    expect(events.filter((e) => e.type === 'delta').map((e) => (e as { text: string }).text).join('')).toBe('Halo');
    expect(events[events.length - 1]).toMatchObject({ type: 'done' });
    const last = agent.requests[agent.requests.length - 1];
    expect(last.body).toMatchObject({ stream: true, user: 'u1', metadata: { uid: 'u1', ch: 'panel', ref: 's:t' }, model: 'aira' });
    expect(last.headers['x-entaris-ref']).toBe('s:t');
  });

  it('maps HTTP/network failures to typed engine errors', async () => {
    agent.setBehavior(() => ({ status: 500 }));
    await expect(collect(streamChat(req(), cfg()))).rejects.toMatchObject({ code: 'engine_error' });
    agent.setBehavior(() => ({ status: 429 }));
    await expect(collect(streamChat(req(), cfg()))).rejects.toMatchObject({ code: 'engine_busy' });
    await expect(collect(streamChat(req(), cfg({ apiKey: 'salah' })))).rejects.toMatchObject({ code: 'engine_auth' });
    await expect(collect(streamChat(req(), cfg({ baseUrl: 'http://127.0.0.1:1' })))).rejects.toMatchObject({ code: 'engine_offline' });
    await expect(collect(streamChat(req(), cfg({ baseUrl: null })))).rejects.toMatchObject({ code: 'engine_not_configured' });
  });

  it('times out when the engine goes silent and cancels on abort', async () => {
    agent.setBehavior(() => ({ chunks: ['a'], hangAfterChunks: true }));
    await expect(collect(streamChat(req(), cfg({ timeoutMs: 300 })))).rejects.toMatchObject({ code: 'engine_timeout' });
    const ctl = new AbortController();
    const got: string[] = [];
    const run = (async () => {
      for await (const e of streamChat(req({ signal: ctl.signal }), cfg())) if (e.type === 'delta') got.push(e.text);
    })();
    setTimeout(() => ctl.abort(), 150);
    await expect(run).rejects.toBeInstanceOf(EngineError);
    await expect(run).rejects.toMatchObject({ code: 'aborted' });
    expect(got).toEqual(['a']);
  });
});

describe('completeChat / checkHealth', () => {
  it('returns the non-streaming completion text and fails clearly otherwise', async () => {
    agent.setBehavior(() => ({ completion: '  ringkasan  ' }));
    expect(await completeChat(req(), cfg())).toBe('ringkasan');
    agent.setBehavior(() => ({ completion: null }));
    await expect(completeChat(req(), cfg())).rejects.toMatchObject({ code: 'engine_error' });
  });

  it('reports online with latency, auth failure, offline and not-configured', async () => {
    const ok = await checkHealth(cfg());
    expect(ok).toMatchObject({ configured: true, online: true });
    expect(ok.latencyMs).not.toBeNull();
    expect(await checkHealth(cfg({ apiKey: 'salah' }))).toMatchObject({ online: false, reason: 'auth' });
    expect(await checkHealth(cfg({ baseUrl: 'http://127.0.0.1:1' }))).toMatchObject({ online: false, reason: 'unreachable' });
    expect(await checkHealth(cfg({ baseUrl: null }))).toMatchObject({ configured: false, online: false, reason: 'not_configured' });
  });
});
