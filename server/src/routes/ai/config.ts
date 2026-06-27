// AIRA config route — kelola Tool Router config dari Settings → Agentic System.
// Gate mount: requireWrite('settings') (di index.ts). Endpoint sensitif tambah
// requireCap('rbac.manage'). Lihat docs/erd-ai-layer/PRD.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { requireCap, type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { effectiveTools, getTool, riskToTier, loadRegistry } from '../../ai/registry';
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

// GET /api/ai/config/tool-router — FULL registry (app/version/modules/roles/
// capabilities/tools) untuk SYNC oleh AIRA core. ERP = sumber kebenaran tunggal:
// AIRA menarik katalog penuh dari sini (bukan file bundled). Tools sudah di-merge
// status efektif (enabled+tier dari override DB) supaya AIRA tak perlu fetch tier
// terpisah. Response = objek ToolRouter (kompatibel skema aira-core toolRouter.ts).
router.get('/tool-router', async (_req, res) => {
  try {
    const { registry, result } = loadRegistry();
    const overrides = await prisma.aiToolConfig.findMany();
    const map = new Map(overrides.map((o) => [o.toolName, { enabled: o.enabled, tier: o.tier }]));
    const tools = effectiveTools(map);
    return res.json({
      app: registry.app,
      version: registry.version,
      generatedNote: `served by ERP /ai/config/tool-router (live sync); loaded=${result.loaded}, skipped=${result.skipped.length}`,
      modules: registry.modules ?? [],
      roles: registry.roles ?? [],
      capabilities: registry.capabilities ?? [],
      tools,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/config/tool-router', 'Gagal mengambil tool-router.');
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

// ─── SETTINGS — KONEKSI AIRA (sisi-ERP minimal) ──────────────────────────────
// SEMUA urusan agentic (model AI, provider, memori, konteks, channels) dihandle
// AIRA. ERP hanya simpan: toggle agenticEnabled + serviceToken (Bearer untuk AIRA).

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

const VALID_CHANNELS = ['web', 'telegram', 'whatsapp'] as const;
const PutSettingsSchema = z
  .object({
    agenticEnabled: z.boolean().optional(),
    serviceToken: z.string().max(255).nullable().optional(),
    // M2-A4: channel aktif (subset web|telegram|whatsapp). Kosong = SEMUA aktif.
    activeChannels: z.array(z.enum(VALID_CHANNELS)).optional(),
    // M2-A4: scope modul (group bisnis) yang boleh dipakai AIRA. Kosong = SEMUA.
    whitelistModules: z.array(z.string().max(64)).max(50).optional(),
  })
  .refine(
    (b) =>
      b.agenticEnabled !== undefined ||
      b.serviceToken !== undefined ||
      b.activeChannels !== undefined ||
      b.whitelistModules !== undefined,
    { message: 'Minimal satu field harus diisi.' },
  );

// PUT /api/ai/config/settings — simpan config koneksi AIRA (gate rbac.manage)
router.put('/settings', requireCap('rbac.manage'), async (req, res) => {
  const body = validateBody(PutSettingsSchema, req.body, res);
  if (!body) return;

  try {
    const existing = await prisma.aiSetting.findFirst();
    const data = {
      ...(body.agenticEnabled !== undefined && { agenticEnabled: body.agenticEnabled }),
      ...(body.serviceToken !== undefined && { serviceToken: body.serviceToken }),
      ...(body.activeChannels !== undefined && { activeChannels: body.activeChannels }),
      ...(body.whitelistModules !== undefined && { whitelistModules: body.whitelistModules }),
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
