import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';

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

  // PO Khusus → validate supplier exists & is a supplier party
  if (body.partyId) {
    const party = await tx.party.findUnique({ where: { id: body.partyId } });
    if (!party) throw new BusinessError('Supplier tidak ditemukan.');
    if (!party.isActive) throw new BusinessError(`Supplier '${party.name}' tidak aktif.`);
    if (party.partyType !== 'Supplier' && party.partyType !== 'Both') {
      throw new BusinessError(`Party '${party.name}' bukan supplier.`);
    }
  }

  const poNumber = await generateDocumentNumber(tx, 'PO', parsedDate, fiscalYear.id);

  // Compute total estimated
  let totalEstimated = new Decimal(0);
  for (const it of body.items) {
    totalEstimated = totalEstimated.plus(
      new Decimal(it.quantity).times(new Decimal(it.estimatedRate ?? 0)),
    );
  }

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
      items: {
        create: body.items.map((it) => ({
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
        })),
      },
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
