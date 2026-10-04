/**
 * Loads STT/PO references for purchase-invoice lines and runs the pure
 * three-way match (services/threeWayMatch.ts). Read-only.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { effectiveQuantity } from './purchaseInvoiceCalc';
import { computeThreeWayMatch, type MatchLineInput, type MatchResult } from './threeWayMatch';

type Db = Prisma.TransactionClient | typeof prisma;

/** Minimal invoice-line shape — matches both the create payload and stored rows. */
export interface MatchInvoiceLine {
  id?: string;
  itemName?: string | null;
  unit?: string | null;
  quantity: number | string | { toString(): string };
  timbanganDiterima?: number | string | { toString(): string } | null;
  rate: number | string | { toString(): string };
  discount?: number | string | { toString(): string } | null;
  goodsReceiptItemId?: string | null;
}

const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v.toString()));

export async function matchPurchaseInvoiceLines(db: Db, lines: MatchInvoiceLine[]): Promise<MatchResult> {
  const grIds = [...new Set(lines.map((l) => l.goodsReceiptItemId).filter((x): x is string => !!x))];
  const grItems = grIds.length
    ? await db.goodsReceiptItem.findMany({
        where: { id: { in: grIds } },
        select: {
          id: true,
          quantity: true,
          goodsReceipt: { select: { sttNumber: true } },
          purchaseOrderItem: {
            select: {
              id: true,
              quantity: true,
              estimatedRate: true,
              discount: true,
              purchaseOrder: { select: { poNumber: true } },
            },
          },
        },
      })
    : [];
  const byId = new Map(grItems.map((g) => [g.id, g]));

  const inputs: MatchLineInput[] = lines.map((l, idx) => {
    const gr = l.goodsReceiptItemId ? byId.get(l.goodsReceiptItemId) : undefined;
    const po = gr?.purchaseOrderItem ?? null;
    const timb = l.timbanganDiterima == null ? null : num(l.timbanganDiterima);
    const qty = effectiveQuantity({ quantity: num(l.quantity), timbanganDiterima: timb }).toNumber();
    const disc = num(l.discount);
    return {
      key: l.id ?? l.goodsReceiptItemId ?? String(idx),
      itemName: l.itemName ?? '',
      unit: l.unit ?? null,
      invoiceQty: qty,
      invoiceUnitPrice: num(l.rate) * (1 - disc / 100),
      receiptQty: gr ? num(gr.quantity) : null,
      sttNumber: gr?.goodsReceipt.sttNumber ?? null,
      poItemId: po?.id ?? null,
      poNumber: po?.purchaseOrder.poNumber ?? null,
      orderedQty: po ? num(po.quantity) : null,
      poUnitPrice: po ? num(po.estimatedRate) * (1 - num(po.discount) / 100) : null,
    };
  });

  return computeThreeWayMatch(inputs);
}
