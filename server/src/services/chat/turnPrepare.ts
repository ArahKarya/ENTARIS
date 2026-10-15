// Tahap persiapan satu giliran chat — SEMUA yang bisa menolak permintaan dengan JSON (sebelum SSE):
// validasi, identitas (Akses AIRA), kepemilikan sesi, lease satu-giliran, penyimpanan lampiran, dan
// penyimpanan pesan pengguna (durabilitas: tersimpan sebelum agen dipanggil).

import { randomUUID } from 'node:crypto';
import { claimConfirmCard, storedAnswer, type ConfirmChoice } from './confirmCard';
import type { ChatMessage, ChatSession } from '@prisma/client';
import { logger } from '../../lib/logger';
import { buildIdentityBlock, IdentityError, type BuiltIdentityBlock } from '../../ai/identityBlock';
import { deleteAttachment } from '../../utils/fileStorage';
import { ChatInputError, saveChatFile, type IncomingFile, type SavedAttachment } from './attachments';
import { getChatLimits, getEngineConfig } from './config';
import { createAssistantPlaceholder, createUserMessage, lastUserMessage, removeFailedAnswers, updateSnapshot } from './messageStore';
import { acquireTurnLease, createSession, getOwnedSession, reconcileStale, releaseTurnLease } from './sessionService';

export class TurnHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TurnHttpError';
  }
}

export interface TurnParams {
  userId: string;
  sessionId?: string;
  input: string;
  file?: IncomingFile;
  /** ulangi giliran terakhir (pesan pengguna dengan id ini) tanpa menggandakan pesan */
  retryMessageId?: string;
  /** jawaban atas kartu konfirmasi AIRA di sesi ini */
  confirm?: { id: string; choice: ConfirmChoice };
}

export interface PreparedTurn {
  session: ChatSession;
  /** true bila sesi baru dibuat oleh giliran ini */
  sessionCreated: boolean;
  turnId: string;
  ref: string;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  /** teks pengguna asli (sebagaimana diketik) untuk giliran ini */
  userText: string;
  identity: BuiltIdentityBlock;
  attachment?: SavedAttachment;
  confirm?: { id: string; choice: ConfirmChoice };
}

const ATTACHMENT_ONLY_PREFIX = 'Lampiran: ';

async function loadRetry(session: ChatSession, messageId: string) {
  const last = await lastUserMessage(session.id);
  if (!last || last.id !== messageId) throw new TurnHttpError(409, 'retry_not_last', 'Hanya pesan terakhir yang dapat diulang.');
  const cleaned = await removeFailedAnswers(session.id, last.seq);
  if (!cleaned) throw new TurnHttpError(409, 'retry_not_needed', 'Pesan ini sudah mendapat jawaban.');
  return last;
}

export async function prepareTurn(p: TurnParams): Promise<PreparedTurn> {
  const limits = getChatLimits();
  const text = p.input.trim();
  if (p.retryMessageId && !p.sessionId) throw new TurnHttpError(400, 'retry_needs_session', 'Sesi wajib diisi untuk mengulang pesan.');
  if (!text && !p.file && !p.retryMessageId) throw new TurnHttpError(400, 'empty_input', 'Pesan tidak boleh kosong.');
  if (text.length > limits.maxInputChars) {
    throw new TurnHttpError(400, 'input_too_long', `Pesan terlalu panjang (maksimal ${limits.maxInputChars.toLocaleString('id-ID')} karakter).`);
  }

  let identity: BuiltIdentityBlock;
  try {
    identity = await buildIdentityBlock(p.userId);
  } catch (err) {
    if (err instanceof IdentityError) throw new TurnHttpError(403, err.code, err.message);
    throw err;
  }

  let saved: SavedAttachment | undefined;
  if (p.file) {
    try {
      saved = await saveChatFile(p.file, getEngineConfig());
    } catch (err) {
      if (err instanceof ChatInputError) throw new TurnHttpError(err.status, err.code, err.message);
      throw err;
    }
  }
  const dropFile = async (): Promise<void> => {
    if (saved) await deleteAttachment(saved.filePath).catch(() => undefined);
  };

  let session: ChatSession | null = null;
  let sessionCreated = false;
  const turnId = randomUUID();
  let leased = false;
  try {
    if (p.sessionId) {
      session = await getOwnedSession(p.userId, p.sessionId);
      if (!session) throw new TurnHttpError(404, 'session_not_found', 'Sesi tidak ditemukan.');
      if (session.status === 'archived') throw new TurnHttpError(409, 'session_archived', 'Sesi ini diarsipkan. Pulihkan dari Arsip untuk melanjutkan.');
      await reconcileStale(session);
    } else {
      session = await createSession(p.userId);
      sessionCreated = true;
    }

    leased = await acquireTurnLease(session.id, p.userId, turnId);
    if (!leased) throw new TurnHttpError(409, 'turn_in_progress', 'Sesi ini masih memproses pesan sebelumnya (mungkin dari tab atau perangkat lain). Tunggu sampai selesai.');
    if (p.confirm && (p.retryMessageId || !(await claimConfirmCard(session.id, p.confirm.id, p.confirm.choice)))) {
      throw new TurnHttpError(409, 'confirm_invalid', 'Kartu konfirmasi ini sudah tidak berlaku. Minta AIRA mengulang permintaannya.');
    }

    let userMessage: ChatMessage;
    let userText: string;
    let attachment = saved;
    let confirm = p.confirm;
    if (p.retryMessageId) {
      const message = await loadRetry(session, p.retryMessageId);
      userMessage = message;
      userText = message.content.startsWith(ATTACHMENT_ONLY_PREFIX) && message.attachments.length ? '' : message.content;
      const a = message.attachments[0];
      attachment = a ? { fileName: a.fileName, mimeType: a.mimeType, size: a.size, filePath: a.filePath } : undefined;
      await updateSnapshot(message.id, identity.snapshot);
      // Mengulang jawaban kartu: pilihan yang sama dikirim lagi. Kartu di sini sudah tertandai dijawab;
      // engine yang memastikan aksinya tidak berjalan dua kali.
      confirm = storedAnswer(message.parts) ?? undefined;
    } else {
      userText = text;
      userMessage = await createUserMessage({
        sessionId: session.id,
        turnId,
        content: text || `${ATTACHMENT_ONLY_PREFIX}${saved?.fileName ?? 'berkas'}`,
        snapshot: identity.snapshot,
        attachment: saved,
        ...(p.confirm ? { answer: p.confirm } : {}),
      });
    }
    const assistantMessage = await createAssistantPlaceholder(session.id, turnId, getEngineConfig().model);
    const fresh = (await getOwnedSession(p.userId, session.id)) ?? session;
    return {
      session: fresh, sessionCreated, turnId, ref: `${session.id}:${turnId}`, userMessage, assistantMessage, userText, identity, attachment,
      ...(confirm ? { confirm } : {}),
    };
  } catch (err) {
    if (leased && session) await releaseTurnLease(session.id, turnId).catch(() => undefined);
    if (!(err instanceof TurnHttpError)) logger.error({ err, userId: p.userId }, 'Persiapan giliran chat gagal');
    // Berkas yang baru saja disimpan untuk giliran yang gagal tidak boleh yatim.
    if (!p.retryMessageId) await dropFile();
    throw err;
  }
}
