import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  process.env.MCP_SECRET_KEY = 'unit-test-mcp-key-0123456789';
  return {
    user: { findUnique: vi.fn() },
    aiSetting: { findFirst: vi.fn() },
    mcpToken: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    mcpNonce: { create: vi.fn() },
    mcpCallLog: { create: vi.fn().mockResolvedValue({}) },
    aiToolConfig: { findMany: vi.fn().mockResolvedValue([]) },
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: m }));
vi.mock('../../services/permissionService', () => ({ can: vi.fn().mockResolvedValue(true), hasCap: vi.fn().mockResolvedValue(true) }));

import router, { extractEmbeddedAssertion } from '../router';
import { resolveActor } from '../context';
import { encryptSecret, generateMcpToken, sha256Hex, signPayload } from '../crypto';
import { resetRateLimits } from '../rateLimit';

const SECRET = 'entsig_unit-secret';
const TOKEN = generateMcpToken();
const tokenRow = (over: Record<string, unknown> = {}) => ({
  id: 't1', name: 'aira-dev', prefix: 'p', tokenHash: sha256Hex(TOKEN), signingSecretEnc: encryptSecret(SECRET), defaultActorUserId: null,
  expiresAt: null, revokedAt: null, lastUsedAt: null, lastUsedIp: null, createdById: 'a', createdAt: new Date(), rateLimitPerMin: 120, ...over,
});
const USER = { id: 'u1', fullName: 'Budi', email: 'b@x', role: 'Accountant', isActive: true, airaEnabled: true, airaTier: 'standard', airaJabatan: 'Kasir' };

function assertion(over: Record<string, unknown> = {}, secret = SECRET) {
  const p = { v: 1, uid: 'u1', ch: 'whatsapp', gf: false, ts: Math.floor(Date.now() / 1000), nonce: `n-${Math.random().toString(36).slice(2)}-aaaa`, ...over };
  const b64 = Buffer.from(JSON.stringify(p)).toString('base64url');
  return { 'x-entaris-actor': b64, 'x-entaris-actor-sig': signPayload(secret, b64) };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  m.user.findUnique.mockResolvedValue(USER);
  m.mcpNonce.create.mockResolvedValue({});
  m.aiSetting.findFirst.mockResolvedValue({ agenticEnabled: true });
  m.mcpToken.findUnique.mockResolvedValue(tokenRow());
  m.mcpToken.update.mockResolvedValue({});
  m.mcpCallLog.create.mockResolvedValue({});
  m.aiToolConfig.findMany.mockResolvedValue([]);
});

describe('resolveActor', () => {
  const tok = () => tokenRow() as never;

  it('valid assertion -> actor with channel, group floor and ref', async () => {
    const r = await resolveActor(assertion({ gf: true, ch: 'telegram', ref: 'tg:1' }), tok(), true);
    expect(r).toMatchObject({ ok: true, actor: { id: 'u1', channel: 'telegram', groupFloor: true, ref: 'tg:1', viaAssertion: true, airaJabatan: 'Kasir' } });
  });

  it.each([
    ['bad signature', () => ({ ...assertion(), 'x-entaris-actor-sig': 'a'.repeat(64) }), 401, 'actor_signature_invalid'],
    ['wrong secret', () => assertion({}, 'attacker'), 401, 'actor_signature_invalid'],
    ['expired ts', () => assertion({ ts: Math.floor(Date.now() / 1000) - 500 }), 401, 'actor_assertion_expired'],
    ['half header', () => ({ 'x-entaris-actor': 'abc' }), 401, 'actor_assertion_malformed'],
  ])('rejects %s', async (_n, hdr, status, code) => {
    const r = await resolveActor(hdr() as never, tok(), true);
    expect(r).toMatchObject({ ok: false, status, code });
  });

  it('replayed nonce is rejected (unique violation)', async () => {
    m.mcpNonce.create.mockRejectedValueOnce({ code: 'P2002' });
    expect(await resolveActor(assertion(), tok(), true)).toMatchObject({ ok: false, status: 401, code: 'actor_nonce_replayed' });
  });

  it('unknown / inactive / unregistered users are refused', async () => {
    m.user.findUnique.mockResolvedValueOnce(null);
    expect(await resolveActor(assertion(), tok(), true)).toMatchObject({ ok: false, status: 403, code: 'actor_unknown' });
    m.user.findUnique.mockResolvedValueOnce({ ...USER, isActive: false });
    expect(await resolveActor(assertion(), tok(), true)).toMatchObject({ ok: false, status: 403, code: 'actor_inactive' });
    m.user.findUnique.mockResolvedValueOnce({ ...USER, airaEnabled: false });
    expect(await resolveActor(assertion(), tok(), true)).toMatchObject({ ok: false, status: 403, code: 'actor_not_registered' });
  });

  it('no assertion: default actor (channel cli) or 401 when required', async () => {
    const withDefault = tokenRow({ defaultActorUserId: 'u1' }) as never;
    expect(await resolveActor({}, withDefault, true)).toMatchObject({ ok: true, actor: { id: 'u1', channel: 'cli', viaAssertion: false } });
    expect(await resolveActor({}, tok(), true)).toMatchObject({ ok: false, status: 401, code: 'actor_required' });
    expect(await resolveActor({}, tok(), false)).toMatchObject({ ok: true, actor: null });
  });

  it('a supplied-but-invalid assertion never falls back to the default actor', async () => {
    const withDefault = tokenRow({ defaultActorUserId: 'u1' }) as never;
    const r = await resolveActor({ ...assertion(), 'x-entaris-actor-sig': 'b'.repeat(64) } as never, withDefault, true);
    expect(r).toMatchObject({ ok: false, code: 'actor_signature_invalid' });
  });
});

