// AIRA config route — kelola Tool Router config dari Settings → Agentic System.
// Gate mount: requireWrite('settings') (di index.ts). Endpoint sensitif tambah
// requireCap('rbac.manage'). Lihat docs/erd-ai-layer/PRD.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireCap, type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { effectiveTools, getTool, riskToTier } from '../../ai/registry';
import type { ToolTier } from '../../ai/types';

const router = Router();

const TIERS: ToolTier[] = ['auto', 'draft', 'must_approve'];

// ─── TOOLS ───────────────────────────────────────────────────────────────────

// GET /api/ai/config/tools — daftar tool (registry + override) = status efektif
router.get('/tools', async (_req, res) => {
  try {
    const overrides = await prisma.aiToolConfig.findMany();
    const map = new Map(overrides.map((o) => [o.toolName, { enabled: o.enabled, tier: o.tier }]));
    return res.json(effectiveTools(map));
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/config/tools', 'Gagal mengambil daftar tool.');
  }
});

const PatchToolSchema = z
  .object({
    enabled: z.boolean().optional(),
    tier: z.enum(['auto', 'draft', 'must_approve']).optional(),
  })
  .refine((b) => b.enabled !== undefined || b.tier !== undefined, {
    message: 'Minimal satu dari enabled/tier harus diisi.',
  });

// PATCH /api/ai/config/tools/:name — ubah enabled/tier 1 tool (override DB)
router.patch('/tools/:name', requireCap('rbac.manage'), async (req: AuthRequest, res) => {
  const body = validateBody(PatchToolSchema, req.body, res);
  if (!body) return;

  try {
    const name = req.params.name as string;
    const tool = getTool(name);
    if (!tool) throw new BusinessError(`Tool '${name}' tidak terdaftar di registry.`);

    // Tool read terkunci ke auto (tak boleh dinaikkan tier-nya).
    if (tool.risk === 'read' && body.tier && body.tier !== 'auto') {
      throw new BusinessError('Tool read terkunci ke tier auto.');
    }

    const data = {
      enabled: body.enabled ?? null,
      tier: body.tier ?? null,
      updatedBy: req.user?.userId ?? null,
    };
    const saved = await prisma.aiToolConfig.upsert({
      where: { toolName: name },
      create: { toolName: name, ...data },
      update: data,
    });
    return res.json({
      name,
      enabled: saved.enabled ?? tool.enabled,
      tier: (saved.tier as ToolTier) ?? riskToTier(tool.risk),
      source: 'override',
    });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ai/config/tools/:name', 'Gagal mengubah tool.');
  }
});

// ─── SETTINGS GLOBAL (API-based) ─────────────────────────────────────────────

// GET /api/ai/config/settings — singleton; buat default jika belum ada
router.get('/settings', async (_req, res) => {
  try {
    let s = await prisma.aiSetting.findFirst();
    if (!s) s = await prisma.aiSetting.create({ data: {} });
    return res.json(s);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/config/settings', 'Gagal mengambil pengaturan AI.');
  }
});

const PutSettingsSchema = z.object({
  provider: z.enum(['9router', 'claude', 'ollama', 'openai']).optional(),
  baseUrl: z.string().max(500).optional(),
  apiKeyEnv: z
    .string()
    .max(120)
    .regex(/^[A-Z0-9_]*$/, 'apiKeyEnv harus nama env var (HURUF_BESAR_GARIS).')
    .optional(),
  model: z.string().max(200).optional(),
  channels: z.array(z.enum(['telegram', 'whatsapp'])).optional(),
});

// PUT /api/ai/config/settings — simpan konfigurasi global (gate rbac.manage)
router.put('/settings', requireCap('rbac.manage'), async (req, res) => {
  const body = validateBody(PutSettingsSchema, req.body, res);
  if (!body) return;

  try {
    const existing = await prisma.aiSetting.findFirst();
    const data = {
      ...(body.provider !== undefined && { provider: body.provider }),
      ...(body.baseUrl !== undefined && { baseUrl: body.baseUrl }),
      ...(body.apiKeyEnv !== undefined && { apiKeyEnv: body.apiKeyEnv }),
      ...(body.model !== undefined && { model: body.model }),
      ...(body.channels !== undefined && { channels: body.channels }),
    };
    const saved = existing
      ? await prisma.aiSetting.update({ where: { id: existing.id }, data })
      : await prisma.aiSetting.create({ data });
    return res.json(saved);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ai/config/settings', 'Gagal menyimpan pengaturan AI.');
  }
});

// ─── WHITELIST (terstruktur) ─────────────────────────────────────────────────

// GET /api/ai/config/whitelist
router.get('/whitelist', async (_req, res) => {
  try {
    const list = await prisma.aiWhitelist.findMany({ orderBy: [{ channel: 'asc' }, { createdAt: 'asc' }] });
    return res.json(list);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/config/whitelist', 'Gagal mengambil whitelist.');
  }
});

const CreateWhitelistSchema = z.object({
  channel: z.enum(['telegram', 'whatsapp']),
  externalId: z.string().min(1).max(120),
  label: z.string().max(120).optional(),
  role: z.string().max(60).optional(),
});

// POST /api/ai/config/whitelist
router.post('/whitelist', requireCap('rbac.manage'), async (req, res) => {
  const body = validateBody(CreateWhitelistSchema, req.body, res);
  if (!body) return;

  try {
    const created = await prisma.aiWhitelist.create({
      data: {
        channel: body.channel,
        externalId: body.externalId,
        label: body.label ?? null,
        role: body.role ?? 'Viewer',
      },
    });
    return res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return handleRouteError(
        res,
        new BusinessError('Entri whitelist (channel + externalId) sudah ada.'),
        'POST /ai/config/whitelist',
        'Duplikat whitelist.',
      );
    }
    return handleRouteError(res, error, 'POST /ai/config/whitelist', 'Gagal menambah whitelist.');
  }
});

// DELETE /api/ai/config/whitelist/:id
router.delete('/whitelist/:id', requireCap('rbac.manage'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.aiWhitelist.findUnique({ where: { id } });
    if (!existing) throw new BusinessError('Entri whitelist tidak ditemukan.');
    await prisma.aiWhitelist.delete({ where: { id } });
    return res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ai/config/whitelist/:id', 'Gagal menghapus whitelist.');
  }
});

export default router;
