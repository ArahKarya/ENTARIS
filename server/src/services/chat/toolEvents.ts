// Progres tool & kartu hasil per giliran chat: dirangkai dari panggilan MCP ber-`ref`
// (`<sessionId>:<turnId>`). Jalur cepat = bus in-process saat baris log ditulis; jalur cadangan =
// polling mcp_call_logs tiap 1 detik (replika lain / bus terlewat). Dedup per id baris log.

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getTool } from '../../ai/registry';
import { onCall, type CallEndEvent, type CallEvent } from '../../mcp/callBus';
import type { CardHint } from '../../mcp/cards';

export interface ToolProgress {
  name: string;
  label: string;
  state: 'start' | 'done' | 'error';
}

export interface ToolSink {
  tool: (ev: ToolProgress) => void;
  card: (card: CardHint) => void;
}

const META_LABELS: Record<string, string> = {
  cari_tool: 'Mencari tool yang sesuai…',
  dokumen_tool: 'Membaca panduan tool…',
  whoami: 'Memeriksa identitas dan hak akses…',
  panggil_tool: 'Memanggil tool…',
  chat_cari_riwayat: 'Mencari di riwayat percakapan…',
  chat_ambil_sesi: 'Membaca sesi percakapan lama…',
};

const VERB: Record<string, string> = { read: 'Mengambil', write: 'Menyiapkan', critical: 'Mengajukan' };

const ACTIVE_VERB = /^(?:me[a-z]+|ber[a-z]+|per[a-z]+|mem[a-z]+|men[a-z]+|meng[a-z]+|meny[a-z]+)\b/i;

function firstClause(desc: string): string {
  const clause = desc.split(/[.;:(]/)[0]?.trim() ?? '';
  return clause.length > 56 ? `${clause.slice(0, 55).trimEnd()}…` : clause;
}

/** Label Indonesia singkat untuk chip progres (diturunkan dari registry; tanpa data bisnis). */
export function toolLabel(name: string): string {
  const meta = META_LABELS[name];
  if (meta) return meta;
  const t = getTool(name);
  if (!t) return `Menjalankan ${name}…`;
  const clause = firstClause(t.desc);
  if (!clause) return `Menjalankan ${name}…`;
  // Deskripsi yang sudah diawali kata kerja aktif ("Membuat DRAFT ...") dipakai apa adanya.
  if (ACTIVE_VERB.test(clause)) return `${clause}…`;
  return `${VERB[t.risk] ?? 'Menjalankan'} ${clause.charAt(0).toLowerCase()}${clause.slice(1)}…`;
}

const endState = (decision: string): ToolProgress['state'] => (decision === 'error' || decision === 'denied' ? 'error' : 'done');

export interface CollectedCall {
  name: string;
  state: ToolProgress['state'];
  label: string;
}

export interface TurnWatcher {
  /** Berhenti berlangganan setelah satu kali pengurasan terakhir. */
  stop: () => Promise<void>;
  calls: () => CollectedCall[];
  cards: () => CardHint[];
}

const POLL_MS = 1_000;

export function watchTurn(ref: string, sink: ToolSink, pollMs: number = POLL_MS): TurnWatcher {
  const seen = new Set<string>();
  const calls: CollectedCall[] = [];
  const cards: CardHint[] = [];
  let anon = 0;

  const finish = (e: Pick<CallEndEvent, 'tool' | 'decision' | 'card' | 'callId'>): void => {
    const key = e.callId ?? `anon-${anon++}`;
    if (seen.has(key)) return;
    seen.add(key);
    const state = endState(e.decision);
    const label = toolLabel(e.tool);
    calls.push({ name: e.tool, state, label });
    sink.tool({ name: e.tool, label, state });
    if (e.card) {
      const card = e.card as unknown as CardHint;
      cards.push(card);
      sink.card(card);
    }
  };

  const off = onCall((e: CallEvent) => {
    if (e.ref !== ref) return;
    if (e.phase === 'start') sink.tool({ name: e.tool, label: toolLabel(e.tool), state: 'start' });
    else finish(e);
  });

  const poll = async (): Promise<void> => {
    try {
      const rows = await prisma.mcpCallLog.findMany({
        where: { ref, ...(seen.size ? { id: { notIn: [...seen] } } : {}) },
        orderBy: { createdAt: 'asc' },
        select: { id: true, tool: true, decision: true, card: true },
        take: 50,
      });
      for (const r of rows) {
        if (r.decision === 'inflight') continue;
        finish({ tool: r.tool, decision: r.decision, card: (r.card as Record<string, unknown> | null) ?? null, callId: r.id });
      }
    } catch (err) {
      logger.warn({ err }, 'Polling progres tool chat gagal');
    }
  };

  const timer = setInterval(() => void poll(), pollMs);
  return {
    stop: async () => {
      clearInterval(timer);
      off();
      await poll();
    },
    calls: () => [...calls],
    cards: () => [...cards],
  };
}
