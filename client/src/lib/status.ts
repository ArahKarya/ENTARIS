/**
 * Document status registry: maps raw status values from the API (Prisma enums
 * such as `PartiallyPaid`, `IN_PROGRESS`, or Indonesian strings such as
 * `Disetor`) to a label key (`common:status.*`) and a visual tone. Labels are
 * translated at call time so badges follow the UI language. StatusBadge renders
 * from this registry so every page labels the same status the same way.
 */
import i18n from '@/i18n';
import type commonId from '@/locales/id/common.json';

export const STATUS_TONES = ['neutral', 'primary', 'info', 'success', 'warning', 'danger'] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export interface StatusMeta {
  label: string;
  tone: StatusTone;
}

export type DocType =
  | 'quotation'
  | 'sales_order'
  | 'sales_invoice'
  | 'sales_return'
  | 'delivery_order'
  | 'temporary_delivery_note'
  | 'purchase_order'
  | 'goods_receipt'
  | 'purchase_invoice'
  | 'payment'
  | 'journal'
  | 'stock_opname'
  | 'stock_transfer'
  | 'inquiry'
  | 'approval'
  | 'deposit'
  | 'fixed_asset'
  | 'ga_asset'
  | 'ga_work_order'
  | 'ga_material_request'
  | 'project_guarantee'
  | 'inventory_item'
  | 'production_run'
  | 'production_draft'
  | 'cash_book_draft'
  | 'ga_document'
  | 'payment_request'
  | 'payment_request_settlement';

/** Lower-case, without `_`, `-` or spaces: `IN_PROGRESS` → `inprogress`. */
export function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

type StatusKey = keyof (typeof commonId)['status'];

interface StatusDef {
  key: StatusKey;
  tone: StatusTone;
}

const m = (key: StatusKey, tone: StatusTone): StatusDef => ({ key, tone });

/** Generic meaning, keyed by normalised status. */
const BASE: Readonly<Record<string, StatusDef>> = {
  // Document lifecycle
  draft: m('draft', 'neutral'),
  submitted: m('submitted', 'info'),
  pending: m('pending', 'warning'),
  approved: m('approved', 'success'),
  rejected: m('rejected', 'danger'),
  cancelled: m('cancelled', 'neutral'),
  canceled: m('cancelled', 'neutral'),
  completed: m('completed', 'success'),
  done: m('completed', 'success'),
  closed: m('closed', 'neutral'),
  open: m('open', 'info'),
  processing: m('processing', 'info'),
  inprocess: m('processing', 'info'),
  inprogress: m('inProgress', 'info'),
  assigned: m('assigned', 'info'),
  onhold: m('onHold', 'warning'),
  failed: m('failed', 'danger'),
  posted: m('posted', 'success'),

  // Sales
  sent: m('sent', 'info'),
  accepted: m('accepted', 'success'),
  expired: m('expired', 'warning'),
  partiallydelivered: m('partiallyDelivered', 'warning'),
  fullydelivered: m('fullyDelivered', 'success'),
  paid: m('paidInFull', 'success'),
  unpaid: m('unpaid', 'warning'),
  partiallypaid: m('partiallyPaid', 'warning'),
  overdue: m('overdue', 'danger'),
  settled: m('settled', 'success'),
  partiallysettled: m('partiallySettled', 'warning'),

  // Purchasing / GA procurement
  requested: m('requested', 'info'),
  quoted: m('quoted', 'info'),
  ordered: m('ordered', 'info'),
  received: m('received', 'success'),
  fulfilled: m('fulfilled', 'success'),

  // Master data / assets
  active: m('active', 'success'),
  inactive: m('inactive', 'neutral'),
  inrepair: m('inRepair', 'warning'),
  retired: m('retired', 'neutral'),
  disposed: m('disposed', 'neutral'),
  lost: m('lost', 'danger'),
  revoked: m('revoked', 'danger'),
  archived: m('archived', 'neutral'),
  spare: m('spare', 'neutral'),

  // Statuses stored in Indonesian
  baru: m('new', 'info'),
  diproses: m('processing', 'info'),
  dikonversi: m('converted', 'success'),
  hilang: m('lost', 'danger'),
  ditutup: m('closed', 'neutral'),
  disetor: m('deposited', 'info'),
  selesai: m('completed', 'success'),
  dibatalkan: m('cancelled', 'neutral'),
  aktif: m('active', 'success'),
  berakhir: m('ended', 'neutral'),
  dilaporkan: m('reported', 'warning'),
  dalamproses: m('inProcess', 'info'),
  klaimasuransi: m('insuranceClaim', 'warning'),
};

const POSTED = m('posted', 'success');

