// Menjalankan satu giliran chat yang sudah dipersiapkan: susun konteks (identitas → ringkasan →
// jendela), alirkan jawaban engine ke klien (SSE) sambil menyimpannya bertahap, kumpulkan progres
// tool & kartu dari panggilan MCP ber-ref, lalu finalkan ok/aborted/error.

import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { neutralizeUserText } from '../../ai/identityBlock';
import { attachmentContentPart } from './attachments';
import { getChatLimits, getEngineConfig, type EngineConfig } from './config';
import { buildContinuityNote, estimateTokens, toTurnMessages, type ChatLike } from './contextWindow';
import { completeChat, EngineError, streamChat, type ClarifyPrompt, type ContentPart, type UpstreamMessage } from './engineClient';
import { finalizeAssistant, flushAssistant, setSessionTitle } from './messageStore';
import { releaseTurnLease } from './sessionService';
import { planWithSummary } from './summaryService';
import { deriveTitle } from './title';
import { watchTurn } from './toolEvents';
import { signTurnTicket, turnMarkerLine } from './turnTicket';
import type { PreparedTurn } from './turnPrepare';

export interface TurnSink {
  event: (name: string, data: Record<string, unknown>) => void;
}

const ERROR_TEXT: Record<string, string> = {
  engine_not_configured: 'Engine AIRA belum dikonfigurasi. Hubungi administrator.',
};

async function loadSummaryUpToSeq(summaryUpToMessageId: string | null): Promise<number> {
  if (!summaryUpToMessageId) return 0;
  const m = await prisma.chatMessage.findUnique({ where: { id: summaryUpToMessageId }, select: { seq: true } });
  return m?.seq ?? 0;
}

export interface UpstreamBuild {
  messages: UpstreamMessage[];
  truncated: boolean;
  hasSummary: boolean;
}

/** Susun `messages` upstream. Pesan `system` PERTAMA = blok identitas; konten dari browser tidak pernah dipercaya. */
export async function buildUpstream(turn: PreparedTurn, cfg: EngineConfig, signal?: AbortSignal): Promise<UpstreamBuild> {
  const limits = getChatLimits();
  const session = turn.session;
  const upToSeq = await loadSummaryUpToSeq(session.summaryUpToMessageId);
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId: session.id, seq: { gt: upToSeq } },
    orderBy: { seq: 'asc' },
    select: { id: true, seq: true, role: true, content: true, status: true },
  });
  const identityTokens = estimateTokens(turn.identity.text) + 250;
  const plan = await planWithSummary(
    {
      sessionId: session.id,
      messages: rows as ChatLike[],
      summary: session.summary,
      summaryUpToSeq: upToSeq,
      softBudget: Math.max(100, limits.windowTokens - identityTokens),
      hardBudget: Math.max(200, limits.hardWindowTokens - identityTokens),
    },
    {
      complete: (messages) =>
        completeChat({ messages: messages.map((m) => ({ role: m.role, content: m.content })), user: turn.identity.facts.userId, signal }, cfg),
      persist: async (summary, upToMessageId) => {
        await prisma.chatSession.update({ where: { id: session.id }, data: { summary, summaryUpToMessageId: upToMessageId } });
      },
    },
  );

  const turns = toTurnMessages(plan.window).map((m) => ({
    role: m.role,
    content: neutralizeUserText(m.content),
  }));
  const last = turns[turns.length - 1];
  const parts: ContentPart[] = [];
  const ticket = cfg.turnSecret ? signTurnTicket(cfg.turnSecret, turn.identity.facts.userId, turn.ref) : null;
  const marker = ticket && cfg.turnInMessage ? `${turnMarkerLine(ticket)}\n` : '';
  const currentText = last && last.role === 'user' ? last.content : neutralizeUserText(turn.userText);
  if (turn.attachment) parts.push(await attachmentContentPart(turn.attachment, cfg));

  const history: UpstreamMessage[] = turns.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  const currentContent: string | ContentPart[] =
    parts.length > 0
      ? [{ type: 'text', text: `${marker}${currentText}` }, ...parts]
      : `${marker}${currentText}`;

  const messages: UpstreamMessage[] = [
    { role: 'system', content: turn.identity.text },
    { role: 'system', content: buildContinuityNote({ summary: plan.summary, truncated: plan.truncated }) },
    ...history,
    { role: 'user', content: currentContent },
  ];
  return { messages, truncated: plan.truncated, hasSummary: !!plan.summary };
}

/** Header/metadata penanda aktor untuk engine (hook sisi engine menandatangani assertion dari sini). */
export function actorEnvelope(turn: PreparedTurn, cfg: EngineConfig): { headers: Record<string, string>; metadata: Record<string, unknown> } {
  const uid = turn.identity.facts.userId;
  const ticket = cfg.turnSecret ? signTurnTicket(cfg.turnSecret, uid, turn.ref) : null;
  return {
    headers: {
      'x-entaris-uid': uid,
      'x-entaris-channel': 'panel',
      'x-entaris-ref': turn.ref,
      ...(ticket ? { 'x-entaris-turn': ticket } : {}),
    },
    metadata: { uid, ch: 'panel', ref: turn.ref, ...(ticket ? { turn: ticket } : {}) },
  };
}

