/**
 * Pure rules for Purchase Orders (no DB access): receipt status derivation,
 * edit eligibility and short-close eligibility.
 *
 * PO tetap dokumen planning — aturan di sini tidak menyentuh GL/stok.
 */
import Decimal from 'decimal.js';

export const PO_RECEIPT_STATUSES = ['Unreceived', 'Partial', 'Full', 'Cancelled', 'Closed'] as const;
export type PurchaseOrderReceiptStatus = (typeof PO_RECEIPT_STATUSES)[number];

/** number | string | Prisma.Decimal (anything with a numeric toString). */
type Num = number | string | { toString(): string };

export interface ReceiptItemLike {
  quantity: Num;
  qtyReceived: Num;
}

export interface PoStateLike {
  status: string;
  closedAt?: Date | string | null;
}

const dec = (v: Num) => new Decimal(String(v));

/**
 * Cancelled → "Cancelled", closed (short-close) → "Closed"; otherwise derived
 * from items: nothing received → Unreceived, every line received ≥ ordered →
 * Full, anything in between → Partial. A PO without items counts as Unreceived.
 */
export function derivePurchaseOrderReceiptStatus(
  po: PoStateLike,
  items: ReceiptItemLike[],
): PurchaseOrderReceiptStatus {
  if (po.status === 'Cancelled') return 'Cancelled';
  if (po.closedAt) return 'Closed';
  if (items.length === 0) return 'Unreceived';
  if (!items.some((i) => dec(i.qtyReceived).gt(0))) return 'Unreceived';
  return items.every((i) => dec(i.qtyReceived).gte(dec(i.quantity))) ? 'Full' : 'Partial';
}

/** Remaining qty for one line, never negative (over-receipt counts as 0). */
export function remainingQty(item: ReceiptItemLike): number {
  const rest = dec(item.quantity).minus(dec(item.qtyReceived));
  return rest.gt(0) ? rest.toNumber() : 0;
}

export type RuleResult = { ok: true } | { ok: false; error: string };

export interface EditCheckInput extends PoStateLike {
  items: Array<{ qtyReceived: Num }>;
  /** Non-cancelled STT referencing this PO. */
  linkedReceiptCount: number;
  /** Non-cancelled PI referencing this PO. */
  linkedInvoiceCount?: number;
}

export function checkPurchaseOrderEditable(po: EditCheckInput): RuleResult {
  if (po.status === 'Cancelled') return { ok: false, error: 'PO yang sudah dibatalkan tidak bisa diubah.' };
  if (po.closedAt) return { ok: false, error: 'PO yang sudah ditutup tidak bisa diubah.' };
  if (po.linkedReceiptCount > 0 || po.items.some((i) => dec(i.qtyReceived).gt(0))) {
    return {
      ok: false,
      error: 'PO sudah memiliki STT/penerimaan barang, tidak bisa diubah. Buat PO baru atau tutup PO ini.',
    };
  }
  if ((po.linkedInvoiceCount ?? 0) > 0) {
    return { ok: false, error: 'PO sudah dipakai di Purchase Invoice, tidak bisa diubah.' };
  }
  return { ok: true };
}

export const CLOSE_REASON_MIN = 5;
export const CLOSE_REASON_MAX = 500;

export interface CloseCheckInput extends PoStateLike {
  items: ReceiptItemLike[];
}

export function checkPurchaseOrderClosable(po: CloseCheckInput, reason: unknown): RuleResult {
  if (po.status === 'Cancelled') return { ok: false, error: 'PO sudah dibatalkan.' };
  if (po.closedAt) return { ok: false, error: 'PO sudah ditutup.' };
  if (derivePurchaseOrderReceiptStatus(po, po.items) === 'Full') {
    return { ok: false, error: 'PO sudah diterima penuh, tidak perlu ditutup.' };
  }
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < CLOSE_REASON_MIN) {
    return { ok: false, error: `Alasan penutupan wajib diisi (minimal ${CLOSE_REASON_MIN} karakter).` };
  }
  if (text.length > CLOSE_REASON_MAX) {
    return { ok: false, error: `Alasan penutupan maksimal ${CLOSE_REASON_MAX} karakter.` };
  }
  return { ok: true };
}

export interface PoItemRef {
  id: string;
  inventoryItemId: string | null;
  itemName?: string | null;
}

export interface ReceiptLineRef {
  inventoryItemId: string;
  itemName?: string | null;
  purchaseOrderItemId?: string | null;
}

/**
 * Lines of an STT that point at a PO but carry no PO-line link: match each one
 * to the PO line with the same inventoryItemId. Exactly one candidate → link it;
 * none → leave unlinked (extra item outside the PO); several → throw (ambiguous).
 * Returns the PO-item id (or null) per input line, same order.
 */
export function resolvePoItemLinks(
  lines: ReceiptLineRef[],
  poItems: PoItemRef[],
  onAmbiguous: (line: ReceiptLineRef) => Error,
): Array<string | null> {
  return lines.map((line) => {
    if (line.purchaseOrderItemId) return line.purchaseOrderItemId;
    const candidates = poItems.filter((pi) => pi.inventoryItemId && pi.inventoryItemId === line.inventoryItemId);
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1) throw onAmbiguous(line);
    return null;
  });
}
