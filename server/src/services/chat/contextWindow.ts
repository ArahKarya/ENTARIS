// Penyusun jendela konteks panel chat (murni, deterministik, tanpa DB/jaringan).
//
// Engine AIRA tidak menyimpan state yang dibutuhkan untuk melanjutkan: tiap giliran Entaris
// mengirim (a) ringkasan bergulir giliran lama, (b) pesan terbaru yang muat dalam anggaran token
// (≈ karakter / 4, terbaru dulu). Pesan lama TIDAK pernah dibuang diam-diam: bila belum tercakup
// ringkasan dan tidak muat, pemanggil meringkasnya; bila peringkasan gagal pesan mentah tetap
// dikirim sampai batas keras, dan baru terakhir dipotong dengan catatan yang terlihat.

export interface ChatLike {
  id: string;
  seq: number;
  role: string;
  content: string;
  status: string;
}

export interface ChatTurnMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MESSAGE_OVERHEAD_TOKENS = 4;

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
const cost = (m: Pick<ChatLike, 'content'>): number => estimateTokens(m.content) + MESSAGE_OVERHEAD_TOKENS;

/** Pesan yang layak menjadi konteks: user/assistant berisi teks, bukan placeholder streaming. */
export function eligibleMessages(messages: ReadonlyArray<ChatLike>, afterSeq: number): ChatLike[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.status !== 'streaming' && m.seq > afterSeq && m.content.trim() !== '')
    .sort((a, b) => a.seq - b.seq);
}

export interface WindowPlan {
  /** Pesan yang dikirim ke engine (urut naik); selalu memuat pesan terakhir. */
  window: ChatLike[];
  /** Pesan lebih lama dari jendela yang belum tercakup ringkasan (urut naik). */
  older: ChatLike[];
}

/**
 * @param messages        semua pesan setelah titik ringkasan atau lebih (urutan bebas)
 * @param summaryUpToSeq  seq pesan terakhir yang sudah tercakup ringkasan (0 = belum ada)
 * @param budgetTokens    anggaran untuk pesan jendela (sudah dikurangi ruang ringkasan)
 */
export function planWindow(messages: ReadonlyArray<ChatLike>, summaryUpToSeq: number, budgetTokens: number): WindowPlan {
  const eligible = eligibleMessages(messages, summaryUpToSeq);
  const picked: ChatLike[] = [];
  let used = 0;
  for (let i = eligible.length - 1; i >= 0; i--) {
    const c = cost(eligible[i]);
    // Pesan terakhir (permintaan saat ini) selalu ikut, berapa pun ukurannya.
    if (picked.length > 0 && used + c > budgetTokens) break;
    picked.push(eligible[i]);
    used += c;
  }
  picked.reverse();
  const firstSeq = picked[0]?.seq ?? Number.POSITIVE_INFINITY;
  return { window: picked, older: eligible.filter((m) => m.seq < firstSeq) };
}

/** Awalan prefiks terpanjang dari `older` yang jumlah karakternya ≤ maxChars (minimal satu pesan). */
export function selectSummaryChunk(older: ReadonlyArray<ChatLike>, maxChars: number): ChatLike[] {
  const out: ChatLike[] = [];
  let chars = 0;
  for (const m of older) {
    if (out.length > 0 && chars + m.content.length > maxChars) break;
    out.push(m);
    chars += m.content.length;
  }
  return out;
}

export interface SummaryRequestMessage {
  role: 'system' | 'user';
  content: string;
}

const SUMMARY_MAX_CHARS_PER_MESSAGE = 4_000;

