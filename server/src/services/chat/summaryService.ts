// Peringkasan bergulir inkremental. Pesan lama yang tak muat di jendela diringkas oleh satu panggilan
// agen non-streaming dan hasilnya disimpan (summaryUpToMessageId). Tidak pernah membuang isi diam-diam:
// bila peringkasan gagal, pesan mentah tetap dikirim sampai batas keras dan dicoba lagi pada giliran
// berikutnya (kegagalan dicatat sekali per sesi).

import { logger } from '../../lib/logger';
import {
  buildSummaryMessages,
  planContext,
  planWithHardLimit,
  selectSummaryChunk,
  type ChatLike,
  type PlannedContext,
  type SummaryRequestMessage,
} from './contextWindow';

const SUMMARY_CHUNK_CHARS = 24_000;
const MAX_ROUNDS = 4;

export interface SummaryDeps {
  /** panggilan agen non-streaming: messages → teks ringkasan */
  complete: (messages: SummaryRequestMessage[]) => Promise<string>;
  /** simpan ringkasan baru + pesan terakhir yang tercakup */
  persist: (summary: string, upToMessageId: string) => Promise<void>;
}

export interface SummaryInput {
  sessionId: string;
  messages: ReadonlyArray<ChatLike>;
  summary: string | null;
  summaryUpToSeq: number;
  softBudget: number;
  hardBudget: number;
}

const failedOnce = new Set<string>();

/** Hanya untuk tes. */
export function resetSummaryFailureLog(): void {
  failedOnce.clear();
}

export async function planWithSummary(input: SummaryInput, deps: SummaryDeps): Promise<PlannedContext> {
  let summary = input.summary;
  let upTo = input.summaryUpToSeq;
  let plan = planContext(input.messages, summary, upTo, input.softBudget);

  for (let round = 0; plan.needsSummary.length > 0 && round < MAX_ROUNDS; round++) {
    const chunk = selectSummaryChunk(plan.needsSummary, SUMMARY_CHUNK_CHARS);
    const last = chunk[chunk.length - 1];
    try {
      const text = await deps.complete(buildSummaryMessages(summary, chunk));
      await deps.persist(text, last.id);
      summary = text;
      upTo = last.seq;
      failedOnce.delete(input.sessionId);
    } catch (err) {
      if (!failedOnce.has(input.sessionId)) {
        failedOnce.add(input.sessionId);
        logger.warn({ sessionId: input.sessionId, code: (err as { code?: string })?.code }, 'Peringkasan sesi chat gagal; pesan mentah dipertahankan, dicoba lagi pada giliran berikutnya');
      }
      return planWithHardLimit(input.messages, summary, upTo, input.hardBudget);
    }
    plan = planContext(input.messages, summary, upTo, input.softBudget);
  }
  // Masih ada sisa setelah MAX_ROUNDS: lanjut dengan batas keras (sisa diringkas pada giliran berikutnya).
  return plan.needsSummary.length > 0 ? planWithHardLimit(input.messages, summary, upTo, input.hardBudget) : plan;
}
