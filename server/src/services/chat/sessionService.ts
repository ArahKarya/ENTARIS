// Akses data sesi/pesan panel chat. SETIAP fungsi menerima userId pemilik dan menegakkan
// kepemilikan di query (bukan di pemanggil): sesi milik orang lain = tidak ditemukan.

import { Prisma, type ChatMessage, type ChatSession } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { deleteAttachment } from '../../utils/fileStorage';
import { makeSnippet } from './snippet';

export type SessionStatus = 'active' | 'archived';

export interface SessionListQuery {
  q?: string;
  status?: SessionStatus;
  page: number;
  limit: number;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function publicSession(s: ChatSession) {
  return {
    id: s.id,
    title: s.title,
    titleSource: s.titleSource,
    status: s.status,
    messageCount: s.messageCount,
    lastMessageAt: s.lastMessageAt,
    lastOpenedAt: s.lastOpenedAt,
    createdAt: s.createdAt,
    busy: isLeaseLive(s),
  };
}

const escapeLike = (q: string): string => q.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Lease giliran: satu giliran berjalan per sesi; kedaluwarsa agar crash tak mengunci selamanya. */
export const TURN_LEASE_MS = 16 * 60 * 1000;

export function isLeaseLive(s: Pick<ChatSession, 'inflightTurnId' | 'inflightSince'>, now: Date = new Date()): boolean {
  return !!s.inflightTurnId && !!s.inflightSince && now.getTime() - s.inflightSince.getTime() < TURN_LEASE_MS;
}

export async function getOwnedSession(userId: string, id: string): Promise<ChatSession | null> {
  return prisma.chatSession.findFirst({ where: { id, userId } });
}

export async function createSession(userId: string, title?: string | null): Promise<ChatSession> {
  const clean = title?.trim();
  return prisma.chatSession.create({
    data: { userId, title: clean || null, titleSource: clean ? 'user' : 'auto', lastOpenedAt: new Date() },
  });
}

/** Id sesi milik userId yang isinya cocok dengan q (FTS 'simple' + substring). */
export async function matchingSessionIds(userId: string, q: string, limit = 200): Promise<string[]> {
  const like = `%${escapeLike(q)}%`;
  const rows = await prisma.$queryRaw<Array<{ session_id: string }>>(Prisma.sql`
    SELECT DISTINCT m.session_id
    FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE s.user_id = ${userId}
      AND m.role IN ('user', 'assistant')
      AND (to_tsvector('simple', m.content) @@ plainto_tsquery('simple', ${q}) OR m.content ILIKE ${like})
    LIMIT ${limit}`);
  return rows.map((r) => r.session_id);
}

export async function listSessions(userId: string, query: SessionListQuery): Promise<Paged<ReturnType<typeof publicSession>>> {
  const q = query.q?.trim();
  const where: Prisma.ChatSessionWhereInput = { userId, status: query.status ?? 'active' };
  if (q) {
    const ids = await matchingSessionIds(userId, q);
    where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { id: { in: ids } }];
  }
  const [total, rows] = await Promise.all([
    prisma.chatSession.count({ where }),
    prisma.chatSession.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { data: rows.map(publicSession), total, page: query.page, limit: query.limit };
}

/** Sesi aktif yang terakhir dibuka (lintas perangkat); jatuh ke yang terakhir ada pesan. */
export async function lastSession(userId: string): Promise<ChatSession | null> {
  const opened = await prisma.chatSession.findFirst({
    where: { userId, status: 'active', lastOpenedAt: { not: null } },
    orderBy: { lastOpenedAt: 'desc' },
  });
  if (opened) return opened;
  return prisma.chatSession.findFirst({ where: { userId, status: 'active' }, orderBy: { lastMessageAt: 'desc' } });
}

export async function markOpened(userId: string, id: string): Promise<void> {
  await prisma.chatSession.updateMany({ where: { id, userId }, data: { lastOpenedAt: new Date() } });
}

export async function updateSession(
  userId: string,
  id: string,
  patch: { title?: string; status?: SessionStatus },
): Promise<ChatSession | null> {
  const data: Prisma.ChatSessionUpdateManyMutationInput = {};
  if (patch.title !== undefined) {
    data.title = patch.title.trim();
    data.titleSource = 'user';
  }
  if (patch.status !== undefined) data.status = patch.status;
  const res = await prisma.chatSession.updateMany({ where: { id, userId }, data });
  if (res.count === 0) return null;
  return getOwnedSession(userId, id);
}

export interface MessageQuery {
  /** muat pesan lebih lama dari seq ini */
  before?: number;
  limit: number;
}

export interface PublicMessage {
  id: string;
  seq: number;
  turnId: string;
  role: string;
  content: string;
  status: string;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  parts: unknown;
  attachments: Array<{ id: string; fileName: string; mimeType: string; size: number }>;
}

type MessageWithAttachments = ChatMessage & { attachments: Array<{ id: string; fileName: string; mimeType: string; size: number }> };

export function publicMessage(m: MessageWithAttachments): PublicMessage {
  return {
    id: m.id,
    seq: m.seq,
    turnId: m.turnId,
    role: m.role,
    content: m.content,
    status: m.status,
    error: m.error,
    durationMs: m.durationMs,
    createdAt: m.createdAt,
    parts: m.parts,
    // actorSnapshot (forensik) dan blok identitas sengaja TIDAK pernah dikembalikan ke klien.
    attachments: m.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size })),
  };
}

