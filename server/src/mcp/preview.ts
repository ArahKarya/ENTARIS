// Pratinjau satu panggilan tool domain TANPA menjalankannya: dipakai agen untuk menampilkan kartu
// konfirmasi ("Ajukan PO ...? Ya/Batal") sebelum panggilan sungguhan. Teks kartu berasal dari
// confirm_template registry, bukan dari model, jadi model tidak bisa menyamarkan isi aksinya.

import type { ToolDef, ToolParam } from '../ai/types';
import { renderConfirm } from './queue';
import type { ToolDecision } from './policy';

const MAX_FACTS = 8;
const MAX_VALUE_CHARS = 80;

export type PreviewAction = 'baca' | 'draft' | 'persetujuan' | 'langsung';

export interface ToolPreview {
  ok: true;
  tool: string;
  judul: string;
  risk: ToolDef['risk'];
  /** apa yang terjadi bila dipanggil: baca, membuat draft, masuk antrian persetujuan, atau langsung dieksekusi */
  tindakan: PreviewAction;
  /** true = agen wajib meminta konfirmasi pengguna sebelum memanggil */
  perlu_konfirmasi: boolean;
  konfirmasi: string;
  efek?: string;
  rincian: Array<{ label: string; value: string }>;
}

function action(tool: Pick<ToolDef, 'risk' | 'draftCapable'>, decision: Exclude<ToolDecision, 'deny'>): PreviewAction {
  if (tool.risk === 'read') return 'baca';
  if (decision === 'queue') return 'persetujuan';
  return tool.draftCapable ? 'draft' : 'langsung';
}

function display(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) return `${value.length} baris`;
  if (typeof value === 'object') return undefined;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

/** Argumen skalar (dan jumlah baris array) dalam urutan parameter terdokumentasi. */
function facts(params: ToolParam[] | undefined, args: Record<string, unknown>): ToolPreview['rincian'] {
  const known = (params ?? []).map((p) => p.name);
  const order = [...known.filter((n) => n in args), ...Object.keys(args).filter((n) => !known.includes(n))];
  const out: ToolPreview['rincian'] = [];
  for (const name of order) {
    const value = display(args[name]);
    if (value !== undefined) out.push({ label: name, value });
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}

export function buildPreview(tool: ToolDef, decision: Exclude<ToolDecision, 'deny'>, args: Record<string, unknown>): ToolPreview {
  const tindakan = action(tool, decision);
  return {
    ok: true,
    tool: tool.name,
    judul: tool.desc,
    risk: tool.risk,
    tindakan,
    // Draft tidak berefek GL/stok dan ditinjau manusia saat posting: tanpa kartu.
    perlu_konfirmasi: tindakan === 'persetujuan' || tindakan === 'langsung',
    konfirmasi: renderConfirm(tool.confirm_template, args) || `Jalankan ${tool.name}?`,
    ...(tool.postingEffect ? { efek: tool.postingEffect } : {}),
    rincian: facts(tool.params, args),
  };
}
