// Pra-cek BENTUK ID untuk argumen tool tulis AIRA/MCP.
//
// Model kadang mengisi argumen *Id dengan teks pengguna ("Hermanto", "SI-202610-0053", "Bank BCA")
// alih-alih ID hasil pencarian. Tanpa pra-cek, pengajuan masuk antrean Persetujuan dan baru
// gagal saat disetujui. Modul ini murni (tanpa DB): hanya memeriksa bentuk.

import type { ToolDef, ToolParam } from '../ai/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Model GA memakai cuid (`cmv5hp0u9002frxvdxzhgvvmq`).
const CUID_RE = /^c[a-z0-9]{20,32}$/;

export function isEntityId(v: string): boolean {
  return UUID_RE.test(v) || CUID_RE.test(v);
}

/** Nama param (daun) yang merupakan ID entitas: `id`, `*Id`, `*Ids`. */
const ID_NAME_RE = /(?:^id$|Ids?$)/;

/**
 * Param ber-nama ID yang BUKAN ID entitas (nilai bebas / kode). Diaudit dari registry
 * (482 param ber-ID di tool tulis): hanya `taxId` (NPWP) yang berisi bukan-ID.
 * Tambahkan di sini bila audit menemukan yang lain, jangan menebak.
 */
const NOT_ENTITY_ID = new Set(['taxId']);

/** Petunjuk tool baca untuk mencari ID, berdasarkan nama param (daun). */
const SEARCH_HINT: Record<string, string> = {
  partyId: 'party_search',
  accountId: 'coa_flat',
  cashAccountId: 'coa_flat',
  creditAccountId: 'coa_flat',
  expenseAccountId: 'coa_flat',
  defaultExpenseAccountId: 'coa_flat',
  offsetAccountId: 'coa_flat',
  parentId: 'coa_flat',
  invoiceId: 'si_list / si_summary (penjualan) atau pi_list / pi_summary (pembelian)',
  salesInvoiceId: 'si_list / si_summary',
  salesOrderId: 'so_list',
  quotationId: 'quot_list',
  refundSourcePaymentId: 'pay_list / pay_ledger',
  itemId: 'inv_items_list (stok produksi) atau gi_items (inventaris GA)',
  inventoryItemId: 'gi_items',
  assetId: 'ga_asset_list',
  warehouseId: 'wh_list',
};

export interface IdIssue {
  /** Jalur param, mis. `allocations[].invoiceId`. */
  path: string;
  value: string;
  hint?: string;
}

export function isEntityIdParam(name: string, type: string): boolean {
  if (NOT_ENTITY_ID.has(name)) return false;
  return type === 'uuid' || type === 'array<uuid>' || ID_NAME_RE.test(name);
}

function describe(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function checkValue(p: ToolParam, v: unknown, path: string, out: IdIssue[]): void {
  if (v === undefined || v === null || v === '') return;
  const leaf = p.name;
  const hint = SEARCH_HINT[leaf];

  if (p.type === 'array<object>' || p.type === 'object') {
    const rows = p.type === 'object' ? [v] : Array.isArray(v) ? v : [];
    rows.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      for (const f of p.fields ?? []) checkValue(f, (row as Record<string, unknown>)[f.name], `${path}${p.type === 'object' ? '' : '[]'}.${f.name}`, out);
    });
    return;
  }

  if (!isEntityIdParam(leaf, p.type)) return;
  const items = p.type.startsWith('array') ? (Array.isArray(v) ? v : [v]) : [v];
  for (const item of items) {
    if (typeof item !== 'string' || !isEntityId(item)) out.push({ path, value: describe(item), hint });
  }
}

/** Argumen ber-ID yang bentuknya bukan UUID/CUID. Hanya untuk tool tulis/kritis; tool baca = []. */
export function findBadIds(tool: Pick<ToolDef, 'risk' | 'params'>, args: Record<string, unknown>): IdIssue[] {
  if (tool.risk === 'read') return [];
  const out: IdIssue[] = [];
  for (const p of tool.params ?? []) checkValue(p, args[p.name], p.name, out);
  return out;
}

/** Pesan galat untuk model: apa yang salah dan tool baca mana yang dipakai. */
export function formatBadIds(issues: IdIssue[]): string {
  return issues
    .map((i) => `${i.path} harus berupa ID (UUID) hasil pencarian, bukan "${i.value}"${i.hint ? `. Cari ID lewat ${i.hint}` : '. Cari ID lewat tool baca terkait'}`)
    .join('; ');
}

/**
 * Pesan galat handler yang khas untuk ID salah/tidak ada → petunjuk yang bisa ditindaklanjuti.
 * Dipakai saat eksekusi pengajuan gagal, agar kartu Persetujuan menjelaskan penyebab dan
 * langkah perbaikannya. Pesan yang tidak dikenal dikembalikan apa adanya.
 */
const ERROR_HINTS: Array<{ re: RegExp; hint: string }> = [
  { re: /mitra tidak ditemukan|party.*tidak ditemukan|pelanggan.*tidak ditemukan|pemasok.*tidak ditemukan/i, hint: 'partyId tidak cocok dengan data. Minta AIRA mencari ID lewat party_search lalu mengajukan ulang.' },
  { re: /bukan akun kas\/bank/i, hint: 'accountId harus akun kas/bank (1.1.x), bukan akun lain. Minta AIRA memilih ID akun kas/bank dari coa_flat lalu mengajukan ulang.' },
  { re: /akun kas\/bank tidak ditemukan|akun.*tidak ditemukan/i, hint: 'accountId tidak cocok dengan akun kas/bank. Minta AIRA mencari ID lewat coa_flat lalu mengajukan ulang.' },
  { re: /(invoice|faktur).*tidak ditemukan/i, hint: 'invoiceId tidak cocok dengan data. Minta AIRA mencari ID lewat si_list/si_summary atau pi_list/pi_summary lalu mengajukan ulang.' },
];

export function explainExecutionError(message: string): string {
  const hit = ERROR_HINTS.find((h) => h.re.test(message));
  return hit ? `${message} ${hit.hint}` : message;
}
