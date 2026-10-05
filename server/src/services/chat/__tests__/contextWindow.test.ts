import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildContinuityNote,
  buildSummaryMessages,
  eligibleMessages,
  planContext,
  planWindow,
  planWithHardLimit,
  selectSummaryChunk,
  toTurnMessages,
  type ChatLike,
} from '../contextWindow';
import { planWithSummary, resetSummaryFailureLog } from '../summaryService';

const msg = (seq: number, role: 'user' | 'assistant', content: string, status = 'ok'): ChatLike => ({ id: `m${seq}`, seq, role, content, status });
/** n pasang tanya-jawab; tiap pesan ±`size` karakter. Fakta ada di giliran ke-2. */
function convo(pairs: number, size = 400): ChatLike[] {
  const out: ChatLike[] = [];
  for (let i = 1; i <= pairs; i++) {
    const fact = i === 2 ? ' Kode rahasia proyek adalah KEMBANG-77.' : '';
    out.push(msg(i * 2 - 1, 'user', `Pertanyaan ${i}.${fact} ${'x'.repeat(size)}`));
    out.push(msg(i * 2, 'assistant', `Jawaban ${i}. ${'y'.repeat(size)}`));
  }
  return out;
}

describe('planWindow', () => {
  it('keeps everything when it fits the budget', () => {
    const p = planWindow(convo(3, 40), 0, 10_000);
    expect(p.window).toHaveLength(6);
    expect(p.older).toHaveLength(0);
  });

  it('is deterministic and newest-first within the budget; the rest is "older"', () => {
    const all = convo(10, 400); // ±104 token per pesan
    const a = planWindow(all, 0, 450);
    const b = planWindow([...all].reverse(), 0, 450);
    expect(a.window.map((m) => m.seq)).toEqual(b.window.map((m) => m.seq));
    expect(a.window[a.window.length - 1].seq).toBe(20);
    expect(a.window.length).toBeGreaterThan(0);
    expect(a.window.length).toBeLessThan(20);
    expect(a.older.length + a.window.length).toBe(20);
    expect(Math.max(...a.older.map((m) => m.seq))).toBeLessThan(a.window[0].seq);
  });

  it('always includes the last message even when it alone exceeds the budget', () => {
    const p = planWindow([msg(1, 'user', 'a'.repeat(4000))], 0, 10);
    expect(p.window).toHaveLength(1);
  });

  it('skips messages already covered by the summary, empty content and streaming placeholders', () => {
    const rows = [msg(1, 'user', 'lama'), msg(2, 'assistant', 'lama'), msg(3, 'user', 'baru'), msg(4, 'assistant', '', 'streaming'), msg(5, 'assistant', ' ')];
    expect(eligibleMessages(rows, 2).map((m) => m.seq)).toEqual([3]);
    const p = planWindow(rows, 2, 1000);
    expect(p.window.map((m) => m.seq)).toEqual([3]);
  });

  it('keeps partial text of aborted/error answers as context', () => {
    const rows = [msg(1, 'user', 'tanya'), msg(2, 'assistant', 'sebagian jawab', 'aborted'), msg(3, 'user', 'lanjut')];
    expect(planWindow(rows, 0, 1000).window.map((m) => m.seq)).toEqual([1, 2, 3]);
  });
});

describe('toTurnMessages', () => {
  it('merges consecutive same-role messages (failed turn followed by a new question)', () => {
    const out = toTurnMessages([msg(1, 'user', 'a'), msg(2, 'user', 'b'), msg(3, 'assistant', 'c')]);
    expect(out).toEqual([
      { role: 'user', content: 'a\n\nb' },
      { role: 'assistant', content: 'c' },
    ]);
  });
});

describe('selectSummaryChunk / buildSummaryMessages / continuity note', () => {
  it('returns an oldest-first prefix within the char cap (at least one message)', () => {
    const older = convo(5, 1000);
    const chunk = selectSummaryChunk(older, 3_500);
    expect(chunk.length).toBe(3);
    expect(chunk[0].seq).toBe(1);
    expect(selectSummaryChunk(older, 10)).toHaveLength(1);
  });

  it('builds an incremental prompt that carries the previous summary and the new messages', () => {
    const m = buildSummaryMessages('RINGKAS-LAMA', [msg(5, 'user', 'halo baru')]);
    expect(m[1].content).toContain('RINGKASAN SEBELUMNYA:\nRINGKAS-LAMA');
    expect(m[1].content).toContain('Pengguna: halo baru');
    expect(buildSummaryMessages(null, [msg(5, 'user', 'x')])[1].content).not.toContain('RINGKASAN SEBELUMNYA');
  });

  it('always tells the agent older detail is retrievable; adds a visible notice when truncated', () => {
    expect(buildContinuityNote({ summary: null, truncated: false })).toContain('chat_cari_riwayat');
    const withSummary = buildContinuityNote({ summary: 'ringkasan X', truncated: false });
    expect(withSummary).toContain('ringkasan X');
    expect(withSummary).toContain('chat_ambil_sesi');
    expect(buildContinuityNote({ summary: null, truncated: true })).toContain('dipotong');
  });
});

