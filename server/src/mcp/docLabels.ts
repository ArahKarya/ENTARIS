// Nomor dokumen / nama untuk argumen berupa UUID, supaya kartu konfirmasi dan catatan persetujuan
// menyebut "PO-202610-0001" atau "CV Lumbung", bukan "9f1c…". Hanya tampilan: argumen yang dikirim
// ke handler tidak berubah. Gagal cari (tidak ada, DB bermasalah, model tak dikenal) = UUID apa
// adanya, jadi kartu tidak pernah gagal karena ini.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LOOKUPS = 8;
const MAX_LABEL = 60;
const LOOKUP_TIMEOUT_MS = 1500;

interface Source {
  model: string;
  /** kolom yang digabung (spasi) menjadi label */
  fields: string[];
  /** nama tidak unik: tambah 8 karakter awal UUID agar dua entri bernama sama tetap dapat dibedakan */
  ambiguous?: boolean;
}

const PO: Source = { model: 'purchaseOrder', fields: ['poNumber'] };
const SO: Source = { model: 'salesOrder', fields: ['soNumber'] };
const QUOT: Source = { model: 'quotation', fields: ['quotationNumber'] };
const SALES_INV: Source = { model: 'salesInvoice', fields: ['invoiceNumber'] };
const PURCH_INV: Source = { model: 'purchaseInvoice', fields: ['invoiceNumber'] };
const PAYMENT: Source = { model: 'payment', fields: ['paymentNumber'] };
const DO: Source = { model: 'deliveryOrder', fields: ['doNumber'] };
const PARTY: Source = { model: 'party', fields: ['name'], ambiguous: true };
const WAREHOUSE: Source = { model: 'warehouse', fields: ['name'], ambiguous: true };
const ACCOUNT: Source = { model: 'account', fields: ['accountNumber', 'name'] };

/** Argumen `id` ditentukan oleh sumber daya di path handler (`/api/<sumber-daya>/...`). */
const ID_BY_RESOURCE: Record<string, Source> = {
  'purchase-orders': PO,
  'sales-orders': SO,
  quotations: QUOT,
  sales: SALES_INV,
  purchase: PURCH_INV,
  payments: PAYMENT,
  'customer-deposits': PAYMENT,
  'vendor-deposits': PAYMENT,
  'delivery-orders': DO,
  'payment-requests': { model: 'paymentRequest', fields: ['number'] },
  'goods-receipts': { model: 'goodsReceipt', fields: ['sttNumber'] },
  'sales-returns': { model: 'salesReturn', fields: ['returnNumber'] },
  journals: { model: 'journalEntry', fields: ['entryNumber'] },
  'fiscal-years': { model: 'fiscalYear', fields: ['name'], ambiguous: true },
  parties: PARTY,
  'stock-transfers': { model: 'stockTransfer', fields: ['transferNumber'] },
  inquiries: { model: 'inquiry', fields: ['inquiryNumber'] },
  'project-guarantees': { model: 'projectGuarantee', fields: ['guaranteeNumber'] },
  'cash-book-drafts': { model: 'cashBookDraft', fields: ['draftNumber'] },
  'stock-opname': { model: 'stockOpname', fields: ['opnameNumber'] },
  'fixed-assets': { model: 'fixedAsset', fields: ['assetNumber', 'name'] },
  warehouses: WAREHOUSE,
  coa: ACCOUNT,
};

/** Argumen bernama khusus berarti sama di semua tool. */
const BY_NAME: Record<string, Source> = {
  partyId: PARTY,
  warehouseId: WAREHOUSE,
  fromWarehouseId: WAREHOUSE,
  toWarehouseId: WAREHOUSE,
  accountId: ACCOUNT,
  cashAccountId: ACCOUNT,
  creditAccountId: ACCOUNT,
  offsetAccountId: ACCOUNT,
  costAccountId: ACCOUNT,
  purchaseOrderId: PO,
  salesOrderId: SO,
  quotationId: QUOT,
  salesInvoiceId: SALES_INV,
  purchaseInvoiceId: PURCH_INV,
  deliveryOrderId: DO,
  depositPaymentId: PAYMENT,
  refundSourcePaymentId: PAYMENT,
  assetAccountId: ACCOUNT,
  depreciationAccountId: ACCOUNT,
  accumulatedDepAccountId: ACCOUNT,
  defaultExpenseAccountId: ACCOUNT,
  returnAccountId: ACCOUNT,
  expenseAccountId: ACCOUNT,
};

/** Dipakai tes untuk memastikan semua model/kolom di atas masih ada di skema Prisma. */
export const LABEL_SOURCES: Source[] = [...Object.values(ID_BY_RESOURCE), ...Object.values(BY_NAME)];

/** Hanya `/api/<sumber-daya>/:id...`; path bersarang (`/settlements/:id`) bukan dokumen sumber dayanya. */
function resourceOf(handler: string | undefined): string | undefined {
  return /\/api\/([a-z0-9-]+)\/:id(?:\/|$)/.exec(handler ?? '')?.[1];
}

/** Label berasal dari data yang bisa ditulis pihak lain (nama Supplier/Customer, hasil impor):
 *  satu baris, tanpa karakter kontrol, pendek. */
function tidy(text: string): string {
  const flat = text.replace(/[\p{C}\s]+/gu, ' ').trim();
  return flat.length > MAX_LABEL ? `${flat.slice(0, MAX_LABEL - 1)}…` : flat;
}

async function labelOf(source: Source, id: string): Promise<string | undefined> {
  try {
    const delegate = (prisma as unknown as Record<string, { findUnique(a: unknown): Promise<Record<string, unknown> | null> }>)[source.model];
    const select = Object.fromEntries(source.fields.map((f) => [f, true]));
    const row = await delegate.findUnique({ where: { id }, select });
    if (!row) return undefined;
    const text = tidy(source.fields.map((f) => row[f]).filter((v) => typeof v === 'string' && v.trim()).join(' '));
    if (!text) return undefined;
    return source.ambiguous ? `${text} (#${id.slice(0, 8)})` : text;
  } catch (error) {
    logger.debug({ error, model: source.model }, 'docLabels: lookup gagal, UUID dipertahankan');
    return undefined;
  }
}

/**
 * Salinan args untuk ditampilkan: UUID yang dikenal diganti nomor/nama. Selalu menghasilkan objek
 * baru; yang tidak ketemu dibiarkan.
 */
export async function displayArgs(handler: string | undefined, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resource = resourceOf(handler);
  const jobs: Array<[string, Source, string]> = [];
  for (const [name, value] of Object.entries(args)) {
    if (typeof value !== 'string' || !UUID.test(value)) continue;
    const source = name === 'id' ? (resource ? ID_BY_RESOURCE[resource] : undefined) : BY_NAME[name];
    if (source && jobs.length < MAX_LOOKUPS) jobs.push([name, source, value]);
  }
  // Lambat = pakai UUID; kartu tidak boleh menunggu DB hanya demi label.
  const timeout = new Promise<undefined[]>((resolve) => setTimeout(() => resolve([]), LOOKUP_TIMEOUT_MS).unref());
  const labels = await Promise.race([Promise.all(jobs.map(([, source, id]) => labelOf(source, id))), timeout]);
  const out = { ...args };
  jobs.forEach(([name], i) => {
    const label = labels[i];
    if (label) out[name] = label;
  });
  return out;
}
