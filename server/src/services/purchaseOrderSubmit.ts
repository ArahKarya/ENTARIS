import { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';
import { checkPurchaseOrderClosable, checkPurchaseOrderEditable } from './purchaseOrderRules';
import {
  checkPurchaseOrderCancellable,
  checkPurchaseOrderDeletable,
  checkPurchaseOrderEditableLifecycle,
  checkPurchaseOrderSubmittable,
  isPendingApproval,
  matchesApprovalRule,
  PO_APPROVAL_REJECTED,
  resolveSubmitOutcome,
} from './purchaseOrderLifecycle';
import {
  computePurchaseOrderTotals,
  type PurchaseOrderLineTotals,
  type PurchaseOrderTotals,
} from './purchaseOrderCalc';

type Tx = Prisma.TransactionClient;

export interface SubmitPurchaseOrderInput {
  date: string;
  partyId?: string | null; // null = PO Umum
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  paymentTermDays?: number | null;
  warehouseId?: string | null;
  supplierQuoteRef?: string | null;
  otherCosts?: number;
  otherCostsLabel?: string | null;
  /** 'draft' = Simpan Draf; 'submit' (default, legacy behaviour) = langsung ajukan. */
  saveAs?: 'draft' | 'submit';
  items: Array<{
    inventoryItemId?: string | null;
    itemName: string;
    quantity: number;
    unit: string;
    estimatedRate?: number;
    discount?: number;
    taxPct?: number;
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

async function assertWarehouse(tx: Tx, warehouseId: string | null | undefined) {
  if (!warehouseId) return;
  const wh = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!wh) throw new BusinessError('Gudang tujuan tidak ditemukan.');
  if (!wh.isActive) throw new BusinessError(`Gudang '${wh.name}' tidak aktif.`);
}

function toItemRows(items: PoItemInput[], lines: PurchaseOrderLineTotals[]) {
  return items.map((it, i) => ({
    inventoryItemId: it.inventoryItemId ?? null,
    itemName: it.itemName,
    quantity: it.quantity,
    unit: it.unit,
    estimatedRate: it.estimatedRate ?? 0,
    discount: it.discount ?? 0,
    taxPct: it.taxPct ?? 0,
    taxAmount: lines[i].taxAmount.toNumber(),
    estimatedAmount: lines[i].amount.toNumber(),
    description: it.description ?? null,
  }));
}

/** Header columns shared by create & update (pricing + terms + destination). */
function headerData(body: SubmitPurchaseOrderInput, totals: PurchaseOrderTotals) {
  return {
    partyId: body.partyId ?? null,
    notes: body.notes ?? null,
    terms: body.terms ?? null,
    expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null,
    paymentTermDays: body.paymentTermDays ?? null,
    warehouseId: body.warehouseId ?? null,
    supplierQuoteRef: body.supplierQuoteRef?.trim() || null,
    otherCostsLabel: body.otherCostsLabel?.trim() || null,
    subtotal: totals.subtotal.toNumber(),
    discountTotal: totals.discountTotal.toNumber(),
    taxTotal: totals.taxTotal.toNumber(),
    otherCosts: totals.otherCosts.toNumber(),
    grandTotal: totals.grandTotal.toNumber(),
    // Backward compat: legacy readers use totalEstimated as the PO value.
    totalEstimated: totals.grandTotal.toNumber(),
  };
}

/**
 * Create a Purchase Order (planning only — no GL / stock impact).
 * Always persisted as Draft first; unless `saveAs === 'draft'` it is then
 * submitted right away (see submitPurchaseOrderDraftInTx). Nomor PO diberikan
 * saat dibuat (juga untuk draf) — lihat purchaseOrderLifecycle.ts.
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
  await assertWarehouse(tx, body.warehouseId);

  const poNumber = await generateDocumentNumber(tx, 'PO', parsedDate, fiscalYear.id);
  const totals = computePurchaseOrderTotals(body.items, body.otherCosts ?? 0);

  const po = await tx.purchaseOrder.create({
    data: {
      ...headerData(body, totals),
      poNumber,
      date: parsedDate,
      status: 'Draft',
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      items: { create: toItemRows(body.items, totals.lines) },
    },
  });

  logger.info(
    { poId: po.id, poNumber, partyId: body.partyId ?? null, grandTotal: totals.grandTotal.toNumber(), lines: body.items.length },
    'Purchase order created (draft)',
  );

  if (body.saveAs === 'draft') return { ...po, approvalRequestId: null };
  const { po: submitted, approvalRequest } = await submitPurchaseOrderDraftInTx(tx, po.id, userId);
  return { ...submitted, approvalRequestId: approvalRequest?.id ?? null };
}

/**
 * "Ajukan" a Draft PO. Active ApprovalRule for 'PurchaseOrder' with
 * minAmount ≤ grandTotal → stays Draft with approvalStatus Pending and an
 * ApprovalRequest (documentId = PO id, payload null) is queued; otherwise the
 * PO becomes Submitted ("Dipesan") immediately. Rule-based for every role
 * (Admin included) — the rule itself is the policy.
 */
export async function submitPurchaseOrderDraftInTx(tx: Tx, poId: string, userId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new BusinessError('PO tidak ditemukan.');
  const check = checkPurchaseOrderSubmittable(po);
  if (!check.ok) throw new BusinessError(check.error);

  const grandTotal = Number(po.grandTotal) || Number(po.totalEstimated);
  const rules = await tx.approvalRule.findMany({
    where: { documentType: 'PurchaseOrder', isActive: true },
    select: { minAmount: true, isActive: true },
  });
  const outcome = resolveSubmitOutcome(matchesApprovalRule(rules, grandTotal));

  if (outcome.status === 'Submitted') {
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'Submitted', submittedAt: new Date(), approvalStatus: null },
    });
    logger.info({ poId, poNumber: po.poNumber }, 'Purchase order submitted (no approval rule)');
    return { po: updated, approvalRequest: null };
  }

  const request = await tx.approvalRequest.create({
    data: {
      documentType: 'PurchaseOrder',
      documentId: po.id,
      documentNumber: po.poNumber,
      amount: grandTotal,
      payload: Prisma.DbNull,
      requestedBy: userId,
      status: 'Pending',
    },
  });
  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: { approvalStatus: outcome.approvalStatus, approvalNote: null },
  });
  logger.info({ poId, poNumber: po.poNumber, requestId: request.id }, 'Purchase order queued for approval');
  return { po: updated, approvalRequest: request };
}

