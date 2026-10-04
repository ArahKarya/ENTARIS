import { describe, expect, it } from 'vitest';
import { purchaseOrderActions, receiptProgress } from './purchaseOrderActions';

const all = { canEditPO: true, canReceive: true, canClose: true, hasLinkedReceipts: false };

describe('purchaseOrderActions', () => {
  it('offers everything on an open, unreceived PO', () => {
    expect(purchaseOrderActions({ status: 'Submitted', receiptStatus: 'Unreceived' }, all)).toEqual({
      receive: true,
      edit: true,
      duplicate: true,
      close: true,
    });
  });

  it('blocks edit once something is received or an STT is linked', () => {
    expect(purchaseOrderActions({ status: 'Submitted', receiptStatus: 'Partial' }, all).edit).toBe(false);
    expect(purchaseOrderActions({ status: 'Submitted', receiptStatus: 'Unreceived' }, { ...all, hasLinkedReceipts: true }).edit).toBe(false);
  });

  it('hides receive/close when fully received, closed or cancelled; duplicate stays', () => {
    const full = purchaseOrderActions({ status: 'Submitted', receiptStatus: 'Full' }, all);
    expect([full.receive, full.close, full.duplicate]).toEqual([false, false, true]);
    const closed = purchaseOrderActions({ status: 'Submitted', closedAt: '2026-10-04', receiptStatus: 'Closed' }, all);
    expect([closed.receive, closed.edit, closed.close]).toEqual([false, false, false]);
    const cancelled = purchaseOrderActions({ status: 'Cancelled', receiptStatus: 'Cancelled' }, all);
    expect([cancelled.receive, cancelled.edit, cancelled.close, cancelled.duplicate]).toEqual([false, false, false, true]);
  });

  it('respects permissions', () => {
    const none = { canEditPO: false, canReceive: false, canClose: false, hasLinkedReceipts: false };
    expect(purchaseOrderActions({ status: 'Submitted', receiptStatus: 'Unreceived' }, none)).toEqual({
      receive: false,
      edit: false,
      duplicate: false,
      close: false,
    });
  });
});

describe('receiptProgress', () => {
  it('computes remaining and percent', () => {
    expect(receiptProgress(10, 4)).toEqual({ remaining: 6, percent: 40, done: false });
    expect(receiptProgress(10, 0)).toEqual({ remaining: 10, percent: 0, done: false });
  });

  it('caps over-receipt at 100% with nothing remaining', () => {
    expect(receiptProgress(10, 12)).toEqual({ remaining: 0, percent: 100, done: true });
  });

  it('handles zero / non-finite quantities', () => {
    expect(receiptProgress(0, 0)).toEqual({ remaining: 0, percent: 0, done: false });
    expect(receiptProgress(Number.NaN, 1)).toEqual({ remaining: 0, percent: 0, done: false });
  });
});
