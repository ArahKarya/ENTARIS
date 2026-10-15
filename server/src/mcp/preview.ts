// Pratinjau satu panggilan tool domain TANPA menjalankannya: dipakai klien agen untuk menampilkan
// kartu konfirmasi ("Ajukan PO ...? Ya/Batal") sebelum panggilan sungguhan. Teks kartu berasal dari
// confirm_template registry, bukan dari model. Kartu ditegakkan oleh klien (klien yang memanggil
// pratinjau lalu tool dengan argumen yang sama); pemeriksaan di sini sama dengan panggilan sungguhan
// sebatas tier, RBAC dan argumen, bukan aturan bisnis handler (periode tutup, data tidak ada).

import type { ToolDef, ToolParam } from '../ai/types';
import { renderConfirm } from './queue';
import { displayArgs } from './docLabels';
import type { ToolDecision } from './policy';

const MAX_FACTS = 8;
const MAX_VALUE_CHARS = 80;

/**
 * Tool tulis yang HANYA membuat/mengubah dokumen draft (tanpa GL/stok/WAC, belum diajukan): tidak
 * perlu kartu. Daftar eksplisit, bukan turunan `draftCapable` (flag itu juga dipasang pada hapus,
 * submit dan posting). Tool baru otomatis butuh kartu sampai ditambahkan di sini.
 */
export const DRAFT_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'kas_buat_draft_dari_baris', 'kas_draft_tambah_baris', 'kas_draft_ubah_baris', 'kas_draft_ubah_header',
  'prod_draft_create', 'prod_draft_update',
  'po_create', 'po_update', 'so_create', 'so_update', 'quot_create', 'quot_update', 'inq_create', 'inq_update',
  'gmr_create', 'gmr_create_from_wo', 'gmr_update',
  'payreq_create', 'payreq_update', 'payreq_settlement_save', 'payreq_attachment_add',
]);

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

function action(tool: Pick<ToolDef, 'name' | 'risk'>, decision: Exclude<ToolDecision, 'deny'>): PreviewAction {
  if (tool.risk === 'read') return 'baca';
  if (decision === 'queue') return 'persetujuan';
  return tool.risk === 'write' && DRAFT_ONLY_TOOLS.has(tool.name) ? 'draft' : 'langsung';
}

function display(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value)) return `${value.length} baris`;
  if (typeof value === 'object') return undefined;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

/** Argumen skalar (dan jumlah baris array) dalam urutan parameter terdokumentasi; argumen yang
 *  tidak dikenal tool (diabaikan saat dipanggil) tidak ditampilkan. */
function facts(params: ToolParam[] | undefined, args: Record<string, unknown>): ToolPreview['rincian'] {
  const known = (params ?? []).map((p) => p.name);
  const order = known.length ? known.filter((n) => n in args) : Object.keys(args);
  const out: ToolPreview['rincian'] = [];
  for (const name of order) {
    const value = display(args[name]);
    if (value !== undefined) out.push({ label: name, value });
    if (out.length >= MAX_FACTS) break;
  }
  return out;
}

export async function buildPreview(tool: ToolDef, decision: Exclude<ToolDecision, 'deny'>, rawArgs: Record<string, unknown>): Promise<ToolPreview> {
  const tindakan = action(tool, decision);
  // Kartu menyebut nomor dokumen / nama, bukan UUID; argumen asli tidak diubah.
  const args = await displayArgs(tool.handler, rawArgs);
  return {
    ok: true,
    tool: tool.name,
    judul: tool.desc,
    risk: tool.risk,
    tindakan,
    // Draft murni tidak berefek GL/stok dan ditinjau manusia saat diajukan: tanpa kartu.
    perlu_konfirmasi: tindakan === 'persetujuan' || tindakan === 'langsung',
    konfirmasi: renderConfirm(tool.confirm_template, args) || `Jalankan ${tool.name}?`,
    ...(tool.postingEffect ? { efek: tool.postingEffect } : {}),
    rincian: facts(tool.params, args),
  };
}
