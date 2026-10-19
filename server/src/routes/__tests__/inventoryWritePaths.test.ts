/**
 * Write paths that used to leave UI cells empty: manual stock movement GL
 * lines without description, and stock opname without a header warehouse.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { makeAutoTx } from '../../__tests__/helpers/autoTx';

let current = makeAutoTx();
vi.mock('../../lib/prisma', () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(current.tx)) },
}));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../middleware/auth', () => ({ requireCap: () => (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: vi.fn(async (_tx, prefix: string) => `${prefix}-202610-0001`) }));
vi.mock('../../utils/accountBalance', () => ({
  updateAccountBalance: vi.fn(async () => undefined),
  recalculateAccountBalances: vi.fn(async () => undefined),
}));
vi.mock('../../utils/journalCancel', () => ({ cancelJournalsByPrefix: vi.fn(async () => undefined) }));
vi.mock('../../services/systemAccounts', () => ({
  systemAccounts: {
    getAccount: vi.fn(async (role: string) => ({ id: { INVENTORY: 'acc-inv', OPENING_EQUITY: 'acc-3.1', INVENTORY_VARIANCE: 'acc-var' }[role] })),
  },
}));
vi.mock('../../services/cogsBackfillService', () => ({ settleCogsBackfillForItem: vi.fn(async () => undefined) }));
vi.mock('../../services/cogsBackfillReverse', () => ({ reverseCogsSettlementsByTrigger: vi.fn(async () => undefined) }));
vi.mock('../../services/averageCostRecompute', () => ({ recomputeAverageCostFromReplay: vi.fn(async () => undefined) }));

import movementsRouter from '../inventory/movements';
import stockOpnameRouter from '../stockOpname';

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { userId: 'u1', role: 'Admin' };
    next();
  });
  app.use('/movements', movementsRouter);
  app.use('/stock-opname', stockOpnameRouter);
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

const send = (method: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const ITEM_ID = '0b8a3f0e-0000-4000-8000-0000000000a1';
const ITEM = { id: ITEM_ID, name: 'Beras', unit: 'Kg', isActive: true, accountId: null, currentStock: '50', averageCost: '9000' };
const WH = '0b8a3f0e-0000-4000-8000-000000000001';

const journalHandlers = {
  'fiscalYear.findFirst': () => ({ id: 'fy-2026' }),
  'inventoryItem.findUnique': () => ITEM,
  'journalEntry.create': ({ data }: any) => ({ id: 'je-1', ...data, items: data.items.create }),
};

describe('manual stock movement GL descriptions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST writes the narration on both journal lines and both ledger rows', async () => {
    current = makeAutoTx(journalHandlers);
    const res = await send('POST', '/movements', {
      itemId: ITEM_ID, warehouseId: WH, movementType: 'In', quantity: 10, unitCost: 1000, date: '2026-10-10', notes: 'stok awal',
    });
    expect(res.status).toBe(201);
    const narration = 'Stok Masuk: Beras 10 Kg - stok awal';
    const je = current.fn('journalEntry.create').mock.calls[0]![0].data;
    expect(je.narration).toBe(narration);
    expect(je.items.create).toEqual([
      { accountId: 'acc-inv', debit: 10000, credit: 0, description: narration },
      { accountId: 'acc-3.1', debit: 0, credit: 10000, description: narration },
    ]);
    const ledger = current.fn('accountingLedgerEntry.createMany').mock.calls[0]![0].data;
    expect(ledger.map((l: any) => [l.accountId, l.debit, l.credit, l.description])).toEqual([
      ['acc-inv', 10000, 0, narration],
      ['acc-3.1', 0, 10000, narration],
    ]);
  });

  it('PUT writes the "(Edit)" narration on the re-posted journal and ledger', async () => {
    current = makeAutoTx({
      ...journalHandlers,
      'stockMovement.findUnique': () => ({
        id: 'sm-1', itemId: ITEM_ID, warehouseId: WH, movementType: 'In', quantity: '10', isCancelled: false,
        referenceType: null, journalEntryId: null, fiscalYearId: 'fy-2026', movementNumber: 'SM-1', item: ITEM,
      }),
    });
    const res = await send('PUT', '/movements/sm-1', { movementType: 'Out', quantity: 4, unitCost: 1000, date: '2026-10-10' });
    expect(res.status).toBe(200);
    const narration = 'Stok Keluar: Beras 4 Kg (Edit)';
    const je = current.fn('journalEntry.create').mock.calls[0]![0].data;
    expect(je.items.create).toEqual([
      { accountId: 'acc-3.1', debit: 4000, credit: 0, description: narration },
      { accountId: 'acc-inv', debit: 0, credit: 4000, description: narration },
    ]);
    const ledger = current.fn('accountingLedgerEntry.createMany').mock.calls[0]![0].data;
    expect(ledger.every((l: any) => l.description === narration)).toBe(true);
  });
});

describe('stock opname header warehouse', () => {
  beforeEach(() => vi.clearAllMocks());

  const opnameTx = (systemStock: string) =>
    makeAutoTx({
      'fiscalYear.findFirst': () => ({ id: 'fy-2026' }),
      'inventoryItem.findMany': () => [{ ...ITEM, currentStock: systemStock }],
      'inventoryStock.findMany': () => [{ itemId: ITEM_ID, currentStock: systemStock }],
      'stockOpname.create': ({ data }: any) => ({ id: 'so-1', ...data }),
    });

  it('stores the warehouse on the header and lines even when nothing differs', async () => {
    current = opnameTx('10');
    const res = await send('POST', '/stock-opname', {
      date: '2026-10-10', warehouseId: WH, items: [{ itemId: ITEM_ID, actualStock: 10 }],
    });
    expect(res.status).toBe(201);
    const data = current.fn('stockOpname.create').mock.calls[0]![0].data;
    expect(data.warehouseId).toBe(WH);
    expect(data.items.create[0]).toMatchObject({ itemId: ITEM_ID, difference: 0, warehouseId: WH });
    expect(current.fn('stockMovement.create')).not.toHaveBeenCalled();
  });

  it('falls back to the default warehouse when none is picked', async () => {
    current = makeAutoTx({
      'fiscalYear.findFirst': () => ({ id: 'fy-2026' }),
      'inventoryItem.findMany': () => [{ ...ITEM, currentStock: '10' }],
      'warehouse.findFirst': () => ({ id: 'wh-default' }),
      'stockOpname.create': ({ data }: any) => ({ id: 'so-1', ...data }),
    });
    const res = await send('POST', '/stock-opname', { date: '2026-10-10', items: [{ itemId: ITEM_ID, actualStock: 12 }] });
    expect(res.status).toBe(201);
    expect(current.fn('stockOpname.create').mock.calls[0]![0].data.warehouseId).toBe('wh-default');
    expect(current.fn('stockMovement.create').mock.calls[0]![0].data.warehouseId).toBe('wh-default');
  });
});
