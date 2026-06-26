// AIRA Tool Router — satu pintu eksekusi tool (BRD AIRA Pilar 2/3).
//
// Alur (PRD FR6, M4.4.2 Pola A — approval terpusat di AIRA):
//   1. resolve tool dari registry+override (status efektif)
//   2. tolak bila tak ada / enabled=false
//   3. cek izin 2-lapis (role, modul RBAC, capability)
//   4. risk=read → eksekusi via internal fetch → data
//   5. risk=write/critical:
//        (A) Header A3 ada (X-AIRA-Run/Ts/Sig) → verifyAiraApproval → eksekusi nyata
//            (approval sudah lewat Approval Queue AIRA) → catat runId (anti-replay).
//        (B) Tanpa header A3 (Test Tool UI / akses manual) → ApprovalRequest di DB ERP.
//
// POLA A = approval terpusat di AIRA. ERP router = executor murni untuk AIRA.
// ERP TIDAK bikin ApprovalRequest utk jalur AIRA — itu sudah ditangani Approval Queue AIRA.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { type AuthRequest } from '../../middleware/auth';
import { can, hasCap } from '../../services/permissionService';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { effectiveTools } from '../../ai/registry';
import { logger } from '../../lib/logger';
import { verifyAiraApproval, recordExecutedRun } from '../../ai/airaApproval';

const router = Router();

const InvokeSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Ambil status efektif tool by-name (registry + override DB). */
async function resolveTool(name: string) {
  const overrides = await prisma.aiToolConfig.findMany();
  const map = new Map(overrides.map((o) => [o.toolName, { enabled: o.enabled, tier: o.tier }]));
  return effectiveTools(map).find((t) => t.name === name);
}

/** Render confirm_template dengan args (mis. "Bayar Rp {amount}"). */
function renderConfirm(tpl: string | undefined, args: Record<string, unknown>): string | undefined {
  if (!tpl) return undefined;
  return tpl.replace(/\{(\w+)\}/g, (_m, k) => {
    const v = args[k];
    return v === undefined || v === null ? `{${k}}` : String(v);
  });
}

