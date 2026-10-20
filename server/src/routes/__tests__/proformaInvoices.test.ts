import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';

const db = vi.hoisted(() => {
  const tx: any = {
    proformaInvoice: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    payment: { count: vi.fn() },
    salesInvoice: { findUnique: vi.fn() },
    quotation: { findUnique: vi.fn() },
    salesOrder: { findUnique: vi.fn() },
    journalEntry: { create: vi.fn() },
    accountingLedgerEntry: { create: vi.fn() },
    stockMovement: { create: vi.fn() },
  };
  return { ...tx, $transaction: vi.fn(async (fn: any) => fn(tx)), _tx: tx };
});
vi.mock('../../lib/prisma', () => ({ prisma: db }));
vi.mock('../../middleware/auth', () => ({
  requireCap: () => (_q: any, _r: any, n: any) => n(),
}));
vi.mock('../../utils/fiscalYear', () => ({ getOpenFiscalYear: vi.fn(async () => ({ id: 'fy-1' })) }));
vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: vi.fn(async () => 'PRO-202610-0001') }));

import router from '../proformaInvoices';

let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { userId: 'u-1' }; next(); });
  app.use('/api/proforma-invoices', router);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

// Pembungkus gaya supertest: request().post(url).send(body) -> { status, body }
const call = async (method: string, url: string, body?: unknown) => {
  const r = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as any };
};
const request = () => ({
  post: (u: string) => ({ send: (b?: unknown) => call('POST', u, b ?? {}) }),
  put: (u: string) => ({ send: (b?: unknown) => call('PUT', u, b ?? {}) }),
  patch: (u: string) => call('PATCH', u),
  delete: (u: string) => call('DELETE', u),
});

const ITEM = { itemName: 'Beras', quantity: 10, rate: 100000, unit: 'Kg' };
const BODY = { date: '2026-10-20', validUntil: '2026-11-20', partyId: 'cust-1', items: [ITEM] };

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: any) => fn(db._tx));
});

