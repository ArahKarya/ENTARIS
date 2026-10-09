// Admin REST untuk layer MCP (AIRA): status + kill switch, token servis, riwayat panggilan.
// Mount: /api/ai/mcp dengan requirePerm('settings'); SEMUA endpoint tambah requireCap('rbac.manage').
// Token mentah & signing secret hanya muncul di respons create / rotate-secret (sekali).

import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireCap, type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { localDayRange } from '../../utils/listQuery';
import { listTools } from '../../ai/registry';
import { DEFAULT_RATE_LIMIT_PER_MIN } from '../../mcp/constants';
import {
  assertRegisteredActor,
  createMcpToken,
  revokeMcpToken,
  rotateSigningSecret,
  toPublicToken,
} from '../../mcp/tokenService';

const router = Router();
router.use(requireCap('rbac.manage'));
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Status and kill switch

router.get('/status', async (_req, res) => {
  try {
    const setting = (await prisma.aiSetting.findFirst()) ?? (await prisma.aiSetting.create({ data: {} }));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [tokens, calls, overrides] = await Promise.all([
      prisma.mcpToken.findMany({ select: { revokedAt: true, expiresAt: true } }),
      prisma.mcpCallLog.groupBy({ by: ['decision'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.aiToolConfig.findMany({ where: { enabled: false } }),
    ]);
    const now = Date.now();
    const registry = listTools();
    const disabled = new Set(overrides.map((o) => o.toolName));
    const byDecision = Object.fromEntries(calls.map((c) => [c.decision, c._count._all]));
    return res.json({
      enabled: setting.agenticEnabled,
      endpoint: { path: '/mcp', transport: 'streamable-http', stateless: true },
      secretKeySource: process.env.MCP_SECRET_KEY ? 'MCP_SECRET_KEY' : 'JWT_SECRET',
      tokens: {
        active: tokens.filter((t) => !t.revokedAt && !(t.expiresAt && t.expiresAt.getTime() <= now)).length,
        total: tokens.length,
      },
      calls24h: { total: calls.reduce((s, c) => s + c._count._all, 0), ...byDecision },
      tools: { total: registry.length, enabled: registry.filter((t) => t.enabled && !disabled.has(t.name)).length },
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/mcp/status', 'Gagal mengambil status MCP.');
  }
});

router.put('/status', async (req, res) => {
  const body = validateBody(z.object({ agenticEnabled: z.boolean() }), req.body, res);
  if (!body) return;
  try {
    const existing = await prisma.aiSetting.findFirst();
    const saved = existing
      ? await prisma.aiSetting.update({ where: { id: existing.id }, data: { agenticEnabled: body.agenticEnabled } })
      : await prisma.aiSetting.create({ data: { agenticEnabled: body.agenticEnabled } });
    return res.json({ enabled: saved.agenticEnabled });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ai/mcp/status', 'Gagal menyimpan status MCP.');
  }
});

// Tokens

const futureDate = z
  .string()
  .datetime({ offset: true })
  .refine((v) => new Date(v).getTime() > Date.now(), { message: 'Tanggal kedaluwarsa harus di masa depan.' });

const CreateTokenSchema = z.object({
  name: z.string().trim().min(1, 'Nama token wajib diisi.').max(80),
  defaultActorUserId: z.string().min(1).max(64).nullish(),
  expiresAt: futureDate.nullish(),
  rateLimitPerMin: z.number().int().min(1).max(6000).optional(),
});

const PatchTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    defaultActorUserId: z.string().min(1).max(64).nullable().optional(),
    expiresAt: futureDate.nullable().optional(),
    rateLimitPerMin: z.number().int().min(1).max(6000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Minimal satu field harus diisi.' });

const withActorName = async <T extends { defaultActorUserId: string | null }>(rows: T[]) => {
  const ids = [...new Set(rows.map((r) => r.defaultActorUserId).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({ ...r, defaultActorName: r.defaultActorUserId ? (names.get(r.defaultActorUserId) ?? null) : null }));
};

router.get('/tokens', async (_req, res) => {
  try {
    const rows = await prisma.mcpToken.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json(await withActorName(rows.map(toPublicToken)));
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/mcp/tokens', 'Gagal mengambil daftar token.');
  }
});

router.post('/tokens', async (req: AuthRequest, res) => {
  const body = validateBody(CreateTokenSchema, req.body, res);
  if (!body) return;
  try {
    const created = await createMcpToken({
      name: body.name,
      defaultActorUserId: body.defaultActorUserId ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      rateLimitPerMin: body.rateLimitPerMin ?? DEFAULT_RATE_LIMIT_PER_MIN,
      createdById: req.user!.userId,
    });
    // token + signingSecret: ditampilkan SEKALI. Tidak disimpan dalam bentuk terbaca.
    return res.status(201).json({ ...created.record, token: created.token, signingSecret: created.signingSecret });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ai/mcp/tokens', 'Gagal membuat token MCP.');
  }
});

router.patch('/tokens/:id', async (req, res) => {
  const body = validateBody(PatchTokenSchema, req.body, res);
  if (!body) return;
  try {
    const id = req.params.id as string;
    const existing = await prisma.mcpToken.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('Token MCP tidak ditemukan.');
    if (existing.revokedAt) throw new BusinessError('Token sudah dicabut dan tidak dapat diubah.');
    if (body.defaultActorUserId) await assertRegisteredActor(body.defaultActorUserId);
    const data: Prisma.McpTokenUncheckedUpdateInput = {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.defaultActorUserId !== undefined && { defaultActorUserId: body.defaultActorUserId }),
      ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
      ...(body.rateLimitPerMin !== undefined && { rateLimitPerMin: body.rateLimitPerMin }),
    };
    const saved = await prisma.mcpToken.update({ where: { id }, data });
    return res.json((await withActorName([toPublicToken(saved)]))[0]);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ai/mcp/tokens/:id', 'Gagal mengubah token MCP.');
  }
});

const revoke = async (req: AuthRequest, res: import('express').Response) => {
  try {
    return res.json(await revokeMcpToken(req.params.id as string));
  } catch (error) {
    return handleRouteError(res, error, 'revoke /ai/mcp/tokens/:id', 'Gagal mencabut token MCP.');
  }
};
router.delete('/tokens/:id', revoke);
router.post('/tokens/:id/revoke', revoke);

router.post('/tokens/:id/rotate-secret', async (req, res) => {
  try {
    const r = await rotateSigningSecret(req.params.id as string);
    return res.json({ ...r.record, signingSecret: r.signingSecret });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ai/mcp/tokens/:id/rotate-secret', 'Gagal memutar signing secret.');
  }
});

// Call history

const CallsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  decision: z.enum(['allowed', 'queued', 'denied', 'error', 'inflight']).optional(),
  tool: z.string().max(100).optional(),
  tokenId: z.string().max(64).optional(),
  actor: z.string().max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.get('/calls', async (req, res) => {
  const parsed = CallsQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Parameter tidak valid.' });
  const q = parsed.data;
  try {
    let actorIds: string[] | undefined;
    if (q.actor) {
      const users = await prisma.user.findMany({
        where: { OR: [{ id: q.actor }, { fullName: { contains: q.actor, mode: 'insensitive' } }, { email: { contains: q.actor, mode: 'insensitive' } }] },
        select: { id: true },
        take: 50,
      });
      actorIds = users.map((u) => u.id);
    }
    const range = localDayRange(q.startDate, q.endDate);
    const where: Prisma.McpCallLogWhereInput = {
      ...(q.decision && { decision: q.decision }),
      ...(q.tool && { tool: { contains: q.tool, mode: 'insensitive' } }),
      ...(q.tokenId && { tokenId: q.tokenId }),
      ...(actorIds && { actorUserId: { in: actorIds } }),
      ...((range.gte || range.lt) && { createdAt: range }),
    };
    const [total, rows] = await Promise.all([
      prisma.mcpCallLog.count({ where }),
      prisma.mcpCallLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        // resultJson (hasil replay) tidak dikirim ke daftar.
        select: {
          id: true, tokenId: true, actorUserId: true, channel: true, tool: true, risk: true, decision: true, httpStatus: true,
          durationMs: true, approvalId: true, error: true, idempotencyKey: true, createdAt: true,
          token: { select: { name: true } },
        },
      }),
    ]);
    const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    const data = rows.map(({ token, ...r }) => ({ ...r, tokenName: token.name, actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null }));
    return res.json({ data, total, page: q.page, limit: q.limit });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/mcp/calls', 'Gagal mengambil riwayat panggilan.');
  }
});

export default router;
