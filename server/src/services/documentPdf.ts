// Render PDF dokumen di server dengan templat React-PDF YANG SAMA dengan UI (bundel SSR client/pdf-dist/pdf.cjs).
// Data diambil lewat endpoint GET detail yang sama dengan UI, dengan JWT pendek atas nama pengguna, jadi RBAC,
// pembatasan data, dan bentuk payload identik dengan yang dilihat pengguna di layar.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { generateShortLivedToken } from '../utils/auth';
import { logger } from '../lib/logger';
import type { AttachmentActor } from './attachmentAccess';

export type DocumentPdfResult =
  | { ok: true; buffer: Buffer; fileName: string }
  | { ok: false; status: 400 | 404 | 403 | 501 | 502; error: string };

export type PdfKind =
  | 'quotation'
  | 'proforma_invoice'
  | 'sales_order'
  | 'purchase_order'
  | 'delivery_order'
  | 'goods_receipt'
  | 'stock_transfer'
  | 'stock_opname'
  | 'production_run'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'report_profit_loss'
  | 'report_balance_sheet'
  | 'report_trial_balance'
  | 'report_cash_flow'
  | 'report_aging'
  | 'report_daily';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (v: string): boolean => DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** Laporan tak punya ID: `docId` = parameter laporan (periode `A..B`, tanggal tunggal, atau tipe aging). */
export const REPORT_SPEC_HELP = {
  range: 'docId periode: "YYYY-MM-DD..YYYY-MM-DD" (tanggal mulai..akhir)',
  asOf: 'docId tanggal: "YYYY-MM-DD"',
  aging: 'docId: "Customer" (umur piutang) atau "Supplier" (umur utang)',
} as const;

function rangeQuery(spec: string): string | null {
  const [a, b, ...rest] = spec.split('..');
  if (rest.length || !a || !b || !isRealDate(a) || !isRealDate(b) || a > b) return null;
  return `startDate=${a}&endDate=${b}`;
}
const asOfQuery = (key: 'date') => (spec: string): string | null => (isRealDate(spec) ? `${key}=${spec}` : null);
const agingQuery = (spec: string): string | null => (spec === 'Customer' || spec === 'Supplier' ? `type=${spec}` : null);

/** Bangun path GET laporan; `null` bila parameter tak valid. */
function reportPath(base: string, toQuery: (spec: string) => string | null) {
  return (idEnc: string): string | null => {
    let spec: string;
    try {
      spec = decodeURIComponent(idEnc);
    } catch {
      return null;
    }
    const q = toQuery(spec);
    return q ? `${base}?${q}` : null;
  };
}

/** Dokumen yang didukung: jenis → path GET detail (modul RBAC dicek oleh endpoint itu sendiri). */
export const PDF_DOCS: Record<PdfKind, { path: (id: string) => string | null; label: string; hint?: string }> = {
  quotation: { path: (id) => `/api/quotations/${id}`, label: 'Penawaran' },
  proforma_invoice: { path: (id) => `/api/proforma-invoices/${id}`, label: 'Proforma Invoice' },
  sales_order: { path: (id) => `/api/sales-orders/${id}`, label: 'Sales Order' },
  purchase_order: { path: (id) => `/api/purchase-orders/${id}`, label: 'Purchase Order' },
  delivery_order: { path: (id) => `/api/delivery-orders/${id}`, label: 'Surat Jalan' },
  goods_receipt: { path: (id) => `/api/goods-receipts/${id}`, label: 'STT' },
  stock_transfer: { path: (id) => `/api/stock-transfers/${id}`, label: 'Transfer Stok' },
  stock_opname: { path: (id) => `/api/stock-opname/${id}`, label: 'Stok Opname' },
  sales_invoice: { path: (id) => `/api/sales/invoices/${id}`, label: 'Invoice Penjualan' },
  purchase_invoice: { path: (id) => `/api/purchase/invoices/${id}`, label: 'Invoice Pembelian' },
  production_run: { path: (id) => `/api/inventory/production-runs/${id}`, label: 'Produksi' },
  report_profit_loss: { path: reportPath('/api/reports/profit-loss', rangeQuery), label: 'Laba Rugi', hint: REPORT_SPEC_HELP.range },
  report_balance_sheet: { path: reportPath('/api/reports/balance-sheet', asOfQuery('date')), label: 'Neraca', hint: REPORT_SPEC_HELP.asOf },
  report_trial_balance: { path: reportPath('/api/reports/trial-balance', rangeQuery), label: 'Neraca Saldo', hint: REPORT_SPEC_HELP.range },
  report_cash_flow: { path: reportPath('/api/reports/cash-flow', rangeQuery), label: 'Arus Kas', hint: REPORT_SPEC_HELP.range },
  report_aging: { path: reportPath('/api/reports/aging', agingQuery), label: 'Umur Piutang-Utang', hint: REPORT_SPEC_HELP.aging },
  report_daily: { path: reportPath('/api/reports/daily', asOfQuery('date')), label: 'Laporan Harian', hint: REPORT_SPEC_HELP.asOf },
};

