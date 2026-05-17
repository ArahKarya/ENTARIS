/**
 * Integration tests for GoodsReceipt (STT/BPB) submit + cancel.
 *
 * Contract:
 *   - Submit: stok In + averageCost recompute + JE (DR Persediaan / CR
 *     Hutang Belum Tagih @ provisional cost). Provisional = lockedUnitCost
 *     kalau diisi, kalau 0 pakai item averageCost saat itu.
 *   - Cancel: reverse stok + reverse JV. Blocked kalau invoice link Paid.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitGoodsReceiptInTx } from '../../services/goodsReceiptSubmit';
import { cancelGoodsReceiptInTx } from '../../services/goodsReceiptCancel';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let warehouseId: string;
let supplierId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user');
  userId = user.id;

  const wh = await prisma.warehouse.findFirst({ where: { isActive: true } });
  if (!wh) throw new Error('No active warehouse');
  warehouseId = wh.id;

  const supplier = await prisma.party.findFirst({
    where: { isActive: true, partyType: { in: ['Supplier', 'Both'] } },
  });
  if (!supplier) throw new Error('No active supplier');
  supplierId = supplier.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('submitGoodsReceiptInTx', () => {
  it('posts stock In + JE DR Persediaan / CR Hutang Belum Tagih (provisional)', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-STT-${stamp}`,
            name: `STT Item ${stamp}`,
            unit: 'kg',
            currentStock: 0,
            averageCost: 0,
            isActive: true,
          },
        });

        const stt = await submitGoodsReceiptInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 100,
              unit: 'kg',
              lockedUnitCost: 10_000, // explicit provisional cost
            }],
          },
          userId,
        );
        expect(stt.status).toBe('Submitted');

        // Stock: 0 → 100, avgCost 0 → 10000
        const itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(100);
        expect(Number(itemAfter!.averageCost)).toBe(10_000);

        // Per-warehouse stock = 100
        const stockRow = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
        });
        expect(Number(stockRow!.currentStock)).toBe(100);

        // Stock movement (In, 100 kg @ 10000)
        const sm = await tx.stockMovement.findFirst({
          where: { referenceType: 'GoodsReceipt', referenceId: stt.id, isCancelled: false },
        });
        expect(sm).not.toBeNull();
        expect(sm!.movementType).toBe('In');
        expect(Number(sm!.quantity)).toBe(100);
        expect(Number(sm!.unitCost)).toBe(10_000);

        // GR item linked to SM
        const grItem = await tx.goodsReceiptItem.findFirst({
          where: { goodsReceiptId: stt.id },
        });
        expect(grItem!.stockMovementId).toBe(sm!.id);

        // JE balanced: DR Persediaan 1M / CR Hutang Belum Tagih 1M
        const jv = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${stt.sttNumber}` },
          include: { items: { include: { account: true } } },
        });
        expect(jv).not.toBeNull();
        const totalDr = jv!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCr = jv!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDr).toBe(1_000_000);
        expect(totalCr).toBe(1_000_000);
        // Find accrual CR line — must be on 2.1.5 (Hutang Belum Tagih)
        const accrualLine = jv!.items.find((i) => Number(i.credit) > 0);
        expect(accrualLine!.account.accountNumber).toBe('2.1.5');
        expect(accrualLine!.partyId).toBe(supplierId);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('uses item averageCost as provisional when lockedUnitCost is 0', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-STT-AVG-${stamp}`,
            name: `STT AvgCost ${stamp}`,
            unit: 'kg',
            currentStock: 50,
            averageCost: 7_500, // existing avg cost → should be used as provisional
            isActive: true,
          },
        });

        const stt = await submitGoodsReceiptInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 100,
              unit: 'kg',
              lockedUnitCost: 0, // fallback to current avg
            }],
          },
          userId,
        );

        const sm = await tx.stockMovement.findFirst({
          where: { referenceType: 'GoodsReceipt', referenceId: stt.id },
        });
        expect(Number(sm!.unitCost)).toBe(7_500);
        // JE total = 100 × 7500 = 750_000
        const jv = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${stt.sttNumber}` },
          include: { items: true },
        });
        const totalCr = jv!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalCr).toBe(750_000);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});

d('cancelGoodsReceiptInTx', () => {
  it('reverses stock + JV (DR Hutang Belum Tagih / CR Persediaan)', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-STT-CXL-${stamp}`,
            name: `STT Cancel ${stamp}`,
            unit: 'kg',
            currentStock: 0,
            averageCost: 0,
            isActive: true,
          },
        });

        const stt = await submitGoodsReceiptInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 50,
              unit: 'kg',
              lockedUnitCost: 5_000,
            }],
          },
          userId,
        );

        // Cancel STT
        await cancelGoodsReceiptInTx(tx, stt.id, userId);

        // Stock back to 0
        const itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(0);

        const stockRow = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
        });
        expect(Number(stockRow?.currentStock ?? 0)).toBe(0);

        // SM marked cancelled
        const sm = await tx.stockMovement.findFirst({
          where: { referenceType: 'GoodsReceipt', referenceId: stt.id },
        });
        expect(sm!.isCancelled).toBe(true);

        // Original JV → Cancelled
        const originalJv = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${stt.sttNumber}` },
        });
        expect(originalJv!.status).toBe('Cancelled');

        // Reverse JV exists with balanced flip
        const cxlJv = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${stt.sttNumber}-CXL` },
          include: { items: true },
        });
        expect(cxlJv).not.toBeNull();
        const totalDr = cxlJv!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCr = cxlJv!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDr).toBe(250_000); // 50 × 5000
        expect(totalCr).toBe(250_000);

        // STT marked Cancelled
        const sttAfter = await tx.goodsReceipt.findUnique({ where: { id: stt.id } });
        expect(sttAfter!.status).toBe('Cancelled');

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects cancel when STT is legacy backfill', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const fy = await tx.fiscalYear.findFirst({ where: { isClosed: false } });
        const legacy = await tx.goodsReceipt.create({
          data: {
            sttNumber: `STT-LEG-TEST-${stamp}`,
            date: new Date(),
            partyId: supplierId,
            status: 'Submitted',
            isLegacyBackfill: true,
            fiscalYearId: fy!.id,
            createdBy: userId,
            submittedAt: new Date(),
          },
        });

        await expect(cancelGoodsReceiptInTx(tx, legacy.id, userId)).rejects.toThrow(/backfill/i);
        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