/** Approval decided (from approvalDecision): approve → Submitted, else back to Draft. */
export async function applyPurchaseOrderApprovalDecisionInTx(
  tx: Tx,
  poId: string,
  decision: 'approve' | 'reject' | 'revise',
  note?: string,
) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new BusinessError('PO tidak ditemukan.');
  // Idempotent for reject/revise (retry after a partial failure).
  if (decision !== 'approve' && po.status === 'Draft' && po.approvalStatus === PO_APPROVAL_REJECTED) return po;
  if (!isPendingApproval(po)) throw new BusinessError('PO tidak sedang menunggu persetujuan.');
  if (decision === 'approve') {
    return tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'Submitted', submittedAt: new Date(), approvalStatus: null, approvalNote: note || null },
    });
  }
  return tx.purchaseOrder.update({
    where: { id: poId },
    data: { approvalStatus: PO_APPROVAL_REJECTED, approvalNote: note || null },
  });
}

/** Hapus draf (PO tanpa GL; nomor yang terlewat tidak dipakai ulang). */
export async function deletePurchaseOrderDraftInTx(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new BusinessError('PO tidak ditemukan.');
  const check = checkPurchaseOrderDeletable(po);
  if (!check.ok) throw new BusinessError(check.error);
  await tx.purchaseOrder.delete({ where: { id: poId } });
  logger.info({ poId, poNumber: po.poNumber }, 'Purchase order draft deleted');
  return { id: poId, poNumber: po.poNumber };
}

/**
 * Cancel a PO. Tidak menyentuh STT yang sudah terbentuk (STT independen).
 * Tidak ada GL/stock impact untuk dibatalkan. Draf tidak dibatalkan (hapus).
 */
export async function cancelPurchaseOrderInTx(tx: Tx, poId: string) {
  const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new BusinessError('PO tidak ditemukan.');
  const cancellable = checkPurchaseOrderCancellable(po);
  if (!cancellable.ok) throw new BusinessError(cancellable.error);

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
 * Edit a PO. Draf (bukan menunggu persetujuan) selalu bisa; PO Dipesan hanya
 * selama terbuka (tidak batal / ditutup) dan belum ada STT maupun PI yang
 * mereferensikannya. Nomor PO & status tetap; item diganti seluruhnya dan
 * total dihitung ulang. Tanpa GL/stok.
 */
export async function updatePurchaseOrderInTx(tx: Tx, poId: string, body: SubmitPurchaseOrderInput) {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: { select: { qtyReceived: true } } },
  });
  if (!po) throw new BusinessError('PO tidak ditemukan.');

  const lifecycle = checkPurchaseOrderEditableLifecycle(po);
  if (!lifecycle.ok) throw new BusinessError(lifecycle.error);
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
  await assertWarehouse(tx, body.warehouseId);

  const totals = computePurchaseOrderTotals(body.items, body.otherCosts ?? 0);
  await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } });
  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: {
      ...headerData(body, totals),
      date: parsedDate,
      fiscalYearId: fiscalYear.id,
      items: { create: toItemRows(body.items, totals.lines) },
    },
  });

  logger.info(
    { poId, poNumber: po.poNumber, grandTotal: totals.grandTotal.toNumber(), lines: body.items.length },
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
  if (po.status !== 'Submitted') throw new BusinessError('Hanya PO yang sudah dipesan yang bisa ditutup.');
  const check = checkPurchaseOrderClosable(po, reason);
  if (!check.ok) throw new BusinessError(check.error);

  const updated = await tx.purchaseOrder.update({
    where: { id: poId },
    data: { closedAt: new Date(), closeReason: reason.trim() },
  });
  logger.info({ poId, poNumber: po.poNumber }, 'Purchase order short-closed');
  return updated;
}
