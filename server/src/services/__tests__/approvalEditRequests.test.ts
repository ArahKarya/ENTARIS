import { describe, it, expect, vi, beforeEach } from 'vitest';

const { notifyAdmins, notifyUsers, editRun, reviseInv, db } = vi.hoisted(() => ({
  notifyAdmins: vi.fn().mockResolvedValue(1),
  notifyUsers: vi.fn().mockResolvedValue(1),
  editRun: vi.fn(),
  reviseInv: vi.fn(),
  db: { approvalRequest: {}, productionRun: {}, purchaseInvoice: {}, inventoryItem: {}, user: {}, transactionAttachment: {}, $transaction: undefined } as any,
}));
vi.mock('../notificationService', () => ({ notifyAdmins: (...a: any[]) => notifyAdmins(...a), notifyUsers: (...a: any[]) => notifyUsers(...a) }));
vi.mock('../productionRunEdit', () => ({ editProductionRunInTx: (...a: any[]) => editRun(...a) }));
vi.mock('../purchaseInvoiceRevise', () => ({ revisePurchaseInvoiceInTx: (...a: any[]) => reviseInv(...a) }));
vi.mock('../purchaseInvoiceSubmit', () => ({ submitPurchaseInvoiceInTx: vi.fn() }));
vi.mock('../productionRunSubmit', () => ({ submitProductionRunInTx: vi.fn() }));
vi.mock('../salesReturnSubmit', () => ({ submitSalesReturnInTx: vi.fn() }));
vi.mock('../deliveryOrderSubmit', () => ({ submitDeliveryOrderInTx: vi.fn() }));
vi.mock('../purchaseOrderSubmit', () => ({ applyPurchaseOrderApprovalDecisionInTx: vi.fn() }));
vi.mock('../permissionService', () => ({ hasCap: vi.fn() }));

vi.mock('../../lib/prisma', () => ({ prisma: db }));

import {
  buildProductionBefore, buildProductionEditComparison, buildInvoiceBefore, buildInvoiceReviseComparison,
  buildApprovalComparison, splitStoredPayload, queueEditApproval, PENDING_EXISTS_MESSAGE, BEFORE_KEY,
} from '../approvalEditRequests';
import { decideApproval } from '../approvalDecision';
import { GATED_DOCUMENT_TYPES, GATED_LABELS } from '../approvalGate';

const RUN = {
  runNumber: 'PR-0001', date: new Date('2026-10-01T00:00:00Z'), isCancelled: false, computedHpp: 8000,
  items: [
    { itemId: 'gkp', lineType: 'Input', quantity: 1000, item: { name: 'GKP' } },
    { itemId: 'brs', lineType: 'Output', quantity: 600, item: { name: 'Beras' } },
    { itemId: 'sek', lineType: 'ByProduct', quantity: 200, item: { name: 'Sekam' } },
  ],
};
const RUN_BODY = {
  date: '2026-10-01', inputs: [{ itemId: 'gkp', quantity: 1100 }],
  outputs: [{ itemId: 'brs', quantity: 600 }, { itemId: 'sek', quantity: 200, isByProduct: true, unitPrice: 100 }],
};
const PI = {
  invoiceNumber: 'PI-1', status: 'Submitted', grandTotal: 1000000,
  items: [{ id: '11111111-1111-4111-8111-111111111111', itemName: 'GKP', quantity: 100, unit: 'kg', rate: 10000 }],
};
const PI_BODY = { lines: [{ itemId: '11111111-1111-4111-8111-111111111111', newRate: 10500 }], reason: 'Koreksi harga supplier' };

