/**
 * Pure lifecycle rules for Purchase Orders (no DB access). Unlike the payload-held gate of
 * PI/Produksi, a PO (no GL/stock effect) is saved as `Draft` at once; a pending approval keeps it
 * `Draft` with approvalStatus 'Pending' (ApprovalRequest.documentId set, payload null).
 *
 *   Draft ──Ajukan──► (rule matches) Draft+Pending ──approve──► Submitted
 *     ▲                     │ reject/revise
 *     └──── Draft+Rejected ◄┘
 *   Draft ──Ajukan──► (no rule) Submitted
 *
 * The PO number is assigned at creation, drafts included (NOT NULL/unique column); deleting a
 * draft may leave a numbering gap, which is acceptable since a PO has no GL.
 */
import type { RuleResult } from './purchaseOrderRules';

export const PO_APPROVAL_PENDING = 'Pending';
export const PO_APPROVAL_REJECTED = 'Rejected';

export type PurchaseOrderDisplayStatus = 'Draft' | 'PendingApproval' | 'Submitted' | 'Cancelled';

export interface PoLifecycleLike {
  status: string;
  approvalStatus?: string | null;
  closedAt?: Date | string | null;
}

export function isPendingApproval(po: PoLifecycleLike): boolean {
  return po.status === 'Draft' && po.approvalStatus === PO_APPROVAL_PENDING;
}

/** Status shown in the UI ("Menunggu Persetujuan" is a Draft with a pending request). */
export function derivePurchaseOrderDisplayStatus(po: PoLifecycleLike): PurchaseOrderDisplayStatus {
  if (isPendingApproval(po)) return 'PendingApproval';
  if (po.status === 'Draft' || po.status === 'Submitted' || po.status === 'Cancelled') return po.status;
  return 'Submitted';
}

export function checkPurchaseOrderSubmittable(po: PoLifecycleLike): RuleResult {
  if (po.status !== 'Draft') return { ok: false, error: 'Hanya PO berstatus Draf yang bisa diajukan.' };
  if (isPendingApproval(po)) return { ok: false, error: 'PO sedang menunggu persetujuan.' };
  return { ok: true };
}

export function checkPurchaseOrderDeletable(po: PoLifecycleLike): RuleResult {
  if (po.status !== 'Draft') {
    return { ok: false, error: 'Hanya PO Draf yang bisa dihapus. PO yang sudah dipesan dibatalkan.' };
  }
  if (isPendingApproval(po)) {
    return { ok: false, error: 'PO sedang menunggu persetujuan, tidak bisa dihapus.' };
  }
  return { ok: true };
}

/** Pending approval blocks editing (the approver must see what was submitted). */
export function checkPurchaseOrderEditableLifecycle(po: PoLifecycleLike): RuleResult {
  if (isPendingApproval(po)) {
    return { ok: false, error: 'PO sedang menunggu persetujuan, tidak bisa diubah.' };
  }
  return { ok: true };
}

/** Cancel ("Batalkan") applies to ordered POs only; drafts are deleted instead. */
export function checkPurchaseOrderCancellable(po: PoLifecycleLike): RuleResult {
  if (po.status === 'Cancelled') return { ok: false, error: 'PO sudah dibatalkan.' };
  if (po.status === 'Draft') return { ok: false, error: 'PO Draf tidak dibatalkan. Hapus draf.' };
  return { ok: true };
}

/** Usable as STT/PI source: ordered (Submitted), not short-closed. */
export function checkPurchaseOrderReceivable(po: PoLifecycleLike): RuleResult {
  if (po.status === 'Cancelled') {
    return { ok: false, error: 'Purchase Order sudah dibatalkan, tidak bisa dipakai untuk STT.' };
  }
  if (po.status !== 'Submitted') {
    return { ok: false, error: 'Purchase Order belum dipesan (masih Draf / menunggu persetujuan).' };
  }
  if (po.closedAt) return { ok: false, error: 'Purchase Order sudah ditutup, tidak bisa dipakai untuk STT.' };
  return { ok: true };
}

export interface ApprovalRuleLike {
  minAmount: number | string | { toString(): string };
  isActive?: boolean;
}

/** Does any active rule apply to this grand total (grandTotal ≥ minAmount)? */
export function matchesApprovalRule(rules: ApprovalRuleLike[], grandTotal: number): boolean {
  return rules.some((r) => r.isActive !== false && Number(String(r.minAmount)) <= grandTotal);
}

export const PO_INCREASE_NEEDS_APPROVAL_ERROR =
  'Kenaikan nilai PO melebihi batas persetujuan. Ajukan ulang (batalkan PO ini dan buat PO baru, atau turunkan nilainya).';

/**
 * Editing an ordered (Submitted) PO must not bypass approval: raising the
 * grand total to a value that an active rule covers is rejected. Decreases,
 * equal totals, increases with no matching rule and draft edits stay allowed.
 * (Chosen over re-routing to approval: a rejected re-approval would otherwise
 * un-order a PO that the supplier already received at the old value.)
 */
export function checkSubmittedEditTotal(input: {
  status: string;
  previousGrandTotal: number;
  newGrandTotal: number;
  rules: ApprovalRuleLike[];
}): RuleResult {
  if (input.status !== 'Submitted') return { ok: true };
  if (!(input.newGrandTotal > input.previousGrandTotal)) return { ok: true };
  if (!matchesApprovalRule(input.rules, input.newGrandTotal)) return { ok: true };
  return { ok: false, error: PO_INCREASE_NEEDS_APPROVAL_ERROR };
}

/** Outcome of "Ajukan". */
export function resolveSubmitOutcome(ruleMatched: boolean): { status: 'Draft' | 'Submitted'; approvalStatus: string | null } {
  return ruleMatched
    ? { status: 'Draft', approvalStatus: PO_APPROVAL_PENDING }
    : { status: 'Submitted', approvalStatus: null };
}
