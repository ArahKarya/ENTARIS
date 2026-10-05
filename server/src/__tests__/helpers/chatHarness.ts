// Harness uji integrasi panel chat: DB Postgres sungguhan + app Express mini (router chat, riwayat
// chat, dan /mcp asli) + agen tiruan. Pengguna dibuat per tes dan dibersihkan (cascade) di akhir.

import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { startMockAgent, type MockAgent, type MockAgentOptions } from './mockAgent';

export interface TestUser {
  id: string;
  role: string;
  token: string;
}

export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface Harness {
  base: string;
  agent: MockAgent;
  mcp: { token: string; signingSecret: string; tokenId: string };
  turnSecret: string;
  createUser: (role: string, over?: { airaTier?: string; airaEnabled?: boolean; airaJabatan?: string; fullName?: string }) => Promise<TestUser>;
  api: (user: TestUser, method: string, path: string, body?: unknown) => Promise<Response>;
  stream: (user: TestUser, body: Record<string, unknown>, opts?: { abortAfterEvents?: number; controller?: AbortController; file?: { name: string; type: string; bytes: Buffer } }) => Promise<{ status: number; json?: Record<string, unknown>; events: SseEvent[] }>;
  setAgentic: (enabled: boolean) => Promise<void>;
  cleanup: () => Promise<void>;
}

async function parseSse(res: Response, abortAfter: number | undefined, ctl: AbortController): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  if (!res.body) return events;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (ev && data) events.push({ event: ev, data: JSON.parse(data) as Record<string, unknown> });
        if (abortAfter !== undefined && events.length >= abortAfter) {
          ctl.abort();
          return events;
        }
      }
    }
  } catch {
    // koneksi diputus (abort)
  }
  return events;
}

export async function createHarness(agentOpts: Partial<MockAgentOptions> = {}): Promise<Harness> {
  process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
  const turnSecret = 'turn-secret-for-integration-tests-0123456789';
  const [{ prisma }, { generateToken }, { createMcpToken }, mcpRouter, chatRouter, historyRouter, { authMiddleware }] = await Promise.all([
    import('../../lib/prisma'),
    import('../../utils/auth'),
    import('../../mcp/tokenService'),
    import('../../mcp/router').then((m) => m.default),
    import('../../routes/ai/chat').then((m) => m.default),
    import('../../routes/chatHistory').then((m) => m.default),
    import('../../middleware/auth'),
  ]);

  await (await import('../../services/rbacSeed')).ensureRbacSeed();
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/mcp', mcpRouter);
  app.use('/api', authMiddleware);
  app.use('/api/ai/chat', chatRouter);
  app.use('/api/chat-history', historyRouter);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const prevPort = process.env.PORT;
  process.env.PORT = String(port);
  const base = `http://127.0.0.1:${port}`;

  const admin = await prisma.user.findFirst({ where: { role: 'Admin' }, select: { id: true } });
  if (!admin) throw new Error('Seed belum dijalankan (tidak ada Admin).');
  const created = await createMcpToken({ name: `chat-test-${randomUUID().slice(0, 8)}`, createdById: admin.id });
  const prevSetting = await prisma.aiSetting.findFirst();
  if (prevSetting) await prisma.aiSetting.update({ where: { id: prevSetting.id }, data: { agenticEnabled: true } });
  else await prisma.aiSetting.create({ data: { agenticEnabled: true } });

  const agent = await startMockAgent({ turnSecret, mcp: { baseUrl: base, token: created.token, signingSecret: created.signingSecret }, ...agentOpts });
  const prevEnv = { url: process.env.AIRA_ENGINE_URL, key: process.env.AIRA_ENGINE_KEY, secret: process.env.AIRA_ENGINE_TURN_SECRET };
  process.env.AIRA_ENGINE_URL = agent.url;
  process.env.AIRA_ENGINE_KEY = 'mock-key';
  process.env.AIRA_ENGINE_TURN_SECRET = turnSecret;

  const users: string[] = [];
  const restore = (k: string, v: string | undefined): void => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };

  const h: Harness = {
    base,
    agent,
    mcp: { token: created.token, signingSecret: created.signingSecret, tokenId: created.record.id },
    turnSecret,
    createUser: async (role, over = {}) => {
      const tag = randomUUID().slice(0, 8);
      const u = await prisma.user.create({
        data: {
          username: `chat-${tag}`, email: `chat-${tag}@test.local`, fullName: over.fullName ?? `Uji ${role} ${tag}`, passwordHash: 'x', role,
          airaEnabled: over.airaEnabled ?? true, airaTier: over.airaTier ?? 'standard', airaJabatan: over.airaJabatan ?? null,
        },
      });
      users.push(u.id);
      return { id: u.id, role, token: generateToken({ userId: u.id, role }) };
    },
    api: (user, method, path, body) =>
      fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${user.token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }),
    stream: async (user, body, opts = {}) => {
      const ctl = opts.controller ?? new AbortController();
      let init: RequestInit;
      if (opts.file) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(body)) if (v !== undefined) fd.append(k, String(v));
        fd.append('file', new Blob([new Uint8Array(opts.file.bytes)], { type: opts.file.type }), opts.file.name);
        init = { method: 'POST', headers: { authorization: `Bearer ${user.token}` }, body: fd, signal: ctl.signal };
      } else {
        init = { method: 'POST', headers: { authorization: `Bearer ${user.token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal };
      }
      const res = await fetch(`${base}/api/ai/chat/stream`, init);
      if (!(res.headers.get('content-type') ?? '').includes('text/event-stream')) return { status: res.status, json: (await res.json()) as Record<string, unknown>, events: [] };
      return { status: res.status, events: await parseSse(res, opts.abortAfterEvents, ctl) };
    },
    setAgentic: async (enabled) => {
      const s = await prisma.aiSetting.findFirst();
      if (s) await prisma.aiSetting.update({ where: { id: s.id }, data: { agenticEnabled: enabled } });
    },
    cleanup: async () => {
      await agent.close();
      await new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      });
      await prisma.mcpCallLog.deleteMany({ where: { tokenId: created.record.id } });
      await prisma.mcpToken.delete({ where: { id: created.record.id } }).catch(() => undefined);
      await prisma.chatSession.deleteMany({ where: { userId: { in: users } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      if (prevSetting) await prisma.aiSetting.update({ where: { id: prevSetting.id }, data: { agenticEnabled: prevSetting.agenticEnabled } });
      restore('PORT', prevPort);
      restore('AIRA_ENGINE_URL', prevEnv.url);
      restore('AIRA_ENGINE_KEY', prevEnv.key);
      restore('AIRA_ENGINE_TURN_SECRET', prevEnv.secret);
      await prisma.$disconnect();
    },
  };
  return h;
}

/** PNG 1x1 valid (magic byte benar) untuk uji lampiran. */
export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