export function isPdfKind(v: unknown): v is PdfKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PDF_DOCS, v);
}

interface PdfBundle {
  renderDoc: (kind: PdfKind, payload: unknown, company: unknown, lang?: 'id' | 'en', reportParams?: Record<string, string>) => Promise<{ buffer: Uint8Array; fileName: string }>;
  companyFromSettings: (data: unknown, fallbackName?: string) => unknown;
}

let bundle: PdfBundle | null = null;

/**
 * Lokasi bundel. Image produksi: /app/server/pdf-dist/pdf.cjs (di dalam server/ agar `react` ter-resolusi dari
 * server/node_modules). Dev/uji: client/pdf-dist/pdf.cjs hasil `npm run build:pdf`.
 */
export function pdfBundlePath(): string {
  if (process.env.PDF_BUNDLE_PATH) return process.env.PDF_BUNDLE_PATH;
  const prod = path.resolve(__dirname, '../../pdf-dist/pdf.cjs');
  return existsSync(prod) ? prod : path.resolve(__dirname, '../../../client/pdf-dist/pdf.cjs');
}

function loadBundle(): PdfBundle {
  if (!bundle) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- bundel CJS hasil build client, dimuat sekali saat dibutuhkan
    bundle = require(pdfBundlePath()) as PdfBundle;
  }
  return bundle;
}

async function loopbackGet(urlPath: string, actor: AttachmentActor): Promise<{ status: number; body: unknown }> {
  const token = generateShortLivedToken({ userId: actor.userId, role: actor.role }, 60);
  const port = process.env.PORT || 3001;
  const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Parameter laporan dari docId untuk templat (periode / tanggal / tipe aging). Dokumen transaksi → kosong. */
export function reportParamsOf(kind: PdfKind, spec: string): Record<string, string> {
  if (!kind.startsWith('report_')) return {};
  if (kind === 'report_aging') return { agingType: spec };
  if (spec.includes('..')) {
    const [startDate, endDate] = spec.split('..');
    return { startDate, endDate };
  }
  return { date: spec };
}

/** ref = `<jenis>:<id>` (lihat PDF_DOCS). */
export async function resolveDocumentPdf(actor: AttachmentActor, ref: string): Promise<DocumentPdfResult> {
  const sep = ref.indexOf(':');
  const kind = sep > 0 ? ref.slice(0, sep) : '';
  const id = sep > 0 ? ref.slice(sep + 1) : '';
  if (!isPdfKind(kind) || !id) return { ok: false, status: 404, error: 'Jenis dokumen PDF tidak dikenal.' };
  try {
    const docPath = PDF_DOCS[kind].path(encodeURIComponent(id));
    if (!docPath) return { ok: false, status: 400, error: `Parameter laporan tidak valid. ${PDF_DOCS[kind].hint ?? ''}`.trim() };
    const doc = await loopbackGet(docPath, actor);
    if (doc.status === 403) return { ok: false, status: 403, error: 'Akses ditolak: Tidak memiliki izin.' };
    if (doc.status === 404) return { ok: false, status: 404, error: `${PDF_DOCS[kind].label} tidak ditemukan.` };
    if (doc.status !== 200 || !doc.body) return { ok: false, status: 502, error: 'Gagal mengambil data dokumen.' };
    const settings = await loopbackGet('/api/settings/company', actor);
    const b = loadBundle();
    const company = b.companyFromSettings(settings.status === 200 ? settings.body : null);
    const out = await b.renderDoc(kind, doc.body, company, 'id', reportParamsOf(kind, id));
    return { ok: true, buffer: Buffer.from(out.buffer), fileName: out.fileName };
  } catch (error) {
    logger.error({ error, kind }, 'resolveDocumentPdf gagal');
    return { ok: false, status: 502, error: 'Gagal membuat PDF dokumen.' };
  }
}
