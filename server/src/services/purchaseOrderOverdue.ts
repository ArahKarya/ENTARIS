/**
 * PO overdue detection ("Terlambat"): an ordered (Submitted), not short-closed
 * PO whose expected delivery date is before today's business-time-zone
 * calendar day (WIB by default, see utils/listQuery.businessUtcOffset) and
 * that still has at least one line not fully received.
 */
import type { Prisma } from '@prisma/client';
import { businessUtcOffset, localDayRange } from '../utils/listQuery';

type Qty = number | string | { toString(): string };

export interface OverdueCheckPO {
  status: string;
  closedAt: Date | string | null;
  expectedDeliveryDate: Date | string | null;
  items: { quantity: Qty; qtyReceived: Qty }[];
}

function offsetMinutes(offset: string): number {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return sign * (h * 60 + m);
}

/** Calendar day (YYYY-MM-DD) of an instant in the business time zone. */
export function businessDay(at: Date | string, offset: string = businessUtcOffset()): string {
  const t = new Date(at).getTime() + offsetMinutes(offset) * 60_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Today's business-time-zone calendar day. */
export function businessToday(now: Date = new Date(), offset: string = businessUtcOffset()): string {
  return businessDay(now, offset);
}

const num = (v: Qty): number => Number(v.toString());

export function hasOutstandingQty(items: OverdueCheckPO['items']): boolean {
  return items.some((it) => num(it.qtyReceived) < num(it.quantity) - 0.0005);
}

export function isPurchaseOrderOverdue(
  po: OverdueCheckPO,
  today: string,
  offset: string = businessUtcOffset(),
): boolean {
  if (po.status !== 'Submitted' || po.closedAt || !po.expectedDeliveryDate) return false;
  if (businessDay(po.expectedDeliveryDate, offset) >= today) return false;
  return hasOutstandingQty(po.items);
}

/** Whole calendar days between the expected delivery day and today (≥ 0). */
export function daysOverdue(
  expected: Date | string,
  today: string,
  offset: string = businessUtcOffset(),
): number {
  const a = Date.parse(`${businessDay(expected, offset)}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Prisma filter equivalent of isPurchaseOrderOverdue. `itemQuantity` is the
 * purchase_order_items.quantity column reference.
 */
export function purchaseOrderOverdueWhere(
  now: Date,
  itemQuantity: Prisma.FieldRef<'PurchaseOrderItem', 'Decimal'>,
  offset: string = businessUtcOffset(),
): Prisma.PurchaseOrderWhereInput {
  const startOfToday = localDayRange(businessToday(now, offset), undefined, offset).gte!;
  return {
    status: 'Submitted',
    closedAt: null,
    expectedDeliveryDate: { lt: startOfToday },
    items: { some: { qtyReceived: { lt: itemQuantity } } },
  };
}
