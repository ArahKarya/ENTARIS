// AIRA chat panel: Entaris stores sessions and messages per user and calls the agent over an
// OpenAI-compatible API (docs/ai-tools/PANEL-CHAT.md). Every query is scoped to the owner
// (other sessions = 404); message content is never logged, only ids and lengths.
//
//   GET    /api/ai/chat/health                  status engine (online/offline + latensi)
//   GET    /api/ai/chat/sessions                daftar sesi (q, status, page, limit)
//   GET    /api/ai/chat/sessions/last           sesi terakhir dibuka (lintas perangkat)
//   POST   /api/ai/chat/sessions                buat sesi kosong
//   GET    /api/ai/chat/sessions/:id/messages   riwayat (kursor `before` = seq)
//   GET    /api/ai/chat/sessions/:id/export     unduh Markdown/JSON
//   PATCH  /api/ai/chat/sessions/:id            ubah judul / arsip
//   DELETE /api/ai/chat/sessions/:id            hapus sesi + lampiran (diaudit)
//   GET    /api/ai/chat/attachments/:id         lampiran milik sendiri
//   POST   /api/ai/chat/stream                  satu giliran (SSE)

import fs from 'node:fs/promises';
import { Router, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { type AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { getFullPath } from '../../utils/fileStorage';
import { hasCap } from '../../services/permissionService';
import { CHAT_ATTACHMENT_MAX_BYTES } from '../../services/chat/attachments';
import { getChatLimits, getEngineConfig } from '../../services/chat/config';
import { checkHealth } from '../../services/chat/engineClient';
import { exportSession } from '../../services/chat/exportSession';
import { checkTurnRate } from '../../services/chat/rateLimit';
import {
  attachmentFor,
  createSession,
  deleteSession,
  getOwnedSession,
  lastSession,
  listMessages,
  listSessions,
  markOpened,
  publicSession,
  updateSession,
} from '../../services/chat/sessionService';
import { prepareTurn, TurnHttpError } from '../../services/chat/turnPrepare';
import { runTurn } from '../../services/chat/turnRun';
import { translateFields } from '../../i18n/translateFields';
import { requestLanguage } from '../../middleware/responseLanguage';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: CHAT_ATTACHMENT_MAX_BYTES, files: 1 } });

const uid = (req: AuthRequest): string | null => req.user?.userId ?? null;
const param = (req: AuthRequest, key: string): string => String(req.params[key] ?? '');

async function agenticEnabled(): Promise<boolean> {
  const setting = await prisma.aiSetting.findFirst({ select: { agenticEnabled: true } });
  return !!setting?.agenticEnabled;
}

// GET /health: dipanggil panel (banner offline) dan Pengaturan (baris status)
router.get('/health', async (req: AuthRequest, res) => {
  const cfg = getEngineConfig();
  const health = await checkHealth(cfg);
  const admin = !!req.user && (await hasCap(req.user.role, 'rbac.manage'));
  return res.json({
    ...health,
    // The panel shows the kill switch as its own banner; every other chat route answers 403.
    agenticEnabled: await agenticEnabled(),
    acceptsPdf: cfg.acceptPdf,
    checkedAt: new Date().toISOString(),
    ...(admin && cfg.baseUrl ? { url: cfg.baseUrl } : {}),
  });
});

// Semua endpoint di bawah: kill switch layanan AIRA.
router.use(async (_req, res, next) => {
  try {
    if (!(await agenticEnabled())) {
      return res.status(403).json({ error: 'agentic_disabled', message: 'Layanan AIRA sedang dinonaktifkan oleh administrator.' });
    }
    return next();
  } catch (error) {
    return handleRouteError(res, error, 'chat gate', 'Gagal memeriksa status layanan AIRA.');
  }
});

const ListQuery = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.get('/sessions', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const q = ListQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
  try {
    return res.json(await listSessions(userId, q.data));
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions', 'Gagal memuat daftar sesi.');
  }
});

router.get('/sessions/last', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const s = await lastSession(userId);
    return res.json({ data: s ? publicSession(s) : null });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions/last', 'Gagal memuat sesi terakhir.');
  }
});

router.post('/sessions', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const body = validateBody(z.object({ title: z.string().trim().min(1).max(120).optional() }), req.body ?? {}, res);
  if (!body) return;
  try {
    return res.status(201).json({ data: publicSession(await createSession(userId, body.title)) });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ai/chat/sessions', 'Gagal membuat sesi.');
  }
});

const MessagesQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/sessions/:id/messages', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const q = MessagesQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
  try {
    const id = param(req, 'id');
    const result = await listMessages(userId, id, q.data);
    if (!result) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    if (!q.data.before) await markOpened(userId, id);
    const session = await getOwnedSession(userId, id);
    const lang = requestLanguage(req);
    return res.json({ ...translateFields(result, lang, ['error']), session: session ? publicSession(session) : null });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions/:id/messages', 'Gagal memuat riwayat sesi.');
  }
});

router.get('/sessions/:id/export', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const format = req.query.format === 'json' ? 'json' : 'md';
  try {
    const out = await exportSession(userId, param(req, 'id'), format);
    if (!out) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    res.setHeader('Content-Type', format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(out.body);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/sessions/:id/export', 'Gagal mengekspor sesi.');
  }
});

const PatchSchema = z
  .object({ title: z.string().trim().min(1).max(120).optional(), status: z.enum(['active', 'archived']).optional() })
  .refine((d) => d.title !== undefined || d.status !== undefined, { message: 'Minimal satu field (title atau status) wajib diisi.' });

router.patch('/sessions/:id', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const body = validateBody(PatchSchema, req.body, res);
  if (!body) return;
  try {
    const s = await updateSession(userId, param(req, 'id'), body);
    if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    return res.json({ data: publicSession(s) });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ai/chat/sessions/:id', 'Gagal memperbarui sesi.');
  }
});

router.delete('/sessions/:id', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const id = param(req, 'id');
    const s = await getOwnedSession(userId, id);
    if (!s) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    if (s.inflightTurnId && s.inflightSince && Date.now() - s.inflightSince.getTime() < 60_000) {
      return res.status(409).json({ error: 'turn_in_progress', message: 'Sesi masih memproses pesan. Hentikan dulu sebelum menghapus.' });
    }
    const result = await deleteSession(userId, id, req.ip, req.headers['user-agent']);
    if (!result) return res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    return res.json({ ok: true, id });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ai/chat/sessions/:id', 'Gagal menghapus sesi.');
  }
});

router.get('/attachments/:id', async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const a = await attachmentFor(userId, param(req, 'id'));
    if (!a) return res.status(404).json({ error: 'Lampiran tidak ditemukan.' });
    const bytes = await fs.readFile(getFullPath(a.filePath)).catch(() => null);
    if (!bytes) return res.status(404).json({ error: 'Berkas lampiran tidak ada.' });
    res.setHeader('Content-Type', a.mimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(bytes);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ai/chat/attachments/:id', 'Gagal memuat lampiran.');
  }
});

// POST /stream: satu giliran, SSE
const StreamSchema = z.object({
  input: z.string().default(''),
  session_id: z.string().min(1).max(64).optional(),
  retry_message_id: z.string().min(1).max(64).optional(),
});

function sendError(res: Response, status: number, code: string, message: string): Response {
  return res.status(status).json({ error: code, message });
}

router.post('/stream', upload.single('file'), async (req: AuthRequest, res) => {
  const userId = uid(req);
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const body = validateBody(StreamSchema, req.body ?? {}, res);
  if (!body) return;

  const rate = checkTurnRate(userId, getChatLimits().turnsPerMinute);
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    return sendError(res, 429, 'rate_limited', `Terlalu banyak pesan. Coba lagi dalam ${rate.retryAfterSec} detik.`);
  }

  let prepared;
  try {
    prepared = await prepareTurn({
      userId,
      sessionId: body.session_id,
      input: body.input,
      retryMessageId: body.retry_message_id,
      file: req.file ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype } : undefined,
    });
  } catch (error) {
    if (error instanceof TurnHttpError) return sendError(res, error.status, error.code, error.message);
    return handleRouteError(res, error, 'POST /ai/chat/stream', 'Gagal menyiapkan pesan.');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  const keepAlive = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n');
  }, 15_000);

  const sseLang = requestLanguage(req);
  try {
    await runTurn(
      prepared,
      {
        event: (name, data) => {
          if (res.writableEnded || res.destroyed) return;
          const payload = name === 'error' ? translateFields(data, sseLang, ['message']) : data;
          res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
        },
      },
      controller.signal,
    );
  } finally {
    clearInterval(keepAlive);
    if (!res.writableEnded) res.end();
  }
  return undefined;
});

export default router;