describe('POST /mcp (HTTP gates)', () => {
  let server: http.Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use('/mcp', router);
    server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const post = (body: unknown, headers: Record<string, string> = {}, raw?: string) =>
    fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${TOKEN}`, ...headers },
      body: raw ?? JSON.stringify(body),
    });
  const LIST = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } };

  it('wrong / missing / revoked / expired token -> 401 JSON-RPC error', async () => {
    m.mcpToken.findUnique.mockResolvedValueOnce(null);
    const wrong = await post(LIST, { authorization: 'Bearer entmcp_wrong' });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as any).error.data.code).toBe('token_invalid');
    expect((await post(LIST, { authorization: '' })).status).toBe(401);
    m.mcpToken.findUnique.mockResolvedValueOnce(tokenRow({ revokedAt: new Date() }));
    expect(((await (await post(LIST)).json()) as any).error.data.code).toBe('token_revoked');
    m.mcpToken.findUnique.mockResolvedValueOnce(tokenRow({ expiresAt: new Date(Date.now() - 5) }));
    expect(((await (await post(LIST)).json()) as any).error.data.code).toBe('token_expired');
  });

  it('kill switch -> 503 on every call (and logged)', async () => {
    m.aiSetting.findFirst.mockResolvedValue({ agenticEnabled: false });
    const r = await post(LIST, assertion());
    expect(r.status).toBe(503);
    expect(((await r.json()) as any).error.data.code).toBe('agentic_disabled');
    expect(m.mcpCallLog.create.mock.calls[0][0].data).toMatchObject({ decision: 'denied', error: 'agentic_disabled' });
  });

  it('rate limit -> 429 with Retry-After once the per-token budget is spent', async () => {
    m.mcpToken.findUnique.mockResolvedValue(tokenRow({ rateLimitPerMin: 2 }));
    expect((await post(INIT)).status).toBe(200);
    expect((await post(INIT)).status).toBe(200);
    const r = await post(INIT);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('tools/list without assertion and without default actor -> 401 actor_required; initialize is fine', async () => {
    const list = await post(LIST);
    expect(list.status).toBe(401);
    expect(((await list.json()) as any).error.data.code).toBe('actor_required');
    expect((await post(INIT)).status).toBe(200);
  });

  it('bad signature / replay are rejected and logged as denied (auth)', async () => {
    const bad = await post(LIST, { ...assertion(), 'x-entaris-actor-sig': 'c'.repeat(64) });
    expect(bad.status).toBe(401);
    expect(m.mcpCallLog.create.mock.calls.at(-1)![0].data).toMatchObject({ tool: '(auth)', decision: 'denied', error: 'actor_signature_invalid' });
    m.mcpNonce.create.mockRejectedValueOnce({ code: 'P2002' });
    const replay = await post(LIST, assertion());
    expect(((await replay.json()) as any).error.data.code).toBe('actor_nonce_replayed');
  });

  it('valid assertion -> tools/list returns only tools for that actor tier (read-level = read-only)', async () => {
    m.user.findUnique.mockResolvedValue({ ...USER, airaTier: 'read' });
    const r = await post(LIST, assertion());
    expect(r.status).toBe(200);
    const tools = ((await r.json()) as any).result.tools as Array<{ name: string; annotations: { readOnlyHint: boolean } }>;
    expect(tools.length).toBeGreaterThan(100);
    expect(tools.filter((t) => !['cari_tool', 'dokumen_tool', 'whoami'].includes(t.name)).every((t) => t.annotations.readOnlyHint)).toBe(true);
    m.user.findUnique.mockResolvedValue({ ...USER, airaTier: 'standard' });
    const std = ((await (await post(LIST, assertion())).json()) as any).result.tools;
    expect(std.length).toBeGreaterThan(tools.length);
  });

  it('compact mode lists only the meta tools (+ panggil_tool)', async () => {
    const r = await post(LIST, { ...assertion(), 'x-entaris-tools': 'compact' });
    const names = ((await r.json()) as any).result.tools.map((t: any) => t.name);
    expect(names).toEqual(['cari_tool', 'dokumen_tool', 'whoami', 'panggil_tool']);
  });

  it('oversized body -> 413 JSON-RPC error; invalid JSON -> 400; GET/DELETE -> 405; health is open', async () => {
    const big = await post(null, {}, JSON.stringify({ pad: 'x'.repeat(300_000) }));
    expect(big.status).toBe(413);
    expect(((await big.json()) as any).error.data.code).toBe('payload_too_large');
    expect((await post(null, {}, '{not json')).status).toBe(400);
    expect((await fetch(base, { method: 'GET' })).status).toBe(405);
    expect((await fetch(base, { method: 'DELETE' })).status).toBe(405);
    const h = await fetch(`${base}/health`);
    expect(h.status).toBe(200);
  });

  it('compact tools/list needs no actor (static meta tools only); full list still does', async () => {
    const compact = await post(LIST, { 'x-entaris-tools': 'compact' });
    expect(compact.status).toBe(200);
    expect(((await compact.json()) as any).result.tools.map((t: any) => t.name)).toEqual(['cari_tool', 'dokumen_tool', 'whoami', 'panggil_tool']);
    expect((await post(LIST)).status).toBe(401);
  });

  it('assertion can ride in tools/call arguments (static-header clients like Hermes); keys are stripped', async () => {
    const a = assertion({ ch: 'telegram' });
    const call = {
      jsonrpc: '2.0', id: 5, method: 'tools/call',
      params: { name: 'whoami', arguments: { _entaris_actor: a['x-entaris-actor'], _entaris_actor_sig: a['x-entaris-actor-sig'] } },
    };
    const r = await post(call);
    const body = (await r.json()) as any;
    expect(r.status).toBe(200);
    expect(body.result.structuredContent.actor.nama).toBe('Budi');
    expect(body.result.structuredContent.channel).toBe('telegram');
    expect(body.result.structuredContent.identitas_dari).toBe('actor_assertion');
    const bad = await post({ ...call, params: { name: 'whoami', arguments: { _entaris_actor: a['x-entaris-actor'], _entaris_actor_sig: 'd'.repeat(64) } } });
    expect(bad.status).toBe(401);
    // the AI model cannot forge it: a payload signed without the secret is refused
    const forged = assertion({ uid: 'admin' }, 'model-guess');
    const f = await post({ ...call, params: { name: 'whoami', arguments: { _entaris_actor: forged['x-entaris-actor'], _entaris_actor_sig: forged['x-entaris-actor-sig'] } } });
    expect(f.status).toBe(401);
  });

  it('extractEmbeddedAssertion removes the keys even when nothing is used', () => {
    const body = { params: { arguments: { x: 1, _entaris_actor: 'a', _entaris_actor_sig: 'b' } } };
    expect(extractEmbeddedAssertion(body)).toEqual({ payload: 'a', sig: 'b' });
    expect(body.params.arguments).toEqual({ x: 1 });
    expect(extractEmbeddedAssertion({ params: { arguments: { _entaris_actor: 'only-one' } } })).toBeNull();
    expect(extractEmbeddedAssertion(null)).toBeNull();
  });

  it('whoami over HTTP returns structured content for the assertion actor', async () => {
    const call = { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'whoami', arguments: {} } };
    const r = await post(call, assertion({ ch: 'cli' }));
    const body = (await r.json()) as any;
    expect(body.result.isError).toBeFalsy();
    expect(body.result.structuredContent.actor).toMatchObject({ nama: 'Budi', jabatan: 'Kasir' });
    expect(body.result.structuredContent.channel).toBe('cli');
  });
});