// POST /api/ai/router — INTI. Dipanggil engine AI / UI Test Tool.
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(InvokeSchema, req.body, res);
  if (!body) return;

  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });

  try {
    // Gate global: layer agentic harus diaktifkan dari Settings → Agentic System.
    // Kalau agenticEnabled=false → tolak SEMUA invoke (engine AIRA & Test Tool).
    const setting = await prisma.aiSetting.findFirst();
    if (!setting?.agenticEnabled) {
      logger.warn({ tool: body.tool, by: user.userId }, 'AIRA router: agentic_disabled');
      return res.status(403).json({ ok: false, error: 'agentic_disabled', detail: 'Layer agentic dinonaktifkan. Aktifkan di Settings → Agentic System.' });
    }

    const tool = await resolveTool(body.tool);

    // (b) tool ada & aktif
    if (!tool) {
      logger.warn({ tool: body.tool, by: user.userId }, 'AIRA router: tool_not_found');
      return res.status(404).json({ ok: false, error: 'tool_not_found' });
    }
    if (!tool.enabled) {
      return res.status(404).json({ ok: false, error: 'tool_disabled' });
    }

    // (c) izin 2-lapis
    // lapis 1: role pemanggil ∈ daftar roles tool
    if (!tool.roles.includes(user.role)) {
      // super-admin tetap dicek can() di lapis 2; tapi roles[] adalah kontrak eksplisit.
      const superOk = await can(user.role, tool.module, tool.permAction);
      if (!superOk) {
        return res
          .status(403)
          .json({ ok: false, error: 'permission_denied', detail: 'role tidak diizinkan untuk tool ini' });
      }
    }
    // lapis 2: izin modul RBAC (warisi izin app)
    if (!(await can(user.role, tool.module, tool.permAction))) {
      return res
        .status(403)
        .json({ ok: false, error: 'permission_denied', detail: `butuh izin ${tool.permAction} pada modul ${tool.module}` });
    }
    // lapis 3 (opsional): capability sensitif
    if (tool.requiresCapability && !(await hasCap(user.role, tool.requiresCapability))) {
      return res
        .status(403)
        .json({ ok: false, error: 'permission_denied', detail: `butuh capability ${tool.requiresCapability}` });
    }

    // (d) READ → eksekusi via internal fetch ke endpoint sendiri (auth diteruskan)
    if (tool.risk === 'read') {
      const [method, path] = tool.handler.split(' ');
      if (method !== 'GET') {
        return res.status(500).json({ ok: false, error: 'invalid_read_handler' });
      }
      const port = process.env.PORT || 3001;
      const authHeader = req.headers.authorization;
      const cookie = req.headers.cookie;
      const airaServiceToken = req.headers['x-aira-service-token'] as string | undefined;
      const url = `http://127.0.0.1:${port}${path}`;
      try {
        const upstream = await fetch(url, {
          method: 'GET',
          headers: {
            ...(authHeader ? { authorization: authHeader } : {}),
            ...(cookie ? { cookie } : {}),
            // Teruskan service-token AIRA (A+.0) ke hop internal agar endpoint
            // handler dapat re-autentikasi sebagai aira-system. Tanpa ini,
            // pemanggil service-token lolos di /api/ai/router tapi loopback
            // internal kena 401 (tak ada JWT/cookie).
            ...(airaServiceToken ? { 'x-aira-service-token': airaServiceToken } : {}),
          },
        });
        const data = await upstream.json().catch(() => null);
        if (!upstream.ok) {
          return res.status(200).json({ ok: false, kind: 'read', upstreamStatus: upstream.status, data });
        }
        logger.info({ tool: tool.name, by: user.userId }, 'AIRA router: read OK');
        return res.json({ ok: true, kind: 'read', data });
      } catch (err) {
        logger.error({ err, tool: tool.name }, 'AIRA router: read fetch gagal');
        return res.status(502).json({ ok: false, error: 'upstream_unreachable' });
      }
    }

    // (e) WRITE/CRITICAL — dua jalur:
    //   (A) Header A3 ada → dari AIRA (sudah lewat Approval Queue) → eksekusi nyata.
    //   (B) Tanpa A3 → dari Test Tool UI / manual → ApprovalRequest DB ERP (existing).

    const hasAiraHeaders =
      req.headers['x-aira-run'] || req.headers['x-aira-ts'] || req.headers['x-aira-sig'];

    if (hasAiraHeaders) {
      // ── Jalur A: AIRA Pola A — verifikasi A3, eksekusi nyata. ──
      const airaCheck = await verifyAiraApproval(req, tool.name, body.args);
      if (!airaCheck.ok) {
        logger.warn(
          { tool: tool.name, reason: airaCheck.reason, by: user.userId },
          'AIRA router: A3 gagal',
        );
        return res.status(403).json({ ok: false, error: 'aira_approval_failed', detail: airaCheck.reason });
      }

      // A3 lolos — forward ke handler asli (internal fetch, same-process).
      const [method, path] = tool.handler.split(' ');
      const port = process.env.PORT || 3001;
      const authHeader = req.headers.authorization;
      const cookie = req.headers.cookie;
      const airaServiceToken = req.headers['x-aira-service-token'] as string | undefined;
      const url = `http://127.0.0.1:${port}${path}`;
      try {
        const upstream = await fetch(url, {
          method: method ?? 'POST',
          headers: {
            'content-type': 'application/json',
            ...(authHeader ? { authorization: authHeader } : {}),
            ...(cookie ? { cookie } : {}),
            ...(airaServiceToken ? { 'x-aira-service-token': airaServiceToken } : {}),
          },
          body: ['GET', 'HEAD'].includes(method ?? '') ? undefined : JSON.stringify(body.args),
        });
        const data = await upstream.json().catch(() => null);
        if (!upstream.ok) {
          logger.error(
            { tool: tool.name, status: upstream.status },
            'AIRA router: A3 upstream gagal',
          );
          return res.status(502).json({ ok: false, error: 'upstream_error', upstreamStatus: upstream.status, data });
        }

        // Catat runId → anti-replay sekali pakai.
        const ref = (data as Record<string, unknown>)?.id as string | undefined
          ?? (data as Record<string, unknown>)?.journalId as string | undefined;
        await recordExecutedRun(airaCheck.runId!, tool.name, ref);

        logger.info(
          { tool: tool.name, runId: airaCheck.runId, ref, by: user.userId },
          'AIRA router: A3 eksekusi OK',
        );
        return res.json({ ok: true, kind: 'executed', runId: airaCheck.runId, data });
      } catch (err) {
        logger.error({ err, tool: tool.name }, 'AIRA router: A3 upstream unreachable');
        return res.status(502).json({ ok: false, error: 'upstream_unreachable' });
      }
    }

    // ── Jalur B: Test Tool UI / manual (tanpa A3) → ApprovalRequest DB ERP. ──
    const confirmText = renderConfirm(tool.confirm_template, body.args);
    const amount =
      typeof body.args.amount === 'number'
        ? body.args.amount
        : typeof body.args.amount === 'string' && !Number.isNaN(Number(body.args.amount))
          ? Number(body.args.amount)
          : null;

    const approval = await prisma.approvalRequest.create({
      data: {
        documentType: `ai_tool:${tool.name}`,
        amount: amount ?? undefined,
        payload: {
          tool: tool.name,
          module: tool.module,
          handler: tool.handler,
          risk: tool.risk,
          confirm: confirmText,
          args: body.args as object,
          requestedVia: 'test_tool_ui',
        },
        status: 'Pending',
        requestedBy: user.userId,
        notes: confirmText,
      },
    });

    logger.info(
      { tool: tool.name, risk: tool.risk, approvalId: approval.id, by: user.userId },
      'AIRA router: Test Tool → ApprovalRequest dibuat',
    );

    return res.json({
      ok: true,
      kind: 'action',
      status: 'pending_approval',
      approvalId: approval.id,
      confirm: confirmText,
    });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ai/router', 'Gagal memproses tool.');
  }
});

export default router;
