// AIRA Panel Chat (M4.5) — proxy ERP → aira-core.
//
// User keuangan pakai panel chat DI DALAM ERP. ERP server jadi jembatan ke
// aira-core (network aira-net, DNS http://aira-core:8080) supaya:
//   - klien tak pernah keluar origin ERP (tanpa CORS/expose aira-core publik),
//   - role + userId diambil dari JWT ERP (req.user), bukan dipercaya dari klien,
//   - gate agenticEnabled dihormati (sama seperti /api/ai/router).
//
// Endpoint:
//   POST /api/ai/chat/stream            → proxy SSE ke aira-core /v1/run/stream
//   POST /api/ai/chat/approve           → proxy ke aira-core /v1/approve
//   GET  /api/ai/chat/sessions          → daftar sesi user (aira-core)
//   GET  /api/ai/chat/sessions/:id/messages → riwayat 1 sesi
//
// Catatan stream: klien pakai fetch()+ReadableStream (bukan EventSource) karena
// butuh POST body. ERP pipe response aira-core apa adanya (text/event-stream).

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

const AIRA_BASE = process.env.AIRA_CORE_BASE_URL || 'http://aira-core:8080';

const ChatSchema = z.object({
  input: z.string().min(1, 'Pesan tidak boleh kosong.'),
  session_id: z.string().optional(),
});

const ApproveSchema = z.object({
  run_id: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().optional(),
});

/** Gate global agentic (sama semantik /api/ai/router). */
async function agenticEnabled(): Promise<boolean> {
  const setting = await prisma.aiSetting.findFirst();
  return !!setting?.agenticEnabled;
}

// ── POST /api/ai/chat/stream — proxy SSE ke aira-core /v1/run/stream ──
router.post('/stream', async (req: AuthRequest, res) => {
  const body = validateBody(ChatSchema, req.body, res);
  if (!body) return;
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });

  if (!(await agenticEnabled())) {
    return res.status(403).json({ ok: false, error: 'agentic_disabled', detail: 'Layer agentic dinonaktifkan. Aktifkan di Settings → Agentic System.' });
  }

  // Siapkan header SSE ke klien.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const upstream = await fetch(`${AIRA_BASE}/v1/run/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: body.input,
        app: 'erp-aks',
        session_id: body.session_id,
        user_id: user.userId,
        // role + userId DARI JWT ERP — bukan dari klien (anti-spoof RBAC).
        context: { role: user.role },
      }),
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      logger.error({ status: upstream.status, text: text.slice(0, 200) }, 'AIRA chat: upstream stream gagal');
      res.write(`event: error\ndata: ${JSON.stringify({ message: `AIRA upstream ${upstream.status}` })}\n\n`);
      return res.end();
    }

    // Pipe byte stream aira-core → klien apa adanya (SSE pass-through).
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    return res.end();
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      logger.info('AIRA chat: klien menutup stream');
      return res.end();
    }
    logger.error({ err }, 'AIRA chat: proxy stream error');
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
    } catch { /* header mungkin sudah terkirim */ }
    return res.end();
  }
});

// ── POST /api/ai/chat/approve — proxy ke aira-core /v1/approve ──
router.post('/approve', async (req: AuthRequest, res) => {
  const body = validateBody(ApproveSchema, req.body, res);
  if (!body) return;
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });

  if (!(await agenticEnabled())) {
    return res.status(403).json({ ok: false, error: 'agentic_disabled' });
  }

  try {
    const upstream = await fetch(`${AIRA_BASE}/v1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: body.run_id,
        decision: body.decision,
        note: body.note,
        by_user: user.userId,
      }),
    });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ai/chat/approve', 'Gagal approve via AIRA.');
  }
});

// ── GET /api/ai/chat/sessions — daftar sesi user (aira-core) ──
router.get('/sessions', async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  try {
    const url = new URL(`${AIRA_BASE}/v1/sessions`);
    url.searchParams.set('user_id', user.userId);
    url.searchParams.set('app', 'erp-aks');
    const upstream = await fetch(url, { method: 'GET' });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions', 'Gagal ambil sesi AIRA.');
  }
});

// ── GET /api/ai/chat/sessions/:id/messages — riwayat 1 sesi ──
router.get('/sessions/:id/messages', async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  try {
    const upstream = await fetch(`${AIRA_BASE}/v1/sessions/${encodeURIComponent(String(req.params.id))}/messages`, {
      method: 'GET',
    });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions/:id/messages', 'Gagal ambil riwayat AIRA.');
  }
});

export default router;
