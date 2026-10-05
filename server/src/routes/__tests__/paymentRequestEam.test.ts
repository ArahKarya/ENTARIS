import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const can = vi.fn(async (role: string, mod: string, action: string) => role === 'Accountant' && mod === 'payment_request' && action === 'edit');
vi.mock('../../services/permissionService', () => ({ can: (...a: [string, string, string]) => can(...a) }));
const loadGaBills = vi.fn(async (..._a: unknown[]) => [
  { kind: 'VEHICLE_TAX', id: '1', ref: 'PKB', date: new Date('2026-09-01'), assetCode: null, assetName: 'A', description: 'd1', amount: 100, journalEntry: null, purchaseInvoice: null },
  { kind: 'SERVICE_LOG', id: '2', ref: 'S', date: new Date('2026-09-02'), assetCode: null, assetName: 'B', description: 'd2', amount: 50, journalEntry: null, purchaseInvoice: null },
  { kind: 'SERVICE_LOG', id: '3', ref: 'S', date: new Date('2026-09-03'), assetCode: null, assetName: 'C', description: 'd3', amount: 25, journalEntry: { id: 'j' }, purchaseInvoice: null },
]);
const payGaBill = vi.fn(async (..._a: unknown[]) => ({ journal: 'JE-1' }));
const cancelGaBill = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock('../../services/gaFinance', () => ({ ACC_VEHICLE_TAX: '6.41', ACC_VEHICLE_MAINTENANCE: '6.42' }));
vi.mock('../../services/gaVehicleServiceJournal', () => ({}));
vi.mock('../../services/gaBillQueue', async (orig) => ({
  ...(await orig<typeof import('../../services/gaBillQueue')>()),
  loadGaBills: (...a: unknown[]) => loadGaBills(...a),
  payGaBill: (...a: unknown[]) => payGaBill(...a),
  cancelGaBill: (...a: unknown[]) => cancelGaBill(...a),
}));

import eamRouter from '../paymentRequestEam';

let server: Server;
let base = '';
let role = 'Accountant';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: 'u1', role };
    next();
  });
  app.use('/eam', eamRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/eam`;
});
afterAll(() => {
  server.close();
});

const call = (path: string, init?: RequestInit) => fetch(`${base}${path}`, { headers: { 'content-type': 'application/json' }, ...init });

describe('/payment-requests/eam permission gating', () => {
  it.each(['StaffProduksi', 'Viewer'])('%s gets 403 on every endpoint', async (r) => {
    role = r;
    expect((await call('/')).status).toBe(403);
    expect((await call('/summary')).status).toBe(403);
    expect((await call('/VEHICLE_TAX/1/pay', { method: 'POST', body: '{}' })).status).toBe(403);
    expect((await call('/VEHICLE_TAX/1/cancel', { method: 'POST' })).status).toBe(403);
    expect(payGaBill).not.toHaveBeenCalled();
    expect(cancelGaBill).not.toHaveBeenCalled();
  });
});

describe('/payment-requests/eam (finance)', () => {
  it('lists the pending queue with {data,total,page,limit} paging', async () => {
    role = 'Accountant';
    const body = await (await call('/?limit=1&page=2&sort=amount')).json();
    expect(body).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(body.data.map((b: any) => b.id)).toEqual(['1']);
    expect(loadGaBills).toHaveBeenLastCalledWith('ALL', false);
  });

  it('posting=all loads paid bills too and rejects unknown filters', async () => {
    role = 'Accountant';
    expect((await (await call('/?posting=all')).json()).total).toBe(3);
    expect(loadGaBills).toHaveBeenLastCalledWith('ALL', true);
    expect((await call('/?kind=NOPE')).status).toBe(400);
  });

  it('summary reports queue badge and matched rows', async () => {
    role = 'Accountant';
    expect(await (await call('/summary?kind=SERVICE_LOG')).json()).toEqual({
      pendingCount: 2,
      pendingAmount: 150,
      matchedCount: 1,
      matchedAmount: 50,
    });
  });

  it('pay validates the body and delegates to the shared posting service', async () => {
    role = 'Accountant';
    expect((await call('/VEHICLE_TAX/1/pay', { method: 'POST', body: JSON.stringify({ method: 'CHEQUE' }) })).status).toBe(400);
    const res = await call('/VEHICLE_TAX/1/pay', {
      method: 'POST',
      body: JSON.stringify({ method: 'JOURNAL', accountId: 'a', creditAccountId: 'c' }),
    });
    expect(res.status).toBe(200);
    expect(payGaBill).toHaveBeenCalledWith('VEHICLE_TAX', '1', expect.objectContaining({ method: 'JOURNAL' }), 'u1');
    expect((await call('/SERVICE_LOG/2/cancel', { method: 'POST' })).status).toBe(200);
    expect(cancelGaBill).toHaveBeenCalledWith('SERVICE_LOG', '2');
  });
});