function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof EngineError) return { code: err.code, message: ERROR_TEXT[err.code] ?? err.message };
  logger.error({ err }, 'Giliran chat gagal tak terduga');
  return { code: 'internal_error', message: 'Terjadi kesalahan saat memproses pesan. Coba lagi.' };
}

/**
 * Jalankan giliran. Tidak pernah melempar; hasil akhir tersimpan di DB. `signal` = klien memutus/stop
 * → upstream dibatalkan dan pesan asisten ditandai 'aborted' dengan teks parsial dipertahankan.
 */
export async function runTurn(turn: PreparedTurn, sink: TurnSink, signal: AbortSignal): Promise<void> {
  const cfg = getEngineConfig();
  const limits = getChatLimits();
  const started = Date.now();
  const messageId = turn.assistantMessage.id;
  const sessionId = turn.session.id;
  let buffer = '';
  let model: string | null = null;
  let flushChain: Promise<void> = Promise.resolve();
  let lastFlush = Date.now();
  const flush = (): void => {
    const snapshot = buffer;
    lastFlush = Date.now();
    flushChain = flushChain.then(() => flushAssistant(messageId, sessionId, snapshot)).catch((err) => logger.warn({ err, sessionId }, 'Flush teks asisten gagal'));
  };

  sink.event('session', { session_id: sessionId, title: turn.session.title });
  sink.event('turn', { turn_id: turn.turnId, message_id: messageId, user_message_id: turn.userMessage.id });
  const watcher = watchTurn(turn.ref, {
    tool: (ev) => sink.event('tool', { ...ev }),
    card: (card) => sink.event('card', { ...card }),
  });

  let clarify: ClarifyPrompt | null = null;
  let status: 'ok' | 'error' | 'aborted' = 'ok';
  let errorInfo: { code: string; message: string } | null = null;
  try {
    const upstream = await buildUpstream(turn, cfg, signal);
    const env = actorEnvelope(turn, cfg);
    const stream = streamChat({ messages: upstream.messages, user: turn.identity.facts.userId, metadata: env.metadata, headers: env.headers, signal }, cfg);
    for await (const ev of stream) {
      if (ev.type === 'delta') {
        buffer += ev.text;
        sink.event('delta', { text: ev.text });
        if (Date.now() - lastFlush >= limits.flushMs) flush();
      } else if (ev.type === 'clarify') {
        clarify = ev.prompt;
        sink.event('clarify', { ...ev.prompt });
      } else if (ev.model) {
        model = ev.model;
      }
    }
    if (!buffer.trim()) {
      status = 'error';
      errorInfo = { code: 'empty_answer', message: 'Engine AIRA tidak mengirim jawaban. Coba lagi.' };
    }
  } catch (err) {
    if (signal.aborted || (err instanceof EngineError && err.code === 'aborted')) {
      status = 'aborted';
    } else {
      status = 'error';
      errorInfo = describeError(err);
    }
  }

  await flushChain;
  await watcher.stop().catch((err) => logger.warn({ err }, 'Penutupan pemantau tool gagal'));
  const duration = Date.now() - started;
  const parts = { tools: watcher.calls(), cards: watcher.cards(), ...(clarify && status === 'ok' ? { clarify } : {}) };
  try {
    await finalizeAssistant({ messageId, sessionId, content: buffer, status, error: errorInfo?.message ?? null, durationMs: duration, model, parts });
    if (status === 'ok') await maybeTitle(turn, sink);
  } catch (err) {
    logger.error({ err, sessionId }, 'Finalisasi pesan asisten gagal');
  } finally {
    await releaseTurnLease(sessionId, turn.turnId).catch(() => undefined);
  }

  if (status === 'error' && errorInfo) sink.event('error', { message: errorInfo.message, code: errorInfo.code, message_id: messageId });
  else if (status === 'ok') sink.event('done', { message_id: messageId, duration_ms: duration });
  logger.info({ sessionId, turnId: turn.turnId, status, durationMs: duration, outChars: buffer.length }, 'Giliran chat selesai');
}

/** Judul otomatis setelah pertukaran pertama selesai (heuristik dari pesan pertama pengguna). */
async function maybeTitle(turn: PreparedTurn, sink: TurnSink): Promise<void> {
  if (turn.session.title || turn.session.titleSource !== 'auto') return;
  const first = await prisma.chatMessage.findFirst({ where: { sessionId: turn.session.id, role: 'user' }, orderBy: { seq: 'asc' }, select: { content: true } });
  if (!first) return;
  const title = deriveTitle(first.content);
  await setSessionTitle(turn.session.id, title);
  sink.event('title', { title });
}