describe('comparison builders', () => {
  it('production: flags only changed rows and sums totals', () => {
    const cmp = buildProductionEditComparison(buildProductionBefore(RUN), RUN_BODY);
    const summary = cmp.sections[0].rows;
    expect(summary.find((r) => r.label === 'Total input')).toMatchObject({ before: 1000, after: 1100, changed: true });
    expect(summary.find((r) => r.label === 'Tanggal produksi')?.changed).toBe(false);
    expect(summary.find((r) => r.label === 'Yield produk utama')).toMatchObject({ before: 60, after: 54.55 });
    const out = cmp.sections[2].rows;
    expect(out.map((r) => r.changed)).toEqual([false, false]);
    expect(out[1].label).toContain('produk sampingan');
  });
  it('production: item removed/added shows 0 on the missing side', () => {
    const cmp = buildProductionEditComparison(buildProductionBefore(RUN, { x: 'Jagung' }), { ...RUN_BODY, inputs: [{ itemId: 'x', quantity: 5 }] });
    const rows = cmp.sections[1].rows;
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'GKP', before: 1000, after: 0, changed: true }),
      expect.objectContaining({ label: 'Jagung', before: 0, after: 5, changed: true }),
    ]));
  });
  it('invoice: computes delta and new total', () => {
    const cmp = buildInvoiceReviseComparison(buildInvoiceBefore(PI), PI_BODY);
    expect(cmp.sections[0].rows[0]).toMatchObject({ before: 1000000, after: 1050000, changed: true });
    expect(cmp.sections[0].rows[1].after).toBe(50000);
    expect(cmp.sections[1].rows[0]).toMatchObject({ before: 10000, after: 10500, changed: true });
  });
  it('dispatcher returns null for creation types or missing snapshot, and uses request number', () => {
    expect(buildApprovalComparison({ documentType: 'ProductionRun', documentId: null, documentNumber: null, payload: {} })).toBeNull();
    expect(buildApprovalComparison({ documentType: 'ProductionRunEdit', documentId: 'r', documentNumber: 'PR-0001', payload: RUN_BODY })).toBeNull();
    const payload = { ...PI_BODY, [BEFORE_KEY]: buildInvoiceBefore(PI) };
    expect(buildApprovalComparison({ documentType: 'PurchaseInvoiceRevisePrice', documentId: 'i', documentNumber: 'PI-1', payload })).toMatchObject({ targetNumber: 'PI-1', targetId: 'i' });
  });
  it('registers new gated types with labels', () => {
    expect(GATED_DOCUMENT_TYPES).toContain('ProductionRunEdit');
    expect(GATED_LABELS.PurchaseInvoiceRevisePrice).toBe('Revisi Harga Invoice Pembelian');
    expect(GATED_LABELS.ProductionRunEdit).toBe('Edit Data Produksi');
  });
});

describe('queueEditApproval', () => {
  let created: any;
  beforeEach(() => {
    vi.clearAllMocks();
    created = null;
    db.approvalRequest.findFirst = vi.fn().mockResolvedValue(null);
    db.approvalRequest.create = vi.fn(async ({ data }: any) => (created = { id: 'req1', ...data }));
    db.productionRun.findUnique = vi.fn().mockResolvedValue(RUN);
    db.purchaseInvoice.findUnique = vi.fn().mockResolvedValue(PI);
    db.inventoryItem.findMany = vi.fn().mockResolvedValue([{ id: 'gkp', name: 'GKP' }]);
    db.user.findUnique = vi.fn().mockResolvedValue({ fullName: 'Staf' });
    db.$transaction = vi.fn(async (fn: any) => fn(db));
  });

  it('queues a production edit with target number at request time, snapshot and notification', async () => {
    const r = await queueEditApproval(db, { documentType: 'ProductionRunEdit', targetId: 'run1', body: RUN_BODY, rawBody: RUN_BODY, userId: 'u1' });
    expect(r).toMatchObject({ ok: true, status: 202, body: { pendingApproval: true } });
    expect(created).toMatchObject({ documentType: 'ProductionRunEdit', documentId: 'run1', documentNumber: 'PR-0001', amount: 1100, requestedBy: 'u1', status: 'Pending' });
    expect(created.payload.date).toBe('2026-10-01');
    expect(created.payload[BEFORE_KEY].inputs[0].quantity).toBe(1000);
    expect(notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ type: 'approval_pending', excludeUserId: 'u1' }));
  });
  it('queues PI revise with new total as amount', async () => {
    const r = await queueEditApproval(db, { documentType: 'PurchaseInvoiceRevisePrice', targetId: 'inv1', body: PI_BODY, rawBody: PI_BODY, userId: 'u2' });
    expect(r.ok).toBe(true);
    expect(created).toMatchObject({ documentNumber: 'PI-1', amount: 1050000 });
  });
  it.each([
    ['cancelled run', () => (db.productionRun.findUnique = vi.fn().mockResolvedValue({ ...RUN, isCancelled: true })), 'ProductionRunEdit', 400],
    ['missing run', () => (db.productionRun.findUnique = vi.fn().mockResolvedValue(null)), 'ProductionRunEdit', 404],
    ['cancelled invoice', () => (db.purchaseInvoice.findUnique = vi.fn().mockResolvedValue({ ...PI, status: 'Cancelled' })), 'PurchaseInvoiceRevisePrice', 400],
    ['draft invoice', () => (db.purchaseInvoice.findUnique = vi.fn().mockResolvedValue({ ...PI, status: 'Draft' })), 'PurchaseInvoiceRevisePrice', 400],
  ] as const)('rejects invalid target (%s) without queueing', async (_n, arrange, type, status) => {
    arrange();
    const r = await queueEditApproval(db, { documentType: type, targetId: 't', body: type === 'ProductionRunEdit' ? RUN_BODY : PI_BODY, rawBody: {}, userId: 'u' });
    expect(r).toMatchObject({ ok: false, status });
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
  });
  it('rejects unknown invoice line', async () => {
    const r = await queueEditApproval(db, { documentType: 'PurchaseInvoiceRevisePrice', targetId: 'i', body: { ...PI_BODY, lines: [{ itemId: 'zzz', newRate: 1 }] }, rawBody: {}, userId: 'u' });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });
  it('refuses a second pending request (409) and does not notify', async () => {
    db.approvalRequest.findFirst = vi.fn().mockResolvedValue({ id: 'old' });
    const r = await queueEditApproval(db, { documentType: 'ProductionRunEdit', targetId: 'run1', body: RUN_BODY, rawBody: RUN_BODY, userId: 'u1' });
    expect(r).toEqual({ ok: false, status: 409, error: PENDING_EXISTS_MESSAGE });
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });
});

