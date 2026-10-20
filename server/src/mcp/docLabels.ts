// Nomor dokumen / nama untuk argumen berupa UUID, supaya kartu konfirmasi dan catatan persetujuan
// menyebut "PO-202610-0001" atau "CV Lumbung", bukan "9f1c…". Hanya tampilan: argumen yang dikirim
// ke handler tidak berubah. Gagal cari (tidak ada, DB bermasalah, model tak dikenal) = UUID apa
// adanya, jadi kartu tidak pernah gagal karena ini.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Model GA memakai cuid (`cmv5hp0u9002frxvdxzhgvvmq`).
const CUID = /^c[a-z0-9]{20,32}$/;
const MAX_LOOKUPS = 8;
const MAX_LABEL = 60;
const LOOKUP_TIMEOUT_MS = 1500;

export interface Source {
  model: string;
  /** kolom yang digabung (spasi) menjadi label */
  fields: string[];
  /** nama tidak unik: tambah 8 karakter awal UUID agar dua entri bernama sama tetap dapat dibedakan */
  ambiguous?: boolean;
}

const PO: Source = { model: 'purchaseOrder', fields: ['poNumber'] };
const SO: Source = { model: 'salesOrder', fields: ['soNumber'] };
const QUOT: Source = { model: 'quotation', fields: ['quotationNumber'] };
const PROFORMA: Source = { model: 'proformaInvoice', fields: ['proformaNumber'] };
const SALES_INV: Source = { model: 'salesInvoice', fields: ['invoiceNumber'] };
const PURCH_INV: Source = { model: 'purchaseInvoice', fields: ['invoiceNumber'] };
const PAYMENT: Source = { model: 'payment', fields: ['paymentNumber'] };
const DO: Source = { model: 'deliveryOrder', fields: ['doNumber'] };
const PARTY: Source = { model: 'party', fields: ['name'], ambiguous: true };
const WAREHOUSE: Source = { model: 'warehouse', fields: ['name'], ambiguous: true };
const ACCOUNT: Source = { model: 'account', fields: ['accountNumber', 'name'] };

const GA_ASSET: Source = { model: 'gaAsset', fields: ['code', 'name'] };
const GA_LOCATION: Source = { model: 'gaLocation', fields: ['code', 'name'] };
const USER: Source = { model: 'user', fields: ['fullName'], ambiguous: true };

/** Argumen `id` ditentukan oleh path handler sebelum `/:id` (`/api/<path>/:id/...`). */
const ID_BY_RESOURCE: Record<string, Source> = {
  'purchase-orders': PO,
  'sales-orders': SO,
  quotations: QUOT,
  'proforma-invoices': PROFORMA,
  'sales/invoices': SALES_INV,
  'purchase/invoices': PURCH_INV,
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
  'approvals/requests': { model: 'approvalRequest', fields: ['documentNumber'] },
  recurring: { model: 'recurringTemplate', fields: ['name'], ambiguous: true },
  'service-items': { model: 'serviceItem', fields: ['code', 'name'] },
  'payment-request-types': { model: 'paymentRequestType', fields: ['code', 'name'] },
  'tax/config': { model: 'taxConfig', fields: ['name'], ambiguous: true },
  'inventory/items': { model: 'inventoryItem', fields: ['code', 'name'] },
  'inventory/machines': { model: 'machine', fields: ['code', 'name'] },
  'inventory/movements': { model: 'stockMovement', fields: ['movementNumber'] },
  'inventory/production-runs': { model: 'productionRun', fields: ['runNumber'] },
  'inventory/production-runs/drafts': { model: 'productionRunDraft', fields: ['draftNumber'] },
  'inventory/production-processes': { model: 'productionProcess', fields: ['name'], ambiguous: true },
  'inventory/production-cost-standards': { model: 'productionCostStandard', fields: ['name'], ambiguous: true },
  // GA: kendaraan, gedung dan peralatan memakai id aset GA di path-nya.
  'ga/assets': GA_ASSET,
  'ga/vehicle/assets': GA_ASSET,
  'ga/building/assets': GA_ASSET,
  'ga/equipment/assets': GA_ASSET,
  'ga/material-requests': { model: 'gaMaterialRequest', fields: ['code'] },
  'ga/maintenance/work-orders': { model: 'gaWorkOrder', fields: ['code', 'title'] },
  'ga/documents': { model: 'gaDocument', fields: ['code', 'title'] },
  'ga/inventory/items': { model: 'gaInventoryItem', fields: ['sku', 'name'] },
  'ga/master/branches': { model: 'gaBranch', fields: ['code', 'name'] },
  'ga/master/cost-centers': { model: 'gaCostCenter', fields: ['code', 'name'] },
  'ga/master/locations': GA_LOCATION,
  'ga/master/asset-categories': { model: 'gaAssetCategory', fields: ['code', 'name'] },
  'ga/master/document-types': { model: 'gaDocumentType', fields: ['code', 'name'] },
  'ga/master/inventory-categories': { model: 'gaInventoryCategory', fields: ['code', 'name'] },
};

