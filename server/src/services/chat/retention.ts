// Retensi chat: default MATI (sesi disimpan selamanya). Bila AIRA_CHAT_RETENTION_DAYS diisi, job
// harian hanya menghapus sesi ARSIP yang pesan terakhirnya lebih lama dari batas. Sesi aktif tidak
// pernah disentuh; penghapusan oleh pengguna tetap satu-satunya jalur lain (diaudit).

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getRetentionDays } from './config';
import { deleteSession } from './sessionService';

export interface RetentionResult {
  enabled: boolean;
  deleted: number;
}

const BATCH = 200;

export async function purgeArchivedChatSessions(days: number | undefined = getRetentionDays(), now: Date = new Date()): Promise<RetentionResult> {
  if (days === undefined) return { enabled: false, deleted: 0 };
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const old = await prisma.chatSession.findMany({
    where: { status: 'archived', lastMessageAt: { lt: cutoff }, inflightTurnId: null },
    select: { id: true, userId: true },
    take: BATCH,
  });
  let deleted = 0;
  for (const s of old) {
    try {
      if (await deleteSession(s.userId, s.id, undefined, 'retention-job', 'retention')) deleted += 1;
    } catch (err) {
      logger.error({ err, sessionId: s.id }, 'Retensi chat: gagal menghapus sesi');
    }
  }
  return { enabled: true, deleted };
}