describe('POST /proforma-invoices', () => {
  it('membuat Draft dengan total dihitung server dan TANPA efek jurnal/stok', async () => {
    db._tx.proformaInvoice.create.mockImplementation(async ({ data }: any) => ({ id: 'pf-1', ...data }));
    const res = await request().post('/api/proforma-invoices').send({ ...BODY, requestedAmount: 300000 });
    expect(res.status).toBe(201);
    const data = db._tx.proformaInvoice.create.mock.calls[0][0].data;
    expect(data.status).toBe('Draft');
    expect(data.proformaNumber).toBe('PRO-202610-0001');
    expect(data.grandTotal).toBe(1000000);
    expect(data.requestedAmount).toBe(300000);
    expect(db._tx.journalEntry.create).not.toHaveBeenCalled();
    expect(db._tx.accountingLedgerEntry.create).not.toHaveBeenCalled();
    expect(db._tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('menolak tagihan melebihi total proforma', async () => {
    const res = await request().post('/api/proforma-invoices').send({ ...BODY, requestedAmount: 1000001 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/melebihi total/i);
    expect(db._tx.proformaInvoice.create).not.toHaveBeenCalled();
  });

  it('menolak customer berbeda dari Sales Order asal', async () => {
    db._tx.salesOrder.findUnique.mockResolvedValue({ id: 'so-1', status: 'Submitted', partyId: 'cust-OTHER' });
    const res = await request().post('/api/proforma-invoices').send({ ...BODY, salesOrderId: 'so-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tidak sama dengan Sales Order/i);
  });

  it('menolak penawaran Rejected sebagai sumber', async () => {
    db._tx.quotation.findUnique.mockResolvedValue({ id: 'q-1', status: 'Rejected', partyId: 'cust-1' });
    const res = await request().post('/api/proforma-invoices').send({ ...BODY, quotationId: 'q-1' });
    expect(res.status).toBe(400);
  });

  it('menolak validUntil sebelum tanggal', async () => {
    const res = await request().post('/api/proforma-invoices').send({ ...BODY, validUntil: '2026-10-01' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /:id/cancel', () => {
  it('ditolak bila masih ada uang muka aktif tertaut', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue({ id: 'pf-1', status: 'Sent' });
    db._tx.payment.count.mockResolvedValue(2);
    const res = await request().patch('/api/proforma-invoices/pf-1/cancel');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/2 uang muka aktif/);
    expect(db._tx.proformaInvoice.update).not.toHaveBeenCalled();
  });

  it('ditolak bila sudah Converted', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue({ id: 'pf-1', status: 'Converted' });
    const res = await request().patch('/api/proforma-invoices/pf-1/cancel');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dikonversi/i);
  });

  it('berhasil bila tanpa DP', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue({ id: 'pf-1', status: 'Sent' });
    db._tx.payment.count.mockResolvedValue(0);
    db._tx.proformaInvoice.update.mockResolvedValue({ id: 'pf-1', status: 'Cancelled' });
    const res = await request().patch('/api/proforma-invoices/pf-1/cancel');
    expect(res.status).toBe(200);
    expect(db._tx.proformaInvoice.update.mock.calls[0][0].data.status).toBe('Cancelled');
  });
});

describe('POST /:id/link (konversi)', () => {
  const SENT = { id: 'pf-1', status: 'Sent', partyId: 'cust-1', salesInvoiceId: null };

  it('Sent + invoice milik customer sama -> Converted', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue(SENT);
    db._tx.salesInvoice.findUnique.mockResolvedValue({ id: 'si-1', partyId: 'cust-1', status: 'Draft' });
    db._tx.proformaInvoice.findFirst.mockResolvedValue(null);
    db._tx.proformaInvoice.update.mockResolvedValue({ id: 'pf-1', status: 'Converted' });
    const res = await request().post('/api/proforma-invoices/pf-1/link').send({ salesInvoiceId: 'si-1' });
    expect(res.status).toBe(200);
    const data = db._tx.proformaInvoice.update.mock.calls[0][0].data;
    expect(data.status).toBe('Converted');
    expect(data.salesInvoiceId).toBe('si-1');
  });

  it('menolak Draft (belum dikirim)', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue({ ...SENT, status: 'Draft' });
    const res = await request().post('/api/proforma-invoices/pf-1/link').send({ salesInvoiceId: 'si-1' });
    expect(res.status).toBe(400);
  });

  it('menolak invoice customer lain', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue(SENT);
    db._tx.salesInvoice.findUnique.mockResolvedValue({ id: 'si-1', partyId: 'cust-X', status: 'Draft' });
    const res = await request().post('/api/proforma-invoices/pf-1/link').send({ salesInvoiceId: 'si-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Customer/);
  });

  it('menolak invoice yang sudah dipakai proforma lain (satu invoice satu proforma)', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue(SENT);
    db._tx.salesInvoice.findUnique.mockResolvedValue({ id: 'si-1', partyId: 'cust-1', status: 'Draft' });
    db._tx.proformaInvoice.findFirst.mockResolvedValue({ proformaNumber: 'PRO-202610-0009' });
    const res = await request().post('/api/proforma-invoices/pf-1/link').send({ salesInvoiceId: 'si-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PRO-202610-0009/);
  });

  it('menolak invoice yang sudah dibatalkan', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue(SENT);
    db._tx.salesInvoice.findUnique.mockResolvedValue({ id: 'si-1', partyId: 'cust-1', status: 'Cancelled' });
    const res = await request().post('/api/proforma-invoices/pf-1/link').send({ salesInvoiceId: 'si-1' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /:id dan DELETE /:id', () => {
  it('edit ditolak jika bukan Draft', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue({ id: 'pf-1', status: 'Sent', partyId: 'cust-1' });
    const res = await request().put('/api/proforma-invoices/pf-1').send(BODY);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Draft/);
  });

  it('customer tidak bisa diganti jika proforma berasal dari SO', async () => {
    db._tx.proformaInvoice.findUnique.mockResolvedValue({ id: 'pf-1', status: 'Draft', partyId: 'cust-1', salesOrderId: 'so-1' });
    const res = await request().put('/api/proforma-invoices/pf-1').send({ ...BODY, partyId: 'cust-2' });
    expect(res.status).toBe(400);
  });

  it('hapus ditolak jika bukan Draft', async () => {
    db.proformaInvoice = { findUnique: vi.fn().mockResolvedValue({ id: 'pf-1', status: 'Sent' }), delete: vi.fn() };
    const res = await request().delete('/api/proforma-invoices/pf-1');
    expect(res.status).toBe(400);
    expect(db.proformaInvoice.delete).not.toHaveBeenCalled();
  });
});
