/**
 * Which follow-up actions a Purchase Order offers (drawer footer + row ⋯ menu).
 * Mirrors the server rules (services/purchaseOrderRules.ts); the server stays
 * the authority and rejects anything not allowed with a clear message.
 */

export type PurchaseOrderReceiptStatus = 'Unreceived' | 'Partial' | 'Full' | 'Cancelled' | 'Closed';

export interface PurchaseOrderActionInput {
  status: string;
  closedAt?: string | null;
  receiptStatus?: PurchaseOrderReceiptStatus | string | null;
}

export interface PurchaseOrderActionPerms {
  /** can('purchase_order', 'edit') */
  canEditPO: boolean;
  /** can('goods_receipt', 'edit') */
  canReceive: boolean;
  /** cap('doc.cancel') — same gate as cancel */
  canClose: boolean;
  /** Any STT already references this PO. */
  hasLinkedReceipts: boolean;
}

export interface PurchaseOrderActionSet {
  receive: boolean;
  edit: boolean;
  duplicate: boolean;
  close: boolean;
}

export function purchaseOrderActions(
  po: PurchaseOrderActionInput,
  perms: PurchaseOrderActionPerms,
): PurchaseOrderActionSet {
  const open = po.status === 'Submitted' && !po.closedAt;
  const notFull = po.receiptStatus !== 'Full';
  const untouched = !perms.hasLinkedReceipts && (po.receiptStatus ?? 'Unreceived') === 'Unreceived';
  return {
    receive: open && notFull && perms.canReceive,
    edit: open && untouched && perms.canEditPO,
    duplicate: perms.canEditPO,
    close: open && notFull && perms.canClose,
  };
}

export interface ReceiptProgress {
  remaining: number;
  /** 0..100, rounded; over-receipt caps at 100. */
  percent: number;
  done: boolean;
}

export function receiptProgress(ordered: number, received: number): ReceiptProgress {
  const o = Number.isFinite(ordered) ? ordered : 0;
  const r = Number.isFinite(received) ? received : 0;
  const remaining = Math.max(0, Math.round((o - r) * 1000) / 1000);
  const percent = o > 0 ? Math.min(100, Math.max(0, Math.round((r / o) * 100))) : 0;
  return { remaining, percent, done: o > 0 && r >= o };
}
