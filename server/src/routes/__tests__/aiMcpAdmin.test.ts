import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'unit-test-jwt-secret-value-0123456789';
  process.env.MCP_SECRET_KEY = 'unit-test-mcp-key-0123456789';
  return {
    mcpToken: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    mcpCallLog: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    aiSetting: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    aiToolConfig: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    hasCap: vi.fn(),
  };
});
vi.mock('../../lib/prisma', () => ({ prisma: m }));
vi.mock('../../services/permissionService', () => ({ can: vi.fn(), hasCap: m.hasCap }));

import mcpAdmin from '../ai/mcp';
import { authMiddleware } from '../../middleware/auth';
import { auditTrailMiddleware } from '../../middleware/auditTrail';

let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as never as { user: unknown }).user = { userId: 'admin-1', role: 'Admin' };
    next();
  });
  app.use('/api/ai/mcp', mcpAdmin);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/mcp`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1', name: 'aira-dev', prefix: 'entmcp_abcdef', tokenHash: 'HASH', signingSecretEnc: 'ENC', defaultActorUserId: null,
  expiresAt: null, revokedAt: null, lastUsedAt: null, lastUsedIp: null, createdById: 'admin-1', createdAt: new Date(), rateLimitPerMin: 120, ...over,
});
const send = (method: string, path: string, body?: unknown) =>
  fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  m.hasCap.mockResolvedValue(true);
  m.user.findMany.mockResolvedValue([]);
  m.aiToolConfig.findMany.mockResolvedValue([]);
});

describe('admin REST /api/ai/mcp', () => {
  it('requires rbac.manage on every endpoint', async () => {
    m.hasCap.mockResolvedValue(false);
    for (const [method, path] of [['GET', '/status'], ['GET', '/tokens'], ['POST', '/tokens'], ['GET', '/calls'], ['PUT', '/status']] as const) {
      expect((await send(method, path, method === 'GET' ? undefined : {})).status).toBe(403);
    }
  });

  it('POST /tokens returns token + signingSecret ONCE; stores only hash + ciphertext', async () => {
    m.mcpToken.create.mockImplementation(async ({ data }: any) => row(data));
    const r = await send('POST', '/tokens', { name: 'aira-dev', rateLimitPerMin: 60 });
    expect(r.status).toBe(201);
    const j = (await r.json()) as any;
    expect(j.token).toMatch(/^entmcp_/);
    expect(j.signingSecret).toMatch(/^entsig_/);
    expect(j).not.toHaveProperty('tokenHash');
    expect(j).not.toHaveProperty('signingSecretEnc');
    const stored = JSON.stringify(m.mcpToken.create.mock.calls[0][0].data);
    expect(stored).not.toContain(j.token);
    expect(stored).not.toContain(j.signingSecret);
    expect(m.mcpToken.create.mock.calls[0][0].data.rateLimitPerMin).toBe(60);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('POST /tokens validates name, expiry (future) and default actor registration', async () => {
    expect((await send('POST', '/tokens', { name: '' })).status).toBe(400);
    expect((await send('POST', '/tokens', { name: 'x', expiresAt: '2020-01-01T00:00:00Z' })).status).toBe(400);
    m.user.findUnique.mockResolvedValue({ isActive: true, airaEnabled: false, fullName: 'Budi' });
    const r = await send('POST', '/tokens', { name: 'x', defaultActorUserId: 'u1' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).error).toContain('Akses AIRA');
  });

  it('GET /tokens lists without secrets and with status + default actor name', async () => {
    m.mcpToken.findMany.mockResolvedValue([row({ defaultActorUserId: 'u1' }), row({ id: 't2', revokedAt: new Date() })]);
    m.user.findMany.mockResolvedValue([{ id: 'u1', fullName: 'Budi' }]);
    const list = (await (await send('GET', '/tokens')).json()) as any[];
    expect(list.map((t) => t.status)).toEqual(['active', 'revoked']);
    expect(list[0].defaultActorName).toBe('Budi');
    expect(JSON.stringify(list)).not.toMatch(/HASH|ENC/);
  });

  it('revoke (DELETE and POST) + rotate-secret (once) + patch refuses revoked tokens', async () => {
    m.mcpToken.findUnique.mockResolvedValue(row());
    m.mcpToken.update.mockImplementation(async ({ data }: any) => row(data));
    const d = await send('DELETE', '/tokens/t1');
    expect(((await d.json()) as any).status).toBe('revoked');
    const rot = (await (await send('POST', '/tokens/t1/rotate-secret')).json()) as any;
    expect(rot.signingSecret).toMatch(/^entsig_/);
    expect(rot).not.toHaveProperty('signingSecretEnc');
    m.mcpToken.findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
    expect((await send('PATCH', '/tokens/t1', { name: 'baru' })).status).toBe(400);
    expect((await send('POST', '/tokens/t1/rotate-secret')).status).toBe(400);
  });

  it('GET /calls is paged {data,total,page,limit} with filters incl. local-day range and actor lookup', async () => {
    m.user.findMany.mockResolvedValueOnce([{ id: 'u1' }]).mockResolvedValueOnce([{ id: 'u1', fullName: 'Budi' }]);
    m.mcpCallLog.count.mockResolvedValue(51);
    m.mcpCallLog.findMany.mockResolvedValue([{ id: 'c1', tokenId: 't1', actorUserId: 'u1', channel: 'whatsapp', tool: 'party_create', risk: 'write', decision: 'queued', httpStatus: null, durationMs: 12, approvalId: 'a1', error: null, idempotencyKey: null, createdAt: new Date(), token: { name: 'aira-dev' } }]);
    const r = await send('GET', '/calls?page=2&limit=25&decision=queued&tool=party&actor=bud&startDate=2026-10-01&endDate=2026-10-02');
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ total: 51, page: 2, limit: 25 });
    expect(j.data[0]).toMatchObject({ tokenName: 'aira-dev', actorName: 'Budi', approvalId: 'a1' });
    const args = m.mcpCallLog.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 25, take: 25, where: { decision: 'queued', actorUserId: { in: ['u1'] } } });
    expect(args.where.createdAt.gte).toBeInstanceOf(Date);
    expect(args.where.createdAt.lt).toBeInstanceOf(Date);
    expect(args.select).not.toHaveProperty('resultJson');
    expect((await send('GET', '/calls?limit=1000')).status).toBe(400);
    expect((await send('GET', '/calls?startDate=bad')).status).toBe(400);
  });

  it('PUT /status flips the kill switch; GET /status summarises tokens, calls and tools', async () => {
    m.aiSetting.findFirst.mockResolvedValue({ id: 's1', agenticEnabled: true });
    m.aiSetting.update.mockResolvedValue({ id: 's1', agenticEnabled: false });
    expect(((await (await send('PUT', '/status', { agenticEnabled: false })).json()) as any).enabled).toBe(false);
    expect(m.aiSetting.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { agenticEnabled: false } });
    m.mcpToken.findMany.mockResolvedValue([{ revokedAt: null, expiresAt: null }, { revokedAt: new Date(), expiresAt: null }]);
    m.mcpCallLog.groupBy.mockResolvedValue([{ decision: 'allowed', _count: { _all: 4 } }, { decision: 'queued', _count: { _all: 1 } }]);
    m.aiToolConfig.findMany.mockResolvedValue([{ toolName: 'coa_list' }]);
    const s = (await (await send('GET', '/status')).json()) as any;
    expect(s).toMatchObject({ enabled: true, secretKeySource: 'MCP_SECRET_KEY', tokens: { active: 1, total: 2 }, calls24h: { total: 5, allowed: 4, queued: 1 } });
    expect(s.tools.total).toBe(474);
    expect(s.tools.enabled).toBe(473);
  });
});

describe('legacy service-token path is gone', () => {
  it('x-aira-service-token no longer grants an identity (401, not Admin)', async () => {
    const app = express();
    app.use('/api', authMiddleware, (_req, res) => res.json({ reached: true }));
    const s = http.createServer(app);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${(s.address() as AddressInfo).port}/api/x`;
    const res = await fetch(url, { headers: { 'x-aira-service-token': 'a'.repeat(40) } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as any).error).toContain('Token tidak ditemukan');
    await new Promise<void>((r) => s.close(() => r()));
    expect(typeof auditTrailMiddleware).toBe('function');
  });
});
