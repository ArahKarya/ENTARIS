/**
 * Document status registry: maps raw status values from the API (Prisma enums
 * such as `PartiallyPaid`, `IN_PROGRESS`, or Indonesian strings such as
 * `Disetor`) to an Indonesian label and a visual tone. StatusBadge renders
 * from this registry so every page labels the same status the same way.
 */

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
  | 'ga_material_request';

/** Lower-case, without `_`, `-` or spaces: `IN_PROGRESS` → `inprogress`. */
export function normalizeStatusKey(status: string): string {
  return status.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

const m = (label: string, tone: StatusTone): StatusMeta => ({ label, tone });

/** Generic meaning, keyed by normalised status. */
const BASE: Readonly<Record<string, StatusMeta>> = {
  // Document lifecycle
  draft: m('Draf', 'neutral'),
  submitted: m('Diajukan', 'info'),
  pending: m('Menunggu', 'warning'),
  approved: m('Disetujui', 'success'),
  rejected: m('Ditolak', 'danger'),
  cancelled: m('Dibatalkan', 'neutral'),
  canceled: m('Dibatalkan', 'neutral'),
  completed: m('Selesai', 'success'),
  done: m('Selesai', 'success'),
  closed: m('Ditutup', 'neutral'),
  open: m('Terbuka', 'info'),
  processing: m('Diproses', 'info'),
  inprocess: m('Diproses', 'info'),
  inprogress: m('Dikerjakan', 'info'),
  assigned: m('Ditugaskan', 'info'),
  onhold: m('Ditahan', 'warning'),
  failed: m('Gagal', 'danger'),
  posted: m('Diposting', 'success'),

  // Sales
  sent: m('Terkirim', 'info'),
  accepted: m('Diterima', 'success'),
  expired: m('Kedaluwarsa', 'warning'),
  partiallydelivered: m('Terkirim Sebagian', 'warning'),
  fullydelivered: m('Terkirim Penuh', 'success'),
  paid: m('Lunas', 'success'),
  unpaid: m('Belum Lunas', 'warning'),
  partiallypaid: m('Dibayar Sebagian', 'warning'),
  overdue: m('Jatuh Tempo', 'danger'),
  settled: m('Lunas', 'success'),
  partiallysettled: m('Diselesaikan Sebagian', 'warning'),

  // Purchasing / GA procurement
  requested: m('Diminta', 'info'),
  quoted: m('Penawaran Masuk', 'info'),
  ordered: m('Dipesan', 'info'),
  received: m('Diterima', 'success'),
  fulfilled: m('Terpenuhi', 'success'),

  // Master data / assets
  active: m('Aktif', 'success'),
  inactive: m('Nonaktif', 'neutral'),
  inrepair: m('Dalam Perbaikan', 'warning'),
  retired: m('Dihentikan', 'neutral'),
  disposed: m('Dilepas', 'neutral'),
  lost: m('Hilang', 'danger'),
  revoked: m('Dicabut', 'danger'),
  archived: m('Diarsipkan', 'neutral'),
  spare: m('Cadangan', 'neutral'),

  // Statuses stored in Indonesian
  baru: m('Baru', 'info'),
  diproses: m('Diproses', 'info'),
  dikonversi: m('Dikonversi', 'success'),
  hilang: m('Hilang', 'danger'),
  ditutup: m('Ditutup', 'neutral'),
  disetor: m('Disetor', 'info'),
  selesai: m('Selesai', 'success'),
  dibatalkan: m('Dibatalkan', 'neutral'),
  aktif: m('Aktif', 'success'),
  berakhir: m('Berakhir', 'neutral'),
  dilaporkan: m('Dilaporkan', 'warning'),
  dalamproses: m('Dalam Proses', 'info'),
  klaimasuransi: m('Klaim Asuransi', 'warning'),
};

const POSTED = m('Diposting', 'success');

/** Per-document meaning where the generic label would mislead. */
const BY_DOC: Readonly<Partial<Record<DocType, Readonly<Record<string, StatusMeta>>>>> = {
  sales_invoice: { submitted: m('Belum Lunas', 'warning') },
  purchase_invoice: { submitted: m('Belum Lunas', 'warning') },
  sales_order: { submitted: m('Dikonfirmasi', 'info') },
  purchase_order: { submitted: m('Dipesan', 'info') },
  journal: { submitted: POSTED },
  payment: { submitted: POSTED },
  goods_receipt: { submitted: POSTED },
  // `Invoiced` / `Uninvoiced` are derived in the DO list (Submitted ± invoiceId).
  delivery_order: {
    submitted: POSTED,
    invoiced: m('Sudah Diinvoice', 'success'),
    uninvoiced: m('Belum Diinvoice', 'warning'),
  },
  // Surat Jalan Sementara: Open needs follow-up (link to an official DO).
  temporary_delivery_note: { open: m('Terbuka', 'warning'), linked: m('Tertaut', 'success') },
  stock_opname: { submitted: POSTED },
  stock_transfer: { submitted: POSTED },
  sales_return: { submitted: POSTED },
  // Uang muka: usage states derived server-side from applied/refunded amounts.
  deposit: {
    active: m('Aktif', 'info'),
    partiallyused: m('Terpakai Sebagian', 'warning'),
    fullyused: m('Terpakai', 'success'),
    submitted: m('Aktif', 'info'),
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
  if (!status || !status.trim()) return m('-', 'neutral');
  const key = normalizeStatusKey(status);
  return BY_DOC[docType as DocType]?.[key] ?? BASE[key] ?? m(humanize(status), 'neutral');
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
