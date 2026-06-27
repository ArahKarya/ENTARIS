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
import multer from 'multer';
import { prisma } from '../../lib/prisma';
import { type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// A2: terima lampiran dokumen (PDF/gambar) <=10MB untuk diteruskan ke aira-core.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const AIRA_BASE = process.env.AIRA_CORE_BASE_URL || 'http://aira-core:8080';

// Bearer token utk auth ke aira-core (sinkron dgn aira-core AIRA_API_TOKEN).
// aira-core menolak /v1/* tanpa Bearer (401) -> tanpa ini, FE kena 401 -> interceptor logout.
const AIRA_API_TOKEN = process.env.AIRA_API_TOKEN || '';
function airaHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (AIRA_API_TOKEN) h['Authorization'] = `Bearer ${AIRA_API_TOKEN}`;
  return h;
}

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
router.post('/stream', upload.single('file'), async (req: AuthRequest, res) => {
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
    // A2: bila ada lampiran (multipart file) -> teruskan sbg FormData ke aira-core.
    //     Selain itu tetap JSON (panel chat teks). role+userId dari JWT ERP (anti-spoof).
    const upFile = (req as AuthRequest & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
    let upstream: Response;
    if (upFile?.buffer?.length) {
      const fd = new FormData();
      fd.append('input', body.input);
      fd.append('app', 'simple-erp');
      if (body.session_id) fd.append('session_id', body.session_id);
      fd.append('user_id', user.userId);
      fd.append('context', JSON.stringify({ role: user.role }));
      fd.append('file', new Blob([new Uint8Array(upFile.buffer)], { type: upFile.mimetype }), upFile.originalname || 'lampiran');
      upstream = await fetch(`${AIRA_BASE}/v1/run/stream`, {
        method: 'POST',
        headers: airaHeaders(), // JANGAN set Content-Type; fetch set boundary FormData.
        body: fd,
        signal: controller.signal,
      });
    } else {
      upstream = await fetch(`${AIRA_BASE}/v1/run/stream`, {
        method: 'POST',
        headers: airaHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          input: body.input,
          app: 'simple-erp',
          session_id: body.session_id,
          user_id: user.userId,
          context: { role: user.role },
        }),
        signal: controller.signal,
      });
    }

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
      headers: airaHeaders({ 'Content-Type': 'application/json' }),
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
    url.searchParams.set('app', 'simple-erp');
    const upstream = await fetch(url, { method: 'GET', headers: airaHeaders() });
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
    // Teruskan user_id agar aira-core menegakkan ownership (cegah IDOR baca sesi user lain).
    const url = new URL(`${AIRA_BASE}/v1/sessions/${encodeURIComponent(String(req.params.id))}/messages`);
    url.searchParams.set('user_id', user.userId);
    const upstream = await fetch(url, { method: 'GET', headers: airaHeaders() });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions/:id/messages', 'Gagal ambil riwayat AIRA.');
  }
});

// ── PATCH /api/ai/chat/sessions/:id — rename (title) / archive (status) ──
// Proxy ke aira-core PATCH /v1/sessions/:id. Validasi payload minimal di sini,
// aira-core yang menegakkan kontrak penuh. Auth ERP (req.user) jadi gerbang.
const PatchSessionSchema = z
  .object({
    title: z.string().min(1).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .refine((d) => d.title !== undefined || d.status !== undefined, {
    message: 'minimal satu field (title|status) wajib diisi',
  });

router.patch('/sessions/:id', async (req: AuthRequest, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ ok: false, error: 'unauthenticated' });
  const body = validateBody(PatchSessionSchema, req.body, res);
  if (!body) return;
  try {
    // Sertakan user_id agar aira-core menegakkan ownership (cegah IDOR ubah sesi user lain).
    const upstream = await fetch(`${AIRA_BASE}/v1/sessions/${encodeURIComponent(String(req.params.id))}`, {
      method: 'PATCH',
      headers: airaHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...body, user_id: user.userId }),
    });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ai/chat/sessions/:id', 'Gagal memperbarui sesi AIRA.');
  }
});

// ── GET /api/ai/chat/aira-health — detect aira-core hidup (Fase 5) ──
// ERP ping aira-core /v1/health untuk UI badge online/offline di Settings →
// Agentic. Selalu balas 200 ke klien (status di body), supaya FE mudah render.
// online=true bila aira-core merespons 200. Timeout pendek (3s) agar UI responsif.
router.get('/aira-health', async (_req: AuthRequest, res) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const upstream = await fetch(`${AIRA_BASE}/v1/health`, {
      method: 'GET',
      headers: airaHeaders(),
      signal: controller.signal,
    });
    const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
    return res.json({
      online: upstream.ok,
      status: (data?.status as string) ?? (upstream.ok ? 'ok' : 'error'),
      version: (data?.version as string) ?? null,
      tools_loaded: (data?.tools_loaded as number) ?? null,
      base_url: AIRA_BASE,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    // Unreachable / timeout → offline (bukan error HTTP, UI tetap render badge).
    logger.warn({ err: (err as Error).message }, 'AIRA health: aira-core unreachable');
    return res.json({
      online: false,
      status: 'unreachable',
      version: null,
      tools_loaded: null,
      base_url: AIRA_BASE,
      checked_at: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