/** Prompt peringkasan inkremental: ringkasan lama + potongan pesan baru → ringkasan terbarui. */
export function buildSummaryMessages(previous: string | null, chunk: ReadonlyArray<ChatLike>): SummaryRequestMessage[] {
  const transcript = chunk
    .map((m) => `${m.role === 'user' ? 'Pengguna' : 'AIRA'}: ${m.content.slice(0, SUMMARY_MAX_CHARS_PER_MESSAGE)}`)
    .join('\n\n');
  return [
    {
      role: 'system',
      content:
        'Anda meringkas percakapan antara pengguna dan asisten ERP (AIRA) untuk dipakai sebagai memori kerja. Tulis ringkasan Bahasa Indonesia, padat (maksimal 250 kata), berupa poin-poin. ' +
        'WAJIB mempertahankan fakta penting persis: nama, angka, tanggal, nomor dokumen, keputusan, permintaan yang belum selesai, dan preferensi pengguna. Jangan menambah hal baru dan jangan mengarang.',
    },
    {
      role: 'user',
      content: `${previous ? `RINGKASAN SEBELUMNYA:\n${previous}\n\n` : ''}PESAN BARU YANG HARUS DIGABUNG:\n${transcript}\n\nTulis ringkasan terbarui yang mencakup ringkasan sebelumnya dan pesan baru.`,
    },
  ];
}

export interface ContinuityInput {
  summary: string | null;
  /** peringkasan gagal dan sebagian pesan lama terpaksa dipotong dari giliran ini */
  truncated: boolean;
}

/** Pesan system kedua (di luar blok identitas): ringkasan + petunjuk memori. */
export function buildContinuityNote(input: ContinuityInput): string {
  const lines = ['[Konteks percakapan]'];
  if (input.summary) lines.push('Ringkasan bagian awal percakapan ini:', input.summary);
  if (input.truncated) {
    lines.push('Catatan: sebagian percakapan lama tidak dapat diringkas dan dipotong dari konteks ini; gunakan chat_cari_riwayat untuk detailnya.');
  } else if (input.summary) {
    lines.push('Catatan: percakapan lama diringkas di atas; gunakan chat_cari_riwayat atau chat_ambil_sesi untuk detail persisnya.');
  }
  lines.push('Percakapan pengguna ini sebelumnya (sesi lain maupun bagian lama sesi ini) dapat dicari dengan tool chat_cari_riwayat dan dibaca dengan chat_ambil_sesi.');
  return lines.join('\n');
}

export interface PlannedContext {
  window: ChatLike[];
  summary: string | null;
  truncated: boolean;
  /** pesan lama yang perlu diringkas (kosong bila tidak ada) */
  needsSummary: ChatLike[];
}

/**
 * Rencana lengkap sebelum peringkasan: jendela dalam anggaran lunak. Bila `needsSummary` tidak
 * kosong pemanggil boleh meringkasnya lalu memanggil lagi; bila gagal, pakai `planWithHardLimit`.
 */
export function planContext(
  messages: ReadonlyArray<ChatLike>,
  summary: string | null,
  summaryUpToSeq: number,
  softBudget: number,
): PlannedContext {
  const reserve = summary ? estimateTokens(summary) : 0;
  const plan = planWindow(messages, summaryUpToSeq, Math.max(1, softBudget - reserve));
  return { window: plan.window, summary, truncated: false, needsSummary: plan.older };
}

/** Peringkasan gagal: kirim pesan mentah selama muat dalam batas keras; sisanya dipotong (ditandai). */
export function planWithHardLimit(
  messages: ReadonlyArray<ChatLike>,
  summary: string | null,
  summaryUpToSeq: number,
  hardBudget: number,
): PlannedContext {
  const reserve = summary ? estimateTokens(summary) : 0;
  const plan = planWindow(messages, summaryUpToSeq, Math.max(1, hardBudget - reserve));
  return { window: plan.window, summary, truncated: plan.older.length > 0, needsSummary: plan.older };
}

/** Pesan jendela → format OpenAI; dua peran berurutan yang sama digabung agar urutan tetap sah. */
export function toTurnMessages(window: ReadonlyArray<ChatLike>): ChatTurnMessage[] {
  const out: ChatTurnMessage[] = [];
  for (const m of window) {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${m.content}`;
    else out.push({ role, content: m.content });
  }
  return out;
}