describe('planWithSummary (long conversation, summary trigger)', () => {
  beforeEach(() => resetSummaryFailureLog());
  const all = convo(60, 400); // 120 pesan, ±12 ribu token

  it('does not call the agent while everything fits', async () => {
    const complete = vi.fn();
    const plan = await planWithSummary(
      { sessionId: 's', messages: convo(3, 40), summary: null, summaryUpToSeq: 0, softBudget: 5_000, hardBudget: 15_000 },
      { complete, persist: vi.fn() },
    );
    expect(complete).not.toHaveBeenCalled();
    expect(plan.summary).toBeNull();
  });

  it('summarises older messages incrementally and the fact from turn 2 survives in the summary', async () => {
    const persisted: Array<{ summary: string; upTo: string }> = [];
    const complete = vi.fn(async (messages: Array<{ role: string; content: string }>) => {
      const text = messages[1].content;
      // ringkasan tiruan: mempertahankan fakta apa pun yang terlihat di ringkasan lama atau pesan baru
      return text.includes('KEMBANG-77') ? 'Ringkasan: kode rahasia proyek KEMBANG-77.' : 'Ringkasan: percakapan umum.';
    });
    const plan = await planWithSummary(
      { sessionId: 's', messages: all, summary: null, summaryUpToSeq: 0, softBudget: 1_500, hardBudget: 4_500 },
      { complete, persist: async (summary, upTo) => void persisted.push({ summary, upTo }) },
    );
    expect(complete).toHaveBeenCalled();
    expect(plan.summary).toContain('KEMBANG-77');
    expect(plan.truncated).toBe(false);
    expect(plan.needsSummary).toHaveLength(0);
    expect(plan.window[plan.window.length - 1].seq).toBe(120);
    // inkremental: titik ringkasan maju dan tidak melewati awal jendela
    const upToId = persisted[persisted.length - 1].upTo;
    expect(Number(upToId.slice(1))).toBeLessThan(plan.window[0].seq);
    // setiap panggilan berikutnya membawa ringkasan sebelumnya
    if (complete.mock.calls.length > 1) expect(complete.mock.calls[1][0][1].content).toContain('RINGKASAN SEBELUMNYA');
  });

  it('on summary failure keeps raw messages up to the hard limit, flags truncation, and does not persist', async () => {
    const persist = vi.fn();
    const plan = await planWithSummary(
      { sessionId: 's', messages: all, summary: null, summaryUpToSeq: 0, softBudget: 1_500, hardBudget: 4_500 },
      { complete: vi.fn().mockRejectedValue(new Error('engine down')), persist },
    );
    expect(persist).not.toHaveBeenCalled();
    expect(plan.summary).toBeNull();
    expect(plan.window.length).toBeGreaterThan(planWindow(all, 0, 1_500).window.length); // lebih banyak mentah dari anggaran lunak
    expect(plan.truncated).toBe(true);
    expect(plan.window[plan.window.length - 1].seq).toBe(120);
  });

  it('retries on the next turn: after failure then success, older content is summarised', async () => {
    const deps = { complete: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('Ringkasan KEMBANG-77'), persist: vi.fn().mockResolvedValue(undefined) };
    const input = { sessionId: 's2', messages: all, summary: null, summaryUpToSeq: 0, softBudget: 1_500, hardBudget: 4_500 };
    const first = await planWithSummary(input, deps);
    expect(first.truncated).toBe(true);
    const second = await planWithSummary(input, deps);
    expect(second.summary).toContain('KEMBANG-77');
    expect(deps.persist).toHaveBeenCalled();
  });

  it('planContext/planWithHardLimit reserve room for an existing summary', () => {
    const rows = convo(10, 400);
    const noSummary = planContext(rows, null, 0, 800);
    const withSummary = planContext(rows, 'z'.repeat(2_000), 0, 800);
    expect(withSummary.window.length).toBeLessThanOrEqual(noSummary.window.length);
    expect(planWithHardLimit(rows, null, 0, 100_000).truncated).toBe(false);
  });
});
