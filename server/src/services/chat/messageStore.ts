// Persistensi pesan chat. Pesan pengguna disimpan SEBELUM agen dipanggil; teks asisten disimpan
// bertahap (flush) dan difinalkan ok/aborted/error dengan teks parsial tetap tersimpan.

import { Prisma, type ChatMessage } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { ActorSnapshot } from '../../ai/identityBlock';
import type { SavedAttachment } from './attachments';

export type AssistantStatus = 'ok' | 'error' | 'aborted';

/** Sinkronkan penghitung & waktu pesan terakhir sesi dari isi tabel (sumber kebenaran). */
export async function syncSessionCounters(sessionId: string): Promise<void> {
  const [count, last] = await Promise.all([
    prisma.chatMessage.count({ where: { sessionId } }),
    prisma.chatMessage.findFirst({ where: { sessionId }, orderBy: { seq: 'desc' }, select: { createdAt: true } }),
  ]);
  await prisma.chatSession.updateMany({
    where: { id: sessionId },
    data: { messageCount: count, ...(last ? { lastMessageAt: last.createdAt } : {}) },
  });
}

export interface CreateUserMessage {
  sessionId: string;
  turnId: string;
  content: string;
  snapshot: ActorSnapshot;
  attachment?: SavedAttachment;
  /** jawaban kartu konfirmasi yang dibawa pesan ini; disimpan agar "Coba lagi" mengirimnya lagi */
  answer?: { id: string; choice: 'ya' | 'batal' };
}

export async function createUserMessage(input: CreateUserMessage): Promise<ChatMessage> {
  const msg = await prisma.chatMessage.create({
    data: {
      sessionId: input.sessionId,
      turnId: input.turnId,
      role: 'user',
      content: input.content,
      status: 'ok',
      actorSnapshot: input.snapshot as unknown as Prisma.InputJsonValue,
      ...(input.answer ? { parts: { answer: input.answer } as Prisma.InputJsonValue } : {}),
      ...(input.attachment
        ? { attachments: { create: { fileName: input.attachment.fileName, mimeType: input.attachment.mimeType, size: input.attachment.size, filePath: input.attachment.filePath } } }
        : {}),
    },
  });
  await syncSessionCounters(input.sessionId);
  return msg;
}

export async function createAssistantPlaceholder(sessionId: string, turnId: string, model: string): Promise<ChatMessage> {
  const msg = await prisma.chatMessage.create({
    data: { sessionId, turnId, role: 'assistant', content: '', status: 'streaming', model },
  });
  await syncSessionCounters(sessionId);
  return msg;
}

/** Flush teks parsial + perpanjang lease giliran (aktivitas = tanda hidup). */
export async function flushAssistant(messageId: string, sessionId: string, content: string): Promise<void> {
  await prisma.$transaction([
    prisma.chatMessage.update({ where: { id: messageId }, data: { content } }),
    prisma.chatSession.updateMany({ where: { id: sessionId, inflightTurnId: { not: null } }, data: { inflightSince: new Date() } }),
  ]);
}

export interface FinalizeAssistant {
  messageId: string;
  sessionId: string;
  content: string;
  status: AssistantStatus;
  error?: string | null;
  durationMs: number;
  model?: string | null;
  parts?: unknown;
}

export async function finalizeAssistant(f: FinalizeAssistant): Promise<void> {
  await prisma.chatMessage.update({
    where: { id: f.messageId },
    data: {
      content: f.content,
      status: f.status,
      error: f.error ?? null,
      durationMs: Math.max(0, Math.round(f.durationMs)),
      ...(f.model ? { model: f.model } : {}),
      ...(f.parts !== undefined ? { parts: f.parts as Prisma.InputJsonValue } : {}),
    },
  });
  await syncSessionCounters(f.sessionId);
}

/** Pesan pengguna terakhir sesi + (bila ada) asisten setelahnya, untuk logika "Coba lagi". */
export async function lastUserMessage(sessionId: string): Promise<(ChatMessage & { attachments: Array<{ id: string; fileName: string; mimeType: string; size: number; filePath: string }> }) | null> {
  return prisma.chatMessage.findFirst({
    where: { sessionId, role: 'user' },
    orderBy: { seq: 'desc' },
    include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true, filePath: true } } },
  });
}

/** Hapus jawaban gagal/terhenti setelah pesan pengguna (dipakai saat mengulang giliran). */
export async function removeFailedAnswers(sessionId: string, afterSeq: number): Promise<boolean> {
  const after = await prisma.chatMessage.findMany({ where: { sessionId, seq: { gt: afterSeq } }, select: { id: true, role: true, status: true } });
  if (after.some((m) => m.role !== 'assistant' || m.status === 'ok' || m.status === 'streaming')) return false;
  await prisma.chatMessage.deleteMany({ where: { id: { in: after.map((m) => m.id) } } });
  await syncSessionCounters(sessionId);
  return true;
}

export async function setSessionTitle(sessionId: string, title: string): Promise<void> {
  await prisma.chatSession.updateMany({ where: { id: sessionId, titleSource: 'auto', title: null }, data: { title } });
}

export async function updateSnapshot(messageId: string, snapshot: ActorSnapshot): Promise<void> {
  await prisma.chatMessage.update({ where: { id: messageId }, data: { actorSnapshot: snapshot as unknown as Prisma.InputJsonValue } });
}