/** Per-document meaning where the generic label would mislead. */
const BY_DOC: Readonly<Partial<Record<DocType, Readonly<Record<string, StatusDef>>>>> = {
  sales_invoice: { submitted: m('unpaid', 'warning') },
  purchase_invoice: { submitted: m('unpaid', 'warning') },
  sales_order: { submitted: m('confirmed', 'info') },
  // PO: document status + receipt progress derived server-side (`receiptStatus`).
  purchase_order: {
    draft: m('draft', 'neutral'),
    pendingapproval: m('pendingApproval', 'warning'),
    submitted: m('ordered', 'info'),
    unreceived: m('notReceived', 'warning'),
    partial: m('partiallyReceived', 'info'),
    full: m('fullyReceived', 'success'),
    closed: m('closed', 'neutral'),
  },
  journal: { submitted: POSTED },
  payment: { submitted: POSTED },
  // STT list: billing state derived from the purchase-invoice link.
  goods_receipt: {
    submitted: POSTED,
    invoiced: m('billed', 'success'),
    uninvoiced: m('notBilled', 'warning'),
    customerowned: m('customerOwned', 'info'),
  },
  // `Invoiced` / `Uninvoiced` are derived in the DO list (Submitted ± invoiceId).
  delivery_order: {
    submitted: POSTED,
    invoiced: m('invoiced', 'success'),
    uninvoiced: m('notInvoiced', 'warning'),
  },
  // Surat Jalan Sementara: Open needs follow-up (link to an official DO).
  temporary_delivery_note: { open: m('open', 'warning'), linked: m('linked', 'success') },
  stock_opname: { submitted: POSTED },
  stock_transfer: { submitted: POSTED },
  sales_return: { submitted: POSTED },
  // Uang muka: usage states derived server-side from applied/refunded amounts.
  deposit: {
    active: m('active', 'info'),
    partiallyused: m('partiallyUsed', 'warning'),
    fullyused: m('fullyUsed', 'success'),
    submitted: m('active', 'info'),
  },
  // Item stok: stock level derived server-side (stockStatus out | low | ok).
  inventory_item: {
    out: m('outOfStock', 'danger'),
    low: m('lowStock', 'warning'),
    ok: m('stockOk', 'success'),
  },
  // Proses produksi: posted on save (stock + GL), Cancelled when reversed.
  production_run: { posted: POSTED, active: POSTED },
  // Draft proses produksi: tanpa efek stok/GL sampai diposting (langsung / lewat persetujuan).
  production_draft: {
    draft: m('draftDoc', 'neutral'),
    pendingapproval: m('pendingApprovalDraft', 'warning'),
    posted: POSTED,
  },
  // Draft Buku Kas: tanpa efek GL sampai diposting; PartiallyPosted = sebagian baris sudah jadi jurnal.
  cash_book_draft: {
    draft: m('draftDoc', 'neutral'),
    partiallyposted: m('partiallyPosted', 'warning'),
    posted: POSTED,
    discarded: m('discarded', 'neutral'),
  },
  // Dokumen & sertifikat GA: an expired document needs renewal (danger).
  ga_document: { expired: m('expired', 'danger') },
  // Permintaan barang GA: FULFILLED = every item received into stock; PAID = billed and posted by GA finance.
  ga_material_request: { fulfilled: m('completed', 'success'), paid: m('paid', 'success') },
  // Approval requests: Pending → Approved | Rejected | NeedsRevision (back to the requester).
  approval: { needsrevision: m('needsRevision', 'warning') },
  // Uang jaminan proyek: Indonesian statuses stored as-is (Disetor → Selesai | Dibatalkan).
  project_guarantee: {
    disetor: m('deposited', 'info'),
    selesai: m('completed', 'success'),
    dibatalkan: m('cancelled', 'neutral'),
  },  // Pengajuan Pembayaran: atasan → keuangan → (direktur) → siap dibayar → dibayar.
  payment_request: {
    draft: m('draft', 'neutral'),
    submitted: m('pendingManager', 'warning'),
    pendingfinance: m('financeReview', 'warning'),
    pendingdirector: m('pendingDirector', 'warning'),
    approved: m('readyToPay', 'primary'),
    paid: m('paid', 'success'),
    rejected: m('rejected', 'danger'),
    revision: m('needsRevision', 'warning'),
    cancelled: m('cancelled', 'neutral'),
  },
  // Pertanggungjawaban uang muka / perjalanan dinas (settlementStatus).
  payment_request_settlement: {
    open: m('notAccounted', 'warning'),
    submitted: m('pendingManager', 'warning'),
    pendingfinance: m('financeReview', 'warning'),
    revision: m('needsRevision', 'warning'),
    settled: m('accounted', 'success'),
  },
};

function humanize(status: string): string {
  return status
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function getStatusMeta(status: string | null | undefined, docType?: DocType): StatusMeta {
  if (!status || !status.trim()) return { label: '—', tone: 'neutral' };
  const key = normalizeStatusKey(status);
  const def = BY_DOC[docType as DocType]?.[key] ?? BASE[key];
  if (!def) return { label: humanize(status), tone: 'neutral' };
  return { label: i18n.t(`status.${def.key}`, { ns: 'common' }), tone: def.tone };
}

export function getStatusLabel(status: string | null | undefined, docType?: DocType): string {
  return getStatusMeta(status, docType).label;
}

export function getStatusTone(status: string | null | undefined, docType?: DocType): StatusTone {
  return getStatusMeta(status, docType).tone;
}

/** `{ value, label }` options for a status filter, labelled from this registry. */
export function statusOptions(
  statuses: readonly string[],
  docType?: DocType,
): Array<{ value: string; label: string }> {
  return statuses.map((value) => ({ value, label: getStatusLabel(value, docType) }));
}
