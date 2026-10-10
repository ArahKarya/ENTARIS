import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    purchaseInvoice: { findUnique: vi.fn(), update: vi.fn() },
    paymentAllocation: { findMany: vi.fn() },
  },
}));
vi.mock('../../lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../middleware/auth', () => ({
  requireCap: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/approvalGate', () => ({ needsApproval: vi.fn(async () => false), queueApproval: vi.fn(), approvalsLink: vi.fn() }));
vi.mock('../../services/notificationService', () => ({ notifyAdmins: vi.fn() }));
vi.mock('../../services/threeWayMatchLoad', () => ({ matchPurchaseInvoiceLines: vi.fn(async () => null) }));

import purchaseRouter from '../purchase';
import { PAYMENT_ALLOCATION_PAYMENT_SELECT } from '../../services/paymentAllocationDetail';

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: 'u1', role: 'Admin' };
    next();
  });
  app.use('/purchase/invoices', purchaseRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/purchase/invoices`;
});
afterAll(() => {
  server.close();
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /purchase/invoices/:id', () => {
  it('selects the same payment allocation fields as the sales invoice detail', async () => {
    prismaMock.purchaseInvoice.findUnique.mockResolvedValue({ id: 'pi-1', items: [], terms: 'Net 30' });
    prismaMock.paymentAllocation.findMany.mockResolvedValue([
      { id: 'a1', payment: { id: 'pay-1', account: { accountNumber: '1.1.2', name: 'Bank BRI' }, splits: [] } },
    ]);
    const res = await fetch(`${base}/pi-1`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.terms).toBe('Net 30');
    expect(body.paymentAllocations[0].payment.account.accountNumber).toBe('1.1.2');
    expect(prismaMock.paymentAllocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { invoiceType: 'PurchaseInvoice', invoiceId: 'pi-1' },
        include: { payment: { select: PAYMENT_ALLOCATION_PAYMENT_SELECT } },
      }),
    );
  });
});

describe('PUT /purchase/invoices/:id', () => {
  const put = (body: unknown) =>
    fetch(`${base}/pi-1`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  beforeEach(() => {
    prismaMock.purchaseInvoice.findUnique.mockResolvedValue({ id: 'pi-1', status: 'Submitted' });
    prismaMock.purchaseInvoice.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 'pi-1', ...data }));
  });

  it('saves Termin (terms) instead of dropping it', async () => {
    const res = await put({ notes: 'n', terms: '  Net 30 ' });
    expect(res.status).toBe(200);
    expect(prismaMock.purchaseInvoice.update).toHaveBeenCalledWith({ where: { id: 'pi-1' }, data: { notes: 'n', terms: 'Net 30' } });
  });

  it('clears terms with an empty string and leaves them untouched when omitted', async () => {
    await put({ terms: '' });
    expect(prismaMock.purchaseInvoice.update.mock.calls[0][0].data).toEqual({ terms: null });
    await put({ notes: 'x' });
    expect(prismaMock.purchaseInvoice.update.mock.calls[1][0].data).not.toHaveProperty('terms');
  });
});

describe('CreatePurchaseInvoiceSchema', () => {
  it('keeps terms so create and approval payloads persist Termin', async () => {
    const { CreatePurchaseInvoiceSchema } = await import('../../utils/schemas');
    const parsed = CreatePurchaseInvoiceSchema.safeParse({
      date: '2026-10-10',
      partyId: 'party-1',
      terms: 'Net 14',
      items: [{ itemName: 'Gabah', quantity: 1, rate: 1000 }],
    });
    expect(parsed.success && parsed.data.terms).toBe('Net 14');
  });
});
