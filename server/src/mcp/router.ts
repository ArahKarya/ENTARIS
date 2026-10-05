// Endpoint MCP `/mcp` — Streamable HTTP, STATELESS (tanpa session; tiap POST berdiri sendiri,
// respons JSON biasa). Dipasang SEBELUM auth/CSRF/audit milik /api: autentikasi sendiri
// (Bearer token MCP + actor assertion), bukan cookie/JWT user.
//
// Urutan gerbang per request: token → kill switch → rate limit → aktor (assertion/default) → SDK.

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { MCP_BODY_LIMIT } from './constants';
import { recordCall } from './callLog';
import { resolveActor, type ActorContext } from './context';
import { checkRate } from './rateLimit';
import { buildActorServer, buildAnonymousServer, isCompactMode } from './server';
import { authenticateBearer, touchToken } from './tokenService';

const ACTOR_METHODS = new Set(['tools/list', 'tools/call']);

function rpcError(res: Response, status: number, code: number, message: string, data?: Record<string, unknown>) {
  return res.status(status).json({ jsonrpc: '2.0', error: { code, message, ...(data ? { data } : {}) }, id: null });
}

function methodsOf(body: unknown): string[] {
  const items = Array.isArray(body) ? body : [body];
  return items.map((m) => (m && typeof m === 'object' && typeof (m as { method?: unknown }).method === 'string' ? (m as { method: string }).method : ''));
}

const router = Router();

router.use(express.json({ limit: MCP_BODY_LIMIT }));

// Body terlalu besar / bukan JSON → galat JSON-RPC (bukan HTML/500 generik).
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.too.large') return rpcError(res, 413, -32600, `Body permintaan melebihi batas ${MCP_BODY_LIMIT}.`, { code: 'payload_too_large' });
  if (e?.type === 'entity.parse.failed') return rpcError(res, 400, -32700, 'Body bukan JSON yang valid.', { code: 'parse_error' });
  return next(err);
});

// Cek jangkauan tanpa auth (tidak membocorkan apa pun selain bahwa layanan hidup).
router.get('/health', (_req, res) => res.json({ status: 'ok', service: 'entaris-mcp', transport: 'streamable-http', stateless: true }));

// Stateless: tidak ada stream SSE server→klien maupun session untuk dihentikan.
router.get('/', (_req, res) => rpcError(res, 405, -32000, 'Metode tidak didukung: endpoint MCP ini stateless, gunakan POST.', { code: 'method_not_allowed' }));
router.delete('/', (_req, res) => rpcError(res, 405, -32000, 'Metode tidak didukung: tidak ada session untuk dihentikan (stateless).', { code: 'method_not_allowed' }));

router.post('/', async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    const auth = await authenticateBearer(req.headers.authorization);
    if (!auth.ok) {
      logger.warn({ code: auth.code, ip: req.ip }, 'MCP: autentikasi token gagal');
      return rpcError(res, 401, -32001, auth.message, { code: auth.code });
    }
    const { token } = auth;

    const setting = await prisma.aiSetting.findFirst({ select: { agenticEnabled: true } });
    if (!setting?.agenticEnabled) {
      await recordCall({ tokenId: token.id, tool: '(gate)', risk: 'read', argsHash: '', decision: 'denied', httpStatus: 503, durationMs: Date.now() - started, error: 'agentic_disabled' });
      return rpcError(res, 503, -32002, 'Layanan AIRA sedang dinonaktifkan oleh admin (kill switch). Coba lagi nanti.', { code: 'agentic_disabled' });
    }

    const rate = checkRate(token.id, token.rateLimitPerMin);
    if (!rate.ok) {
      logger.warn({ token: token.name, ip: req.ip }, 'MCP: rate limit terlampaui');
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      return rpcError(res, 429, -32003, `Terlalu banyak permintaan (batas ${token.rateLimitPerMin}/menit). Coba lagi dalam ${rate.retryAfterSec} detik.`, { code: 'rate_limited', retryAfterSec: rate.retryAfterSec });
    }
    touchToken(token.id, req.ip);

    const methods = methodsOf(req.body);
    const needsActor = methods.some((m) => ACTOR_METHODS.has(m));
    const who = await resolveActor(req.headers, token, needsActor);
    if (!who.ok) {
      await recordCall({ tokenId: token.id, tool: '(auth)', risk: 'read', argsHash: '', decision: 'denied', httpStatus: who.status, durationMs: Date.now() - started, error: who.code });
      logger.warn({ token: token.name, code: who.code, ip: req.ip }, 'MCP: aktor ditolak');
      return rpcError(res, who.status, -32001, who.message, { code: who.code });
    }

    const actor: ActorContext | null = who.actor;
    const server = actor
      ? buildActorServer({ ctx: { token, actor, clientIp: req.ip }, compact: isCompactMode(req.headers, req.query) })
      : buildAnonymousServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error({ err }, 'MCP: request gagal');
    if (!res.headersSent) rpcError(res, 500, -32603, 'Kesalahan internal pada layanan MCP.', { code: 'internal_error' });
  }
});

export default router;