describe('decideApproval for edit types', () => {
  let stored: any;
  beforeEach(() => {
    vi.clearAllMocks();
    db.approvalRequest.update = vi.fn().mockResolvedValue({});
    db.$transaction = vi.fn(async (fn: any) => fn({ tx: true }));
    db.transactionAttachment.updateMany = vi.fn();
  });
  const req = (documentType: string, payload: any, documentId: string | null = 'tid') => ({
    id: 'r1', documentType, documentId, documentNumber: 'N-1', payload, status: 'Pending', requestedBy: 'requester',
  });

  it('production edit: strips snapshot, validates, runs edit with requester as actor, keeps same number', async () => {
    stored = req('ProductionRunEdit', { ...RUN_BODY, [BEFORE_KEY]: buildProductionBefore(RUN) });
    db.approvalRequest.findUnique = vi.fn().mockResolvedValue(stored);
    editRun.mockResolvedValue({ id: 'tid', runNumber: 'PR-0001' });
    const r = await decideApproval({ requestId: 'r1', action: 'approve', actorUserId: 'admin' });
    expect(r).toMatchObject({ ok: true, status: 'Approved', docNumber: 'PR-0001' });
    const [, id, body, actor] = editRun.mock.calls[0];
    expect(id).toBe('tid'); expect(actor).toBe('requester');
    expect(body.inputs[0].quantity).toBe(1100);
    expect(body[BEFORE_KEY]).toBeUndefined();
    expect(db.approvalRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'Approved', approvedBy: 'admin', documentId: 'tid', documentNumber: 'PR-0001' }) }));
  });
  it('PI revise: runs revise with stored lines/reason', async () => {
    db.approvalRequest.findUnique = vi.fn().mockResolvedValue(req('PurchaseInvoiceRevisePrice', { ...PI_BODY, [BEFORE_KEY]: buildInvoiceBefore(PI) }, 'inv1'));
    reviseInv.mockResolvedValue({ id: 'inv1', invoiceNumber: 'PI-1' });
    const r = await decideApproval({ requestId: 'r1', action: 'approve', actorUserId: 'admin' });
    expect(r.ok).toBe(true);
    expect(reviseInv.mock.calls[0][1]).toEqual({ invoiceId: 'inv1', lines: PI_BODY.lines, reason: PI_BODY.reason });
    expect(reviseInv.mock.calls[0][2]).toBe('requester');
  });
  it('state changed since request: error surfaces and request stays Pending', async () => {
    db.approvalRequest.findUnique = vi.fn().mockResolvedValue(req('ProductionRunEdit', RUN_BODY));
    const { BusinessError } = await import('../../utils/errors');
    editRun.mockRejectedValue(new BusinessError('Proses produksi yang sudah dibatalkan tidak bisa diedit.'));
    const r = await decideApproval({ requestId: 'r1', action: 'approve', actorUserId: 'admin' });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('dibatalkan') });
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });
  it('invalid stored payload fails with clear error', async () => {
    db.approvalRequest.findUnique = vi.fn().mockResolvedValue(req('PurchaseInvoiceRevisePrice', { lines: [], reason: 'x' }));
    const r = await decideApproval({ requestId: 'r1', action: 'approve', actorUserId: 'admin' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Payload revisi harga tidak valid');
    expect(reviseInv).not.toHaveBeenCalled();
  });
  it('splitStoredPayload tolerates garbage', () => {
    expect(splitStoredPayload(null)).toEqual({ body: {}, before: null });
  });
});
