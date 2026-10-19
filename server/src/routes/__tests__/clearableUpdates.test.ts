/**
 * Edit forms must be able to clear optional text fields: null/'' clears, an omitted field keeps
 * the stored value (party NPWP, invoice terms/due date, inventory item category/description).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    party: { update: vi.fn() },
    salesInvoice: { findUnique: vi.fn(), update: vi.fn() },
    purchaseInvoice: { findUnique: vi.fn(), update: vi.fn() },
    inventoryItem: { update: vi.fn() },
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

import partiesRouter from '../parties';
import salesRouter from '../sales';
import purchaseRouter from '../purchase';
import itemsRouter from '../inventory/items';

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as express.Request & { user?: { userId: string; role: string } }).user = { userId: 'u1', role: 'Admin' };
    next();
  });
  app.use('/parties', partiesRouter);
  app.use('/sales/invoices', salesRouter);
  app.use('/purchase/invoices', purchaseRouter);
  app.use('/inventory/items', itemsRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

const put = (path: string, body: unknown) =>
  fetch(`${base}${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const lastData = (fn: { mock: { calls: unknown[][] } }) => (fn.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.party.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 'p1', ...data }));
  prismaMock.inventoryItem.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 'i1', ...data }));
  for (const m of [prismaMock.salesInvoice, prismaMock.purchaseInvoice]) {
    m.findUnique.mockResolvedValue({ id: 'inv-1', status: 'Submitted' });
    m.update.mockImplementation(async ({ data }: { data: object }) => ({ id: 'inv-1', ...data }));
  }
});

describe('PUT /parties/:id', () => {
  it('clears NPWP when the form sends null or an empty string', async () => {
    expect((await put('/parties/p1', { name: 'PT A', taxId: null })).status).toBe(200);
    expect(lastData(prismaMock.party.update).taxId).toBeNull();
    await put('/parties/p1', { name: 'PT A', taxId: '', phone: '', address: '  ' });
    expect(lastData(prismaMock.party.update)).toMatchObject({ taxId: null, phone: null, address: null });
  });

  it('keeps NPWP when the field is omitted and trims a new value', async () => {
    await put('/parties/p1', { name: 'PT A' });
    expect(lastData(prismaMock.party.update).taxId).toBeUndefined();
    await put('/parties/p1', { taxId: ' 01.234 ' });
    expect(lastData(prismaMock.party.update).taxId).toBe('01.234');
  });
});

describe('PUT /sales/invoices/:id and /purchase/invoices/:id', () => {
  it.each([
    ['/sales/invoices/inv-1', prismaMock.salesInvoice],
    ['/purchase/invoices/inv-1', prismaMock.purchaseInvoice],
  ])('%s clears terms and due date with null, keeps omitted fields', async (path, model) => {
    expect((await put(path, { notes: 'catatan', dueDate: null, terms: null })).status).toBe(200);
    expect(lastData(model.update)).toEqual({ notes: 'catatan', dueDate: null, terms: null });
    await put(path, { notes: '' });
    expect(lastData(model.update)).toEqual({ notes: null });
  });

  it('rejects an invalid due date and non-string terms', async () => {
    expect((await put('/sales/invoices/inv-1', { dueDate: 'bukan-tanggal' })).status).toBe(400);
    expect((await put('/purchase/invoices/inv-1', { terms: 30 })).status).toBe(400);
    expect(prismaMock.salesInvoice.update).not.toHaveBeenCalled();
    expect(prismaMock.purchaseInvoice.update).not.toHaveBeenCalled();
  });
});

describe('PUT /inventory/items/:id', () => {
  it('clears category, description and the inventory account', async () => {
    expect((await put('/inventory/items/i1', { name: 'Beras', category: null, description: '', accountId: null })).status).toBe(200);
    expect(lastData(prismaMock.inventoryItem.update)).toMatchObject({ category: null, description: null, accountId: null });
  });

  it('keeps category and description when omitted', async () => {
    await put('/inventory/items/i1', { name: 'Beras' });
    const data = lastData(prismaMock.inventoryItem.update);
    expect(data.category).toBeUndefined();
    expect(data.description).toBeUndefined();
  });
});