/** Argumen bernama khusus berarti sama di semua tool. Nama yang dipakai untuk tabel berbeda di tool
 *  berbeda (itemId, categoryId, typeId, documentId) sengaja tidak dipetakan. */
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
  parentId: ACCOUNT,
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
  machineId: { model: 'machine', fields: ['code', 'name'] },
  assetId: GA_ASSET,
  gaAssetId: GA_ASSET,
  workOrderId: { model: 'gaWorkOrder', fields: ['code', 'title'] },
  branchId: { model: 'gaBranch', fields: ['code', 'name'] },
  costCenterId: { model: 'gaCostCenter', fields: ['code', 'name'] },
  locationId: GA_LOCATION,
  fromLocationId: GA_LOCATION,
  toLocationId: GA_LOCATION,
  picUserId: USER,
  assignedToId: USER,
  inspectorUserId: USER,
};

/** Dipakai tes untuk memastikan semua model/kolom di atas masih ada di skema Prisma. */
export const LABEL_SOURCES: Source[] = [...Object.values(ID_BY_RESOURCE), ...Object.values(BY_NAME)];

/** Path sebelum `/:id` pertama (`sales/invoices`, `ga/vehicle/assets`). Path yang tidak dipetakan
 *  (`project-guarantees/settlements`, `customer-deposits/apply`) tidak diberi label. */
function resourceOf(handler: string | undefined): string | undefined {
  return /\/api\/([a-z0-9-]+(?:\/[a-z0-9-]+)*)\/:id(?:\/|$)/.exec(handler ?? '')?.[1];
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

/** Route yang tidak memakai `:id`-nya sendiri: label dari `id` tidak menjamin apa yang diubah. */
const ID_IGNORED_BY_ROUTE: ReadonlySet<string> = new Set(['POST /api/fixed-assets/:id/depreciate']);

/** `/:id/.../:sid`: yang diubah adalah sub-rekaman `:sid`, dan route tidak selalu memeriksa bahwa ia
 *  milik `:id`; label `id` bisa menunjuk induk yang salah, jadi dilewati. */
export function idIsSubRecord(handler: string | undefined): boolean {
  const after = (handler ?? '').split('/:id')[1] ?? '';
  return /\/:[a-zA-Z]/.test(after) || ID_IGNORED_BY_ROUTE.has(handler ?? '');
}

/** Sumber label untuk argumen `name` pada tool dengan path `resource`; undefined = tidak diberi label. */
export function sourceFor(resource: string | undefined, name: string): Source | undefined {
  return name === 'id' ? (resource ? ID_BY_RESOURCE[resource] : undefined) : BY_NAME[name];
}

export { resourceOf };

/**
 * Salinan args untuk ditampilkan: UUID yang dikenal diganti nomor/nama. Selalu menghasilkan objek
 * baru; yang tidak ketemu dibiarkan.
 */
export async function displayArgs(handler: string | undefined, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const resource = idIsSubRecord(handler) ? undefined : resourceOf(handler);
  const jobs: Array<[string, Source, string]> = [];
  for (const [name, value] of Object.entries(args)) {
    if (typeof value !== 'string' || !(UUID.test(value) || CUID.test(value))) continue;
    const source = sourceFor(resource, name);
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
