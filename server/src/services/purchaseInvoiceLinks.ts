// Pure helpers for PI document links (PO header link, line type).

export type PurchaseLineType = 'product' | 'service';

/**
 * PO for a PI built from STT(s): set only when every linked STT points to the
 * same PO. Mixed POs or an STT without PO leave the header null (the STT link
 * still carries the relation).
 */
export function resolvePurchaseOrderIdFromReceipts(
  receipts: Array<{ purchaseOrderId: string | null | undefined }>,
): string | null {
  if (receipts.length === 0) return null;
  const ids = new Set(receipts.map((r) => r.purchaseOrderId ?? null));
  if (ids.size !== 1) return null;
  const [only] = ids;
  return only ?? null;
}

/** Line type: inventory/STT lines are always goods; otherwise trust the client flag. */
export function resolvePurchaseLineType(line: {
  itemType?: string | null;
  inventoryItemId?: string | null;
  goodsReceiptItemId?: string | null;
}): PurchaseLineType {
  if (line.inventoryItemId || line.goodsReceiptItemId) return 'product';
  return line.itemType === 'service' ? 'service' : 'product';
}

/**
 * Prisma where for non-cancelled PIs tied to a PO: header link, header STT
 * link, or any line billed from an STT of that PO.
 */
export function purchaseInvoicesOfPoWhere(poId: string) {
  return {
    status: { not: 'Cancelled' as const },
    OR: [
      { purchaseOrderId: poId },
      { goodsReceipts: { some: { purchaseOrderId: poId } } },
      { items: { some: { goodsReceiptItem: { goodsReceipt: { purchaseOrderId: poId } } } } },
    ],
  };
}
