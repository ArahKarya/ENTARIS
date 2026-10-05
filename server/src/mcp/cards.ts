// Petunjuk kartu (`card`) seragam pada hasil tool MCP. Aditif: ditambahkan ke structuredContent,
// tidak mengubah bentuk hasil yang sudah ada. Dipakai panel chat untuk menampilkan kartu hasil
// (draft yang dibuat, antrian persetujuan) dan disimpan di mcp_call_logs.card.

export type CardKind =
  | 'cash_book_draft'
  | 'production_draft'
  | 'payment_request_draft'
  | 'purchase_order_draft'
  | 'quotation_draft'
  | 'sales_order_draft'
  | 'approval'
  | 'link';

export interface CardHint {
  kind: CardKind;
  title: string;
  /** satu kalimat ringkas (Bahasa Indonesia) */
  summary?: string;
  /** path internal Entaris (selalu diawali '/') */
  href: string;
  status?: string;
  entityId?: string;
  facts?: Array<{ label: string; value: string }>;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const idr = (v: unknown): string | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? `Rp ${Math.round(n).toLocaleString('id-ID')}` : undefined;
};
const facts = (...pairs: Array<[string, string | undefined]>): Array<{ label: string; value: string }> | undefined => {
  const out = pairs.filter((p): p is [string, string] => !!p[1]).map(([label, value]) => ({ label, value }));
  return out.length ? out : undefined;
};

type Builder = (d: Rec) => CardHint | undefined;

function cashBook(d: Rec): CardHint | undefined {
  const src = isRec(d.draft) ? d.draft : d;
  const id = str(src.id);
  if (!id) return undefined;
  const rows = Array.isArray(src.rows) ? src.rows.length : undefined;
  const review = typeof src.needsReviewCount === 'number' ? src.needsReviewCount : undefined;
  return {
    kind: 'cash_book_draft',
    title: `Draft Buku Kas ${str(src.draftNumber) ?? ''}`.trim(),
    summary: [str(src.title), rows !== undefined ? `${rows} baris` : undefined, review ? `${review} perlu ditinjau` : undefined].filter(Boolean).join(' · ') || undefined,
    href: str(d.reviewPath) ?? `/cash-book-drafts/${id}`,
    status: str(src.status),
    entityId: id,
    facts: facts(['Tanggal', str(src.entryDate)?.slice(0, 10)]),
  };
}

function productionDraft(d: Rec): CardHint | undefined {
  const src = isRec(d.draft) ? d.draft : d;
  const id = str(src.id);
  if (!id) return undefined;
  const warnings = Array.isArray(d.warnings) ? d.warnings.length : 0;
  return {
    kind: 'production_draft',
    title: `Draft Produksi ${str(src.draftNumber) ?? ''}`.trim(),
    summary: warnings ? `${warnings} peringatan; tinjau lalu posting di Produksi > Draft.` : 'Belum diposting; tinjau lalu posting di Produksi > Draft.',
    href: '/inventory?tab=production&view=draft',
    status: str(src.status),
    entityId: id,
  };
}

function paymentRequest(d: Rec): CardHint | undefined {
  const id = str(d.id);
  if (!id) return undefined;
  return {
    kind: 'payment_request_draft',
    title: `Pengajuan Pembayaran ${str(d.number) ?? ''}`.trim(),
    summary: idr(d.totalAmount) ? `Total ${idr(d.totalAmount)}; status ${str(d.status) ?? 'DRAFT'}.` : undefined,
    href: `/payment-requests/${id}`,
    status: str(d.status),
    entityId: id,
    facts: facts(['Total', idr(d.totalAmount)]),
  };
}

const docCard = (kind: CardKind, label: string, numberKey: string, href: string): Builder => (d) => {
  const id = str(d.id);
  if (!id) return undefined;
  return {
    kind,
    title: `${label} ${str(d[numberKey]) ?? ''}`.trim(),
    summary: idr(d.grandTotal) ? `Total ${idr(d.grandTotal)}; status ${str(d.status) ?? 'Draft'}.` : str(d.status) ? `Status ${str(d.status)}.` : undefined,
    href,
    status: str(d.status),
    entityId: id,
    facts: facts(['Total', idr(d.grandTotal)]),
  };
};

/** Tool pembuat/pengubah draft → pembangun kartu. Data = isi respons handler. */
const BUILDERS: Record<string, Builder> = {
  kas_buat_draft_dari_baris: cashBook,
  kas_draft_ubah_header: cashBook,
  kas_draft_ubah_baris: cashBook,
  kas_draft_tambah_baris: cashBook,
  prod_draft_create: productionDraft,
  prod_draft_update: productionDraft,
  payreq_create: paymentRequest,
  po_create: docCard('purchase_order_draft', 'Pesanan Pembelian', 'poNumber', '/purchase-orders'),
  quot_create: docCard('quotation_draft', 'Penawaran', 'quotationNumber', '/quotations'),
  so_create: docCard('sales_order_draft', 'Pesanan Penjualan', 'soNumber', '/sales-orders'),
};

/** Kartu antrian persetujuan dari hasil `pending_approval` atau handler yang mengantrekan (approvalRequestId). */
export function approvalCard(approvalId: string | undefined, confirm: string | undefined): CardHint {
  return {
    kind: 'approval',
    title: 'Menunggu persetujuan',
    summary: confirm || 'Permintaan sudah diajukan dan menunggu keputusan di menu Persetujuan.',
    href: '/approvals',
    status: 'Pending',
    entityId: approvalId,
  };
}

/**
 * Turunkan kartu dari hasil tool. `structured` = structuredContent hasil MCP
 * (`{ok, data}` untuk eksekusi langsung, `{status:'pending_approval', ...}` untuk antrian).
 */
export function buildCard(toolName: string, structured: Rec): CardHint | undefined {
  if (structured.status === 'pending_approval') return approvalCard(str(structured.approvalId), str(structured.confirm));
  if (structured.ok !== true) return undefined;
  const data = isRec(structured.data) ? structured.data : undefined;
  if (!data) return undefined;
  const queued = str(data.approvalRequestId);
  if (queued) return approvalCard(queued, str(data.message));
  const builder = BUILDERS[toolName];
  return builder ? builder(data) : undefined;
}
