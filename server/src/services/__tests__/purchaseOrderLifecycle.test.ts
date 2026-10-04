import { describe, it, expect } from 'vitest';
import {
  checkPurchaseOrderCancellable,
  checkPurchaseOrderDeletable,
  checkPurchaseOrderEditableLifecycle,
  checkPurchaseOrderReceivable,
  checkPurchaseOrderSubmittable,
  derivePurchaseOrderDisplayStatus,
  matchesApprovalRule,
  resolveSubmitOutcome,
} from '../purchaseOrderLifecycle';

const draft = { status: 'Draft', approvalStatus: null };
const pending = { status: 'Draft', approvalStatus: 'Pending' };
const rejected = { status: 'Draft', approvalStatus: 'Rejected' };
const ordered = { status: 'Submitted', approvalStatus: null, closedAt: null };

describe('display status', () => {
  it('maps draft / pending / ordered / cancelled', () => {
    expect(derivePurchaseOrderDisplayStatus(draft)).toBe('Draft');
    expect(derivePurchaseOrderDisplayStatus(rejected)).toBe('Draft');
    expect(derivePurchaseOrderDisplayStatus(pending)).toBe('PendingApproval');
    expect(derivePurchaseOrderDisplayStatus(ordered)).toBe('Submitted');
    expect(derivePurchaseOrderDisplayStatus({ status: 'Cancelled' })).toBe('Cancelled');
  });
  it('legacy PO without approvalStatus is "Dipesan"', () => {
    expect(derivePurchaseOrderDisplayStatus({ status: 'Submitted' })).toBe('Submitted');
  });
});

describe('submit (Ajukan)', () => {
  it('only a non-pending draft can be submitted', () => {
    expect(checkPurchaseOrderSubmittable(draft).ok).toBe(true);
    expect(checkPurchaseOrderSubmittable(rejected).ok).toBe(true);
    expect(checkPurchaseOrderSubmittable(pending).ok).toBe(false);
    expect(checkPurchaseOrderSubmittable(ordered).ok).toBe(false);
  });

  it('rule match → pending draft; no match → Submitted', () => {
    expect(resolveSubmitOutcome(true)).toEqual({ status: 'Draft', approvalStatus: 'Pending' });
    expect(resolveSubmitOutcome(false)).toEqual({ status: 'Submitted', approvalStatus: null });
  });

  it('rule matching uses grandTotal ≥ minAmount on active rules', () => {
    const rules = [{ minAmount: '10000000', isActive: true }];
    expect(matchesApprovalRule(rules, 10_000_000)).toBe(true);
    expect(matchesApprovalRule(rules, 9_999_999.99)).toBe(false);
    expect(matchesApprovalRule([{ minAmount: 0, isActive: false }], 5)).toBe(false);
    expect(matchesApprovalRule([], 1e12)).toBe(false);
  });
});

describe('edit / delete / cancel rules per status', () => {
  it('pending approval blocks edit and delete', () => {
    expect(checkPurchaseOrderEditableLifecycle(pending).ok).toBe(false);
    expect(checkPurchaseOrderDeletable(pending).ok).toBe(false);
  });
  it('drafts (incl. rejected) are editable and deletable', () => {
    for (const po of [draft, rejected]) {
      expect(checkPurchaseOrderEditableLifecycle(po).ok).toBe(true);
      expect(checkPurchaseOrderDeletable(po).ok).toBe(true);
    }
  });
  it('ordered POs are cancelled, not deleted; drafts are deleted, not cancelled', () => {
    expect(checkPurchaseOrderDeletable(ordered).ok).toBe(false);
    expect(checkPurchaseOrderCancellable(ordered).ok).toBe(true);
    expect(checkPurchaseOrderCancellable(draft).ok).toBe(false);
    expect(checkPurchaseOrderCancellable({ status: 'Cancelled' }).ok).toBe(false);
  });
});

describe('receivable (STT source)', () => {
  it('only Submitted, not closed', () => {
    expect(checkPurchaseOrderReceivable(ordered).ok).toBe(true);
    expect(checkPurchaseOrderReceivable(draft).ok).toBe(false);
    expect(checkPurchaseOrderReceivable(pending).ok).toBe(false);
    expect(checkPurchaseOrderReceivable({ status: 'Cancelled' }).ok).toBe(false);
    expect(checkPurchaseOrderReceivable({ status: 'Submitted', closedAt: new Date() }).ok).toBe(false);
  });
});
