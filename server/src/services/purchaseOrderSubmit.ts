import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';
import { checkPurchaseOrderClosable, checkPurchaseOrderEditable } from './purchaseOrderRules';

type Tx = Prisma.TransactionClient;

export interface SubmitPurchaseOrderInput {
  date: string;
  partyId?: string | null; // null = PO Umum
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  items: Array<{
    inventoryItemId?: string | null;
    itemName: string;
    quantity: number;
    unit: string;
    estimatedRate?: number;
    description?: string | null;
  }>;
}

type PoItemInput = SubmitPurchaseOrderInput['items'][number];

// PO Khusus → validate supplier exists & is an active supplier party
async function assertSupplier(tx: Tx, partyId: string | null | undefined) {
  if (!partyId) return;
  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) throw new BusinessError('Supplier tidak ditemukan.');
  if (!party.isActive) throw new BusinessError(`Supplier '${party.name}' tidak aktif.`);
  if (party.partyType !== 'Supplier' && party.partyType !== 'Both') {
    throw new BusinessError(`Party '${party.name}' bukan supplier.`);
  }
}

function computeTotalEstimated(items: PoItemInput[]): Decimal {
  return items.reduce(
    (sum, it) => sum.plus(new Decimal(it.quantity).times(new Decimal(it.estimatedRate ?? 0))),
    new Decimal(0),
  );
}

function toItemRows(items: PoItemInput[]) {
  return items.map((it) => ({
    inventoryItemId: it.inventoryItemId ?? null,
    itemName: it.itemName,
    quantity: it.quantity,
    unit: it.unit,
    estimatedRate: it.estimatedRate ?? 0,
    estimatedAmount: new Decimal(it.quantity)
      .times(new Decimal(it.estimatedRate ?? 0))
      .toDecimalPlaces(2)
      .toNumber(),
    description: it.description ?? null,
  }));
}

/**
 * Submit a Purchase Order. PO bersifat planning saja:
 *   - Tidak ada GL impact
 *   - Tidak ada stock impact
 *   - Tidak punya status Draft (langsung Submitted)
 *
 * PO bisa Umum (partyId null) atau Khusus (partyId set). STT/PI yang
 * referensikan PO ini akan validate match supplier kalau PO Khusus.
 */
export async function submitPurchaseOrderInTx(
  tx: Tx,
  body: SubmitPurchaseOrderInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');

  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  await assertSupplier(tx, body.partyId);

  const poNumber = await generateDocumentNumber(tx, 'PO', parsedDate, fiscalYear.id);

  const totalEstimated = computeTotalEstimated(body.items);

  const po = await tx.purchaseOrder.create({
    data: {
      poNumber,
      date: parsedDate,
      partyId: body.partyId ?? null,
      status: 'Submitted',
      notes: body.notes ?? null,
      terms: body.terms ?? null,
      expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
      totalEstimated: totalEstimated.toDecimalPlaces(2).toNumber(),
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: { create: toItemRows(body.items) },
    },
  });

  logger.info(
    { poId: po.id, poNumber, partyId: body.partyId ?? null, totalEstimated: totalEstimated.toNumber(), lines: body.items.length },
    'Purchase order submitted',
  );

  return po;
}

/**
 * Cancel a PO. Tidak menyentuh STT yang sudah terbentuk (STT independen).
 * Tidak ada GL/stock impact untuk dibatalkan.
 */
export async function cancelPurchaseOrderInTx(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new BusinessError('PO tidak ditemukan.');
  if (po.status === 'Cancelled') throw new BusinessError('PO sudah dibatalkan.');

  // Soft constraint: warn if there are linked STTs but don't block. STT
  // tetap valid (barang sudah diterima). User decision: PO Cancel = OK.
  const linkedSTTCount = await tx.goodsReceipt.count({
    where: { purchaseOrderId: poId, status: { not: 'Cancelled' } },
  });

  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: { status: 'Cancelled', cancelledAt: new Date(), updatedAt: new Date() },
  });

  logger.info(
    { poId, poNumber: po.poNumber, linkedSTTCount },
    'Purchase order cancelled (STTs tetap valid)',
  );
  return updated;
}

/**
 * Edit a PO. Hanya boleh selama PO terbuka (tidak batal / ditutup) dan belum
 * ada penerimaan (STT) maupun PI yang mereferensikannya. Nomor PO tetap;
 * item diganti seluruhnya dan totalEstimated dihitung ulang. Tanpa GL/stok.
 */
export async function updatePurchaseOrderInTx(tx: Tx, poId: string, body: SubmitPurchaseOrderInput) {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: { select: { qtyReceived: true } } },
  });
  if (!po) throw new BusinessError('PO tidak ditemukan.');

  const [linkedReceiptCount, linkedInvoiceCount] = await Promise.all([
    tx.goodsReceipt.count({ where: { purchaseOrderId: poId, status: { not: 'Cancelled' } } }),
    tx.purchaseInvoice.count({ where: { purchaseOrderId: poId, status: { not: 'Cancelled' } } }),
  ]);
  const check = checkPurchaseOrderEditable({ ...po, linkedReceiptCount, linkedInvoiceCount });
  if (!check.ok) throw new BusinessError(check.error);

  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
  await assertSupplier(tx, body.partyId);

  const totalEstimated = computeTotalEstimated(body.items);
  await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } });
  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: {
      date: parsedDate,
      partyId: body.partyId ?? null,
      notes: body.notes ?? null,
      terms: body.terms ?? null,
      expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
      totalEstimated: totalEstimated.toDecimalPlaces(2).toNumber(),
      fiscalYearId: fiscalYear.id,
      items: { create: toItemRows(body.items) },
    },
  });

  logger.info(
    { poId, poNumber: po.poNumber, totalEstimated: totalEstimated.toNumber(), lines: body.items.length },
    'Purchase order updated',
  );
  return updated;
}

/**
 * Short-close a PO ("Tutup PO"): sisa qty tidak lagi diharapkan. Status tetap
 * Submitted (STT yang sudah ada tetap valid), closedAt + closeReason di-set,
 * dan PO tidak lagi muncul di pemilih PO pada STT. Tanpa GL/stok.
 */
export async function closePurchaseOrderInTx(tx: Tx, poId: string, reason: string) {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: { select: { quantity: true, qtyReceived: true } } },
  });
  if (!po) throw new BusinessError('PO tidak ditemukan.');
  const check = checkPurchaseOrderClosable(po, reason);
  if (!check.ok) throw new BusinessError(check.error);

  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: { closedAt: new Date(), closeReason: reason.trim() },
  });
  logger.info({ poId, poNumber: po.poNumber }, 'Purchase order short-closed');
  return updated;
}
