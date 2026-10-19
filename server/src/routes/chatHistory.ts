// Riwayat chat untuk tool MCP `chat_cari_riwayat` / `chat_ambil_sesi` (memori panggilan ulang agen).
// Dipanggil lewat loopback dengan JWT aktor, jadi SELALU dibatasi sesi MILIK aktor (userId dari JWT).
// Tanpa izin modul: semua user login (mirip pengajuan pembayaran milik sendiri). Hanya baca.

import { Router } from 'express';
import { z } from 'zod';
import { type AuthRequest } from '../middleware/auth';
import { handleRouteError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import { getOwnedSession, searchOwnMessages } from '../services/chat/sessionService';

const router = Router();

const SearchQuery = z.object({
  q: z.string().trim().min(2, 'Kata kunci minimal 2 karakter.').max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

router.get('/search', async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const q = SearchQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
  try {
    const hits = await searchOwnMessages(userId, q.data.q, q.data.limit);
    return res.json({
      data: hits.map((h) => ({
        sessionId: h.sessionId,
        sessionTitle: h.sessionTitle,
        messageId: h.messageId,
        role: h.role,
        date: h.date,
        snippet: h.snippet,
      })),
      total: hits.length,
      hint: hits.length ? 'Gunakan chat_ambil_sesi(sessionId) untuk membaca percakapan lengkapnya.' : 'Tidak ada percakapan Anda yang cocok.',
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /chat-history/search', 'Gagal mencari riwayat percakapan.');
  }
});

const SessionQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const MAX_CONTENT_CHARS = 4_000;

router.get('/sessions/:id', async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'unauthenticated' });
  const q = SessionQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.issues[0].message });
  try {
    const session = await getOwnedSession(userId, String(req.params.id ?? ''));
    if (!session) return res.status(404).json({ error: 'Sesi tidak ditemukan atau bukan milik Anda.' });
    const where = { sessionId: session.id, role: { in: ['user', 'assistant'] } };
    const [total, rows] = await Promise.all([
      prisma.chatMessage.count({ where }),
      prisma.chatMessage.findMany({
        where,
        orderBy: { seq: 'asc' },
        skip: (q.data.page - 1) * q.data.limit,
        take: q.data.limit,
        select: { id: true, role: true, content: true, status: true, createdAt: true },
      }),
    ]);
    return res.json({
      session: { id: session.id, title: session.title, status: session.status, createdAt: session.createdAt, lastMessageAt: session.lastMessageAt },
      data: rows.map((m) => ({
        id: m.id,
        role: m.role,
        status: m.status,
        date: m.createdAt,
        content: m.content.length > MAX_CONTENT_CHARS ? `${m.content.slice(0, MAX_CONTENT_CHARS)}…` : m.content,
      })),
      total,
      page: q.data.page,
      limit: q.data.limit,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /chat-history/sessions/:id', 'Gagal membaca sesi percakapan.');
  }
});

export default router;
