// AIRA config route — override per-tool + kill switch. Gate mount: requirePerm('settings')
// (di index.ts) — GET butuh view, tulis butuh edit. Endpoint sensitif tambah requireCap('rbac.manage').
// Token MCP, status & riwayat panggilan ada di routes/ai/mcp.ts. Whitelist channel/modul,
// service token & sinkronisasi tool-router (kontrak aira-core) sudah dipensiunkan.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireCap, type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { effectiveTools, getTool, riskToTier } from '../../ai/registry';
import type { ToolTier } from '../../ai/types';

const router = Router();

// Config responses are admin-only; keep them out of browser/proxy caches.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

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

// ─── KILL SWITCH ─────────────────────────────────────────────────────────────

// GET /api/ai/config/settings — singleton; buat default jika belum ada.
router.get('/settings', requireCap('rbac.manage'), async (_req, res) => {
  try {
    let s = await prisma.aiSetting.findFirst();
    if (!s) s = await prisma.aiSetting.create({ data: {} });
    return res.json({ id: s.id, agenticEnabled: s.agenticEnabled, updatedAt: s.updatedAt });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/config/settings', 'Gagal mengambil pengaturan AI.');
  }
});

const PutSettingsSchema = z.object({ agenticEnabled: z.boolean() });

// PUT /api/ai/config/settings — kill switch (gate rbac.manage)
router.put('/settings', requireCap('rbac.manage'), async (req, res) => {
  const body = validateBody(PutSettingsSchema, req.body, res);
  if (!body) return;

  try {
    const existing = await prisma.aiSetting.findFirst();
    const saved = existing
      ? await prisma.aiSetting.update({ where: { id: existing.id }, data: { agenticEnabled: body.agenticEnabled } })
      : await prisma.aiSetting.create({ data: { agenticEnabled: body.agenticEnabled } });
    return res.json({ id: saved.id, agenticEnabled: saved.agenticEnabled, updatedAt: saved.updatedAt });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ai/config/settings', 'Gagal menyimpan pengaturan AI.');
  }
});

export default router;
