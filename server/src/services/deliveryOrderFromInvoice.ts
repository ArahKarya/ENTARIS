import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface CreateDOFromInvoiceInput {
  invoiceId: string;
  date: string;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
}

/**
 * Create a Surat Jalan from an existing sales invoice.
 *
 * Used when staff entered the invoice first (direct-sale path, stock already
 * decremented + COGS journal already posted) and the physical delivery
 * paperwork comes later. Re-running the regular DO submit would double-out
 * stock, so this service explicitly skips inventory mutation.
 *
 * Behavior:
 *   - validates invoice exists, not cancelled, has no DO linked yet
 *   - creates a DeliveryOrder header in Submitted status, linked to the
 *     invoice (invoiceId/invoicedAt set immediately)
 *   - for each inventory line on the invoice, creates a DeliveryOrderItem
 *     whose stockMovementId points at the SM the invoice already wrote
 *     (so the audit trail "this DO ships goods recorded as out by SM-XXX")
 *   - back-links each invoice line to its new DO item (delivery_order_item_id)
 *   - service / non-inventory lines on the invoice are skipped silently —
 *     a Surat Jalan only carries physical goods
 *
 * No stock decrement, no new stockMovements, no GL impact.
 */
export async function createDeliveryOrderFromInvoiceInTx(
  tx: Tx,
  body: CreateDOFromInvoiceInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');

  const invoice = await tx.salesInvoice.findUnique({
    where: { id: body.invoiceId },
    include: {
      items: true,
      customer: true,
    },
  });
  if (!invoice) throw new BusinessError('Invoice tidak ditemukan.');
  if (invoice.status === 'Cancelled') {
    throw new BusinessError(`Invoice ${invoice.invoiceNumber} sudah dibatalkan.`);
  }

  // Guard against making a second DO for the same invoice.
  const existingDO = await tx.deliveryOrder.findFirst({
    where: { invoiceId: invoice.id, status: { not: 'Cancelled' } },
    select: { id: true, doNumber: true },
  });
  if (existingDO) {
    throw new BusinessError(
      `Invoice ${invoice.invoiceNumber} sudah punya surat jalan: ${existingDO.doNumber}.`,
    );
  }

  // Only inventory product lines become DO rows. Service lines are skipped.
  const inventoryLines = invoice.items.filter((it) => it.inventoryItemId);
  if (inventoryLines.length === 0) {
    throw new BusinessError(
      `Invoice ${invoice.invoiceNumber} tidak punya baris barang fisik untuk dikirim.`,
    );
  }

  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
  const doNumber = await generateDocumentNumber(tx, 'DO', parsedDate, fiscalYear.id);

  const deliveryOrder = await tx.deliveryOrder.create({
    data: {
      doNumber,
      date: parsedDate,
      partyId: invoice.partyId,
      status: 'Submitted',
      notes: body.notes || null,
      nomorMobil: body.nomorMobil || null,
      driverName: body.driverName || null,
      recipientName: body.recipientName || null,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      invoiceId: invoice.id,
      invoicedAt: invoice.date,
    },
  });

  // For each inventory line on the invoice: find its existing Out movement
  // (the one created at invoice submit time) and link a new DO item to it.
  for (const line of inventoryLines) {
    const sm = await tx.stockMovement.findFirst({
      where: {
        referenceType: 'SalesInvoice',
        referenceId: invoice.id,
        itemId: line.inventoryItemId!,
        movementType: 'Out',
        isCancelled: false,
        // unique-ish: same line should match by (item, qty); good enough as
        // a per-line locator since invoice submit creates one SM per line.
        quantity: line.quantity,
      },
      select: { id: true },
    });

    const doItem = await tx.deliveryOrderItem.create({
      data: {
        deliveryOrderId: deliveryOrder.id,
        inventoryItemId: line.inventoryItemId!,
        warehouseId: line.warehouseId,
        itemName: line.itemName,
        quantity: line.quantity,
        unit: line.unit,
        description: line.description,
        stockMovementId: sm?.id ?? null,
      },
    });

    // Back-link the invoice line so the invoice drawer shows the new DO.
    await tx.salesInvoiceItem.update({
      where: { id: line.id },
      data: { deliveryOrderItemId: doItem.id },
    });
  }

  logger.info(
    { doId: deliveryOrder.id, doNumber, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, lines: inventoryLines.length },
    'Delivery order created retroactively from existing invoice',
  );

  return deliveryOrder;
}
