/**
 * Integration test: cancelling a sales invoice closes its COGS backfill queue.
 *
 * Bug (PMD, Okt 2026): SI-202603-0002 was cancelled but its backfill queue stayed
 * PartiallySettled, so every later Production Run kept posting "Auto-settle COGS" JVs that
 * moved inventory value into HPP for a sale that no longer exists (GL Persediaan went negative).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitSalesInvoiceInTx } from '../../services/salesInvoiceSubmit';
import { cancelSalesInvoiceInTx } from '../../services/invoiceCancellation';
import { settleCogsBackfillForItem } from '../../services/cogsBackfillService';
import { reverseCogsSettlementsByTrigger } from '../../services/cogsBackfillReverse';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });
  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user.');
  userId = user.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Service invoice + a manual inventory item with a deferred-COGS queue row against it. */
async function seedInvoiceWithQueue(tx: Tx, tag: string, qty: number, costAtSale: number) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const party = await tx.party.create({
    data: { name: `TEST-CUST-${tag}-${stamp}`, partyType: 'Customer', isActive: true },
  });
  const item = await tx.inventoryItem.create({
    data: { code: `TEST-CBQ-${tag}-${stamp}`, name: `CBQ ${tag} ${stamp}`, unit: 'kg', currentStock: 0, averageCost: costAtSale, isActive: true },
  });
  const invoice = await submitSalesInvoiceInTx(
    tx,
    {
      date: new Date().toISOString().slice(0, 10),
      partyId: party.id,
      items: [{ itemName: `Jasa ${tag}`, itemType: 'service', quantity: 1, rate: 1_000_000 }],
    },
    userId,
  );
  const siItem = await tx.salesInvoiceItem.findFirstOrThrow({ where: { salesInvoiceId: invoice.id } });
  const queue = await tx.cogsBackfillQueue.create({
    data: {
      salesInvoiceId: invoice.id,
      salesInvoiceItemId: siItem.id,
      inventoryItemId: item.id,
      qtyPending: qty,
      qtyOriginal: qty,
      costAtSale,
      fiscalYearId: invoice.fiscalYearId,
    },
  });
  return { invoice, item, queue };
}

d('cancelSalesInvoiceInTx — COGS backfill queue', () => {
  it('cancels auto-settle JVs, deletes settlements and closes the queue', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const { invoice, item, queue } = await seedInvoiceWithQueue(tx, 'CXL', 100, 10_000);

        // Stock-in at a higher cost settles 40 kg → differential 40 × 2.000 = 80.000 (DR HPP / CR Persediaan).
        const settled = await settleCogsBackfillForItem(tx, {
          itemId: item.id, qtyAvailable: 40, unitCostNow: 12_000, fiscalYearId: invoice.fiscalYearId,
          userId, settleDate: new Date(), source: { type: 'StockMovement', refId: `TEST-SM-${item.id}`, refNo: 'TEST-SM' },
        });
        expect(settled?.totalDifferential).toBe(80_000);
        const jeId = settled!.journalEntryId!;
        const qMid = await tx.cogsBackfillQueue.findUniqueOrThrow({ where: { id: queue.id } });
        expect(qMid.status).toBe('PartiallySettled');

        await cancelSalesInvoiceInTx(tx, invoice.id);

        const qAfter = await tx.cogsBackfillQueue.findUniqueOrThrow({ where: { id: queue.id } });
        expect(qAfter.status).toBe('Cancelled');
        expect(await tx.cogsBackfillSettlement.count({ where: { queueId: queue.id } })).toBe(0);

        const je = await tx.journalEntry.findUniqueOrThrow({ where: { id: jeId } });
        expect(je.status).toBe('Cancelled');
        const ale = await tx.accountingLedgerEntry.findMany({ where: { referenceId: jeId } });
        expect(ale.length).toBe(2);
        expect(ale.every((a) => a.isCancelled)).toBe(true);

        // Later stock-in must not settle the closed queue any more.
        const again = await settleCogsBackfillForItem(tx, {
          itemId: item.id, qtyAvailable: 60, unitCostNow: 13_000, fiscalYearId: invoice.fiscalYearId,
          userId, settleDate: new Date(), source: { type: 'StockMovement', refId: `TEST-SM2-${item.id}` },
        });
        expect(again).toBeNull();

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('settler skips a queue whose invoice is cancelled even if the queue is still open (legacy data)', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const { invoice, item, queue } = await seedInvoiceWithQueue(tx, 'LEG', 50, 10_000);
        // Simulate pre-fix data: invoice flipped to Cancelled without touching the queue.
        await tx.salesInvoice.update({ where: { id: invoice.id }, data: { status: 'Cancelled' } });

        const res = await settleCogsBackfillForItem(tx, {
          itemId: item.id, qtyAvailable: 50, unitCostNow: 12_000, fiscalYearId: invoice.fiscalYearId,
          userId, settleDate: new Date(), source: { type: 'StockMovement', refId: `TEST-SM-${item.id}` },
        });
        expect(res).toBeNull();
        const q = await tx.cogsBackfillQueue.findUniqueOrThrow({ where: { id: queue.id } });
        expect(Number(q.qtyPending)).toBe(50);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('reversing the trigger later does not re-open a queue closed by invoice cancel', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const a = await seedInvoiceWithQueue(tx, 'REO', 30, 10_000);
        const refId = `TEST-PR-${a.item.id}`;
        await settleCogsBackfillForItem(tx, {
          itemId: a.item.id, qtyAvailable: 30, unitCostNow: 11_000, fiscalYearId: a.invoice.fiscalYearId,
          userId, settleDate: new Date(), source: { type: 'ProductionRun', refId },
        });
        // Mark queue closed but keep settlement (shape of a JV shared with another invoice).
        await tx.cogsBackfillQueue.update({ where: { id: a.queue.id }, data: { status: 'Cancelled' } });

        await reverseCogsSettlementsByTrigger(tx, 'ProductionRun', refId);
        const q = await tx.cogsBackfillQueue.findUniqueOrThrow({ where: { id: a.queue.id } });
        expect(q.status).toBe('Cancelled');

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('invoice without queue entries cancels as before', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({ data: { name: `TEST-CUST-NOQ-${Date.now()}`, partyType: 'Customer', isActive: true } });
        const invoice = await submitSalesInvoiceInTx(
          tx,
          { date: new Date().toISOString().slice(0, 10), partyId: party.id, items: [{ itemName: 'X', itemType: 'service', quantity: 1, rate: 100 }] },
          userId,
        );
        const r = await cancelSalesInvoiceInTx(tx, invoice.id);
        expect(r.status).toBe('Cancelled');
        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
