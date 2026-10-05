import { describe, it, expect, vi, beforeEach } from 'vitest';

const { submitRun, markPosted, returnDraft, db } = vi.hoisted(() => {
  const db: any = {
    approvalRequest: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    $transaction: undefined,
  };
  db.$transaction = (fn: any) => fn(db);
  return { submitRun: vi.fn(), markPosted: vi.fn(), returnDraft: vi.fn(), db };
});
vi.mock('../notificationService', () => ({ notifyAdmins: vi.fn(), notifyUsers: vi.fn().mockResolvedValue(1) }));
vi.mock('../productionRunSubmit', () => ({ submitProductionRunInTx: (...a: unknown[]) => submitRun(...a) }));
vi.mock('../productionRunDraft', () => ({
  markDraftPostedByApproval: (...a: unknown[]) => markPosted(...a),
  returnDraftToEditable: (...a: unknown[]) => returnDraft(...a),
}));
vi.mock('../productionRunEdit', () => ({ editProductionRunInTx: vi.fn() }));
vi.mock('../purchaseInvoiceRevise', () => ({ revisePurchaseInvoiceInTx: vi.fn() }));
vi.mock('../purchaseInvoiceSubmit', () => ({ submitPurchaseInvoiceInTx: vi.fn() }));
vi.mock('../salesReturnSubmit', () => ({ submitSalesReturnInTx: vi.fn() }));
vi.mock('../deliveryOrderSubmit', () => ({ submitDeliveryOrderInTx: vi.fn() }));
vi.mock('../purchaseOrderSubmit', () => ({ applyPurchaseOrderApprovalDecisionInTx: vi.fn() }));
vi.mock('../../lib/prisma', () => ({ prisma: db }));

import { decideApproval } from '../approvalDecision';

const PAYLOAD = {
  date: '2026-10-01',
  inputs: [{ itemId: 'gkp', quantity: 1000 }],
  outputs: [{ itemId: 'brs', quantity: 600 }],
};
const REQ = { id: 'req-1', status: 'Pending', documentType: 'ProductionRun', requestedBy: 'u1', payload: PAYLOAD };

beforeEach(() => {
  vi.clearAllMocks();
  db.approvalRequest.findUnique.mockResolvedValue(REQ);
  db.approvalRequest.update.mockResolvedValue({});
  submitRun.mockResolvedValue({ id: 'run-1', runNumber: 'PR-1' });
});

describe('decideApproval x production draft', () => {
  it('approve creates the run and marks the linked draft Posted in the same tx', async () => {
    const r = await decideApproval({ requestId: 'req-1', action: 'approve', actorUserId: 'admin' });
    expect(r).toMatchObject({ ok: true, status: 'Approved', docNumber: 'PR-1' });
    expect(markPosted).toHaveBeenCalledWith(db, 'req-1', { id: 'run-1', number: 'PR-1' }, 'admin');
  });

  it('legacy approval (no draft linked) still approves and creates the run', async () => {
    markPosted.mockResolvedValue(0);
    const r = await decideApproval({ requestId: 'req-1', action: 'approve', actorUserId: 'admin' });
    expect(r.ok).toBe(true);
    expect(submitRun).toHaveBeenCalledTimes(1);
  });

  it('reject returns the draft to Draft with the note', async () => {
    returnDraft.mockResolvedValue(true);
    const r = await decideApproval({ requestId: 'req-1', action: 'reject', actorUserId: 'admin', note: 'Data keliru' });
    expect(r).toMatchObject({ ok: true, status: 'Rejected' });
    expect(returnDraft).toHaveBeenCalledWith(db, 'req-1', 'Data keliru', 'Ditolak');
    expect(submitRun).not.toHaveBeenCalled();
  });

  it('revise on a draft-linked request is finalised as Rejected (draft is the edit surface)', async () => {
    returnDraft.mockResolvedValue(true);
    const r = await decideApproval({ requestId: 'req-1', action: 'revise', actorUserId: 'admin', note: 'Cek bahan' });
    expect(r).toMatchObject({ ok: true, status: 'Rejected' });
    expect(db.approvalRequest.update.mock.calls[0][0].data.status).toBe('Rejected');
  });

  it('revise on a legacy request (no draft) keeps NeedsRevision', async () => {
    returnDraft.mockResolvedValue(false);
    const r = await decideApproval({ requestId: 'req-1', action: 'revise', actorUserId: 'admin', note: 'Cek bahan' });
    expect(r).toMatchObject({ ok: true, status: 'NeedsRevision' });
  });

  it('approve failure leaves the request Pending and the draft untouched', async () => {
    submitRun.mockRejectedValue(new Error('Stok tidak cukup'));
    const r = await decideApproval({ requestId: 'req-1', action: 'approve', actorUserId: 'admin' });
    expect(r.ok).toBe(false);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });
});