/** Pesan terbaru dulu dipilih lalu dibalik: hasil urut naik; `hasMore` bila ada yang lebih lama. */
export async function listMessages(userId: string, sessionId: string, q: MessageQuery): Promise<{ data: PublicMessage[]; hasMore: boolean } | null> {
  const owned = await getOwnedSession(userId, sessionId);
  if (!owned) return null;
  await reconcileStale(owned);
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, ...(q.before ? { seq: { lt: q.before } } : {}) },
    orderBy: { seq: 'desc' },
    take: q.limit + 1,
    include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
  });
  const hasMore = rows.length > q.limit;
  return { data: rows.slice(0, q.limit).reverse().map(publicMessage), hasMore };
}

/** Giliran yang terputus (proses mati/timeout lease) tidak boleh tampak "mengetik" selamanya. */
export async function reconcileStale(session: ChatSession): Promise<void> {
  if (isLeaseLive(session)) return;
  const res = await prisma.chatMessage.updateMany({
    where: { sessionId: session.id, status: 'streaming' },
    data: { status: 'error', error: 'Giliran terputus sebelum selesai. Teks yang sudah diterima tetap tersimpan; coba lagi.' },
  });
  if (res.count > 0 || session.inflightTurnId) {
    await prisma.chatSession.updateMany({ where: { id: session.id, inflightTurnId: { not: null } }, data: { inflightTurnId: null, inflightSince: null } });
  }
}

/**
 * Stop untuk giliran yang tidak hidup di proses ini (server restart / proses lain): lepas lease dan
 * tandai pesan `streaming` sebagai dihentikan, teks parsial tetap. True bila ada yang dibersihkan.
 */
export async function abandonOrphanTurn(session: ChatSession, turnId?: string): Promise<boolean> {
  if (!session.inflightTurnId) return false;
  if (turnId && session.inflightTurnId !== turnId) return false;
  await prisma.chatMessage.updateMany({ where: { sessionId: session.id, status: 'streaming' }, data: { status: 'aborted' } });
  await prisma.chatSession.updateMany({
    where: { id: session.id, inflightTurnId: session.inflightTurnId },
    data: { inflightTurnId: null, inflightSince: null },
  });
  return true;
}

/** Ambil lease giliran secara atomik; false bila giliran lain masih berjalan. */
export async function acquireTurnLease(sessionId: string, userId: string, turnId: string, now: Date = new Date()): Promise<boolean> {
  const expired = new Date(now.getTime() - TURN_LEASE_MS);
  const res = await prisma.chatSession.updateMany({
    where: { id: sessionId, userId, OR: [{ inflightTurnId: null }, { inflightSince: null }, { inflightSince: { lt: expired } }] },
    data: { inflightTurnId: turnId, inflightSince: now },
  });
  return res.count === 1;
}

export async function releaseTurnLease(sessionId: string, turnId: string): Promise<void> {
  await prisma.chatSession.updateMany({ where: { id: sessionId, inflightTurnId: turnId }, data: { inflightTurnId: null, inflightSince: null } });
}

export interface DeleteResult {
  messageCount: number;
  title: string | null;
  files: number;
}

/** Hapus sesi milik sendiri + berkas lampirannya; jejak audit dicatat. null = tidak ditemukan. */
export async function deleteSession(
  userId: string,
  id: string,
  ip?: string,
  userAgent?: string,
  reason: 'user' | 'retention' = 'user',
): Promise<DeleteResult | null> {
  const s = await getOwnedSession(userId, id);
  if (!s) return null;
  const files = await prisma.chatAttachment.findMany({ where: { message: { sessionId: id } }, select: { filePath: true } });
  await prisma.chatSession.deleteMany({ where: { id, userId } });
  for (const f of files) {
    await deleteAttachment(f.filePath).catch((err) => logger.warn({ err, sessionId: id }, 'Berkas lampiran chat gagal dihapus'));
  }
  await prisma.auditLog
    .create({
      data: {
        userId,
        action: 'DELETE',
        entityType: 'chat_session',
        entityId: id,
        oldValues: { title: s.title, messageCount: s.messageCount, status: s.status, files: files.length },
        newValues: { deleted: true, reason },
        ipAddress: ip,
        userAgent,
      },
    })
    .catch((err) => logger.error({ err }, 'Audit hapus sesi chat gagal ditulis'));
  return { messageCount: s.messageCount, title: s.title, files: files.length };
}

export interface SearchHit {
  sessionId: string;
  sessionTitle: string | null;
  messageId: string;
  role: string;
  date: Date;
  snippet: string;
}

/** Pencarian teks penuh atas pesan milik userId (FTS 'simple' + substring; urut relevansi lalu terbaru). */
export async function searchOwnMessages(userId: string, q: string, limit: number): Promise<SearchHit[]> {
  const like = `%${escapeLike(q)}%`;
  const rows = await prisma.$queryRaw<
    Array<{ id: string; session_id: string; title: string | null; role: string; created_at: Date; content: string }>
  >(Prisma.sql`
    SELECT m.id, m.session_id, s.title, m.role, m.created_at, m.content
    FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE s.user_id = ${userId}
      AND m.role IN ('user', 'assistant')
      AND (to_tsvector('simple', m.content) @@ plainto_tsquery('simple', ${q}) OR m.content ILIKE ${like})
    ORDER BY ts_rank(to_tsvector('simple', m.content), plainto_tsquery('simple', ${q})) DESC, m.created_at DESC
    LIMIT ${limit}`);
  return rows.map((r) => ({
    sessionId: r.session_id,
    sessionTitle: r.title,
    messageId: r.id,
    role: r.role,
    date: r.created_at,
    snippet: makeSnippet(r.content, q),
  }));
}

export async function attachmentFor(userId: string, attachmentId: string): Promise<{ filePath: string; fileName: string; mimeType: string } | null> {
  const a = await prisma.chatAttachment.findFirst({
    where: { id: attachmentId, message: { session: { userId } } },
    select: { filePath: true, fileName: true, mimeType: true },
  });
  return a;
}
