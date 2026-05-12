/**
 * Integration test: submitStockTransferInTx + cancelStockTransferInTx.
 *
 * Verifies that a stock transfer:
 *   - decrements source warehouse stock, increments destination
 *   - creates paired TransferOut/TransferIn stock movements tagged with the
 *     correct warehouseId
 *   - does NOT change inventory_items.currentStock (total across warehouses
 *     stays the same)
 * Plus that cancel restores all of the above.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitStockTransferInTx, cancelStockTransferInTx } from '../../services/stockTransfer';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let warehouseAId: string;
let warehouseBId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user.');
  userId = user.id;

  const whs = await prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    take: 2,
  });
  if (whs.length < 2) throw new Error('Test needs at least 2 active warehouses.');
  warehouseAId = whs[0].id;
  warehouseBId = whs[1].id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('submitStockTransferInTx', () => {
  it('moves stock from source to destination, totals unchanged, paired movements created', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-XFER-${stamp}`,
            name: `Test Transfer ${stamp}`,
            unit: 'kg',
            currentStock: 100, // total across warehouses
            averageCost: 12_000,
            isActive: true,
          },
        });
        // Seed all 100 at warehouse A so we can move some to B.
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId: warehouseAId, currentStock: 100 },
        });

        const transfer = await submitStockTransferInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            fromWarehouseId: warehouseAId,
            toWarehouseId: warehouseBId,
            items: [{ itemId: item.id, quantity: 30 }],
            notes: 'integration test transfer',
          },
          userId,
        );

        expect(transfer.status).toBe('Submitted');
        expect(transfer.transferNumber).toMatch(/^ST-\d{6}-\d{4}$/);
        expect(transfer.items.length).toBe(1);

        // Source: 100 → 70
        const sourceAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouseAId } },
        });
        expect(Number(sourceAfter!.currentStock)).toBe(70);

        // Destination: 0 → 30 (row created via upsert)
        const destAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouseBId } },
        });
        expect(Number(destAfter!.currentStock)).toBe(30);

        // Item total: unchanged.
        const itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(100);

        // Paired stock movements with correct warehouse tags.
        const movements = await tx.stockMovement.findMany({
          where: { referenceType: 'StockTransfer', referenceId: transfer.id },
          orderBy: { movementType: 'asc' },
        });
        expect(movements.length).toBe(2);
        const out = movements.find((m) => m.movementType === 'TransferOut');
        const into = movements.find((m) => m.movementType === 'TransferIn');
        expect(out).toBeDefined();
        expect(into).toBeDefined();
        expect(out!.warehouseId).toBe(warehouseAId);
        expect(into!.warehouseId).toBe(warehouseBId);
        expect(Number(out!.quantity)).toBe(30);
        expect(Number(into!.quantity)).toBe(30);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects when source stock is insufficient', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await expect(
      prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-XFER-LOW-${stamp}`,
            name: `Test Transfer Low ${stamp}`,
            unit: 'kg',
            currentStock: 10,
            averageCost: 0,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId: warehouseAId, currentStock: 10 },
        });

        await submitStockTransferInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            fromWarehouseId: warehouseAId,
            toWarehouseId: warehouseBId,
            items: [{ itemId: item.id, quantity: 50 }], // 50 > 10
          },
          userId,
        );
      }),
    ).rejects.toThrow(/tidak cukup/i);
  });

  it('rejects when source and destination are the same warehouse', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await submitStockTransferInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            fromWarehouseId: warehouseAId,
            toWarehouseId: warehouseAId,
            items: [{ itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
          },
          userId,
        );
      }),
    ).rejects.toThrow(/sumber dan tujuan/i);
  });
});

d('cancelStockTransferInTx', () => {
  it('restores stock and marks paired movements cancelled', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-XFER-CXL-${stamp}`,
            name: `Test Transfer Cancel ${stamp}`,
            unit: 'kg',
            currentStock: 50,
            averageCost: 1_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId: warehouseAId, currentStock: 50 },
        });

        const transfer = await submitStockTransferInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            fromWarehouseId: warehouseAId,
            toWarehouseId: warehouseBId,
            items: [{ itemId: item.id, quantity: 20 }],
          },
          userId,
        );

        const cancelled = await cancelStockTransferInTx(tx, transfer.id);
        expect(cancelled.status).toBe('Cancelled');

        // Source restored to 50, destination back to 0.
        const sourceAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouseAId } },
        });
        expect(Number(sourceAfter!.currentStock)).toBe(50);

        const destAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouseBId } },
        });
        expect(Number(destAfter!.currentStock)).toBe(0);

        // Both paired movements isCancelled = true.
        const movements = await tx.stockMovement.findMany({
          where: { referenceType: 'StockTransfer', referenceId: transfer.id },
        });
        expect(movements.length).toBe(2);
        expect(movements.every((m) => m.isCancelled)).toBe(true);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
