/**
 * Integration test: submitProductionRunInTx happy path.
 *
 * Creates throwaway input + output inventory items (with stock seeded
 * directly via Prisma to avoid running a separate purchase first), submits
 * a production run, asserts:
 *   - input stock decremented, output stock incremented (item totals)
 *   - per-warehouse stock at the default warehouse mirrors the totals
 *   - StockMovement rows (1 Out per input + 1 In per output) tagged with
 *     the correct ProductionRun reference
 *   - JE balanced (DR output / CR input / balance via HPP — DB trigger
 *     would have aborted if not)
 *   - output.averageCost recomputed via WAC
 *
 * Rolls back the outer tx so dev DB stays clean.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitProductionRunInTx } from '../../services/productionRunSubmit';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let warehouseId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user.');
  userId = user.id;

  // Any active warehouse works; service uses the default but falls back to
  // the first active one if no default exists.
  const wh = await prisma.warehouse.findFirst({ where: { isActive: true } });
  if (!wh) throw new Error('No active warehouse.');
  warehouseId = wh.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('submitProductionRunInTx — single input / single output', () => {
  it('decrements input stock, increments output stock, posts balanced JE', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        // Setup: create input item with stock + cost, output item starts at 0.
        const inputItem = await tx.inventoryItem.create({
          data: {
            code: `TEST-IN-${stamp}`,
            name: `Test Input ${stamp}`,
            unit: 'kg',
            currentStock: 100,
            averageCost: 10_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: inputItem.id, warehouseId, currentStock: 100 },
        });

        const outputItem = await tx.inventoryItem.create({
          data: {
            code: `TEST-OUT-${stamp}`,
            name: `Test Output ${stamp}`,
            unit: 'kg',
            currentStock: 0,
            averageCost: 0,
            isActive: true,
          },
        });

        // Pass warehouseId explicitly — preferred path now that the UI has a
        // WarehousePicker on the production run form.
        const run = await submitProductionRunInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            warehouseId,
            inputs: [{ itemId: inputItem.id, quantity: 60 }],
            outputs: [{ itemId: outputItem.id, quantity: 50, unitPrice: 11_000 }],
          },
          userId,
        );

        expect(run).not.toBeNull();
        expect(run!.items.length).toBe(2); // 1 input + 1 output
        expect(run!.runNumber).toMatch(/^PR-\d{6}-\d{4}$/);

        // Input stock: 100 - 60 = 40
        const inputAfter = await tx.inventoryItem.findUnique({ where: { id: inputItem.id } });
        expect(Number(inputAfter!.currentStock)).toBe(40);
        const inputStockAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: inputItem.id, warehouseId } },
        });
        expect(Number(inputStockAfter!.currentStock)).toBe(40);

        // Output stock: 0 + 50 = 50, WAC = 11_000 (only source so far)
        const outputAfter = await tx.inventoryItem.findUnique({ where: { id: outputItem.id } });
        expect(Number(outputAfter!.currentStock)).toBe(50);
        expect(Number(outputAfter!.averageCost)).toBe(11_000);

        // Stock movements: 1 Out for input, 1 In for output, both tagged.
        const movements = await tx.stockMovement.findMany({
          where: { referenceType: 'ProductionRun', referenceId: run!.id },
        });
        expect(movements.length).toBe(2);
        const out = movements.find((m) => m.movementType === 'Out');
        const into = movements.find((m) => m.movementType === 'In');
        expect(out).toBeDefined();
        expect(into).toBeDefined();
        expect(out!.itemId).toBe(inputItem.id);
        expect(into!.itemId).toBe(outputItem.id);
        expect(Number(out!.quantity)).toBe(60);
        expect(Number(into!.quantity)).toBe(50);

        // JE balanced (DB constraint would have rejected otherwise).
        // Sum DR (output 50 * 11_000 = 550_000) should equal sum CR
        // (input 60 * 10_000 = 600_000 + balancing HPP 50_000 DR).
        const je = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${run!.runNumber}` },
          include: { items: true },
        });
        expect(je).not.toBeNull();
        const totalDebit = je!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCredit = je!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDebit).toBe(totalCredit);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects when input stock insufficient and allowNegativeStock=false', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await expect(
      prisma.$transaction(async (tx) => {
        const inputItem = await tx.inventoryItem.create({
          data: {
            code: `TEST-IN-LOW-${stamp}`,
            name: `Test Input Low ${stamp}`,
            unit: 'kg',
            currentStock: 10,
            averageCost: 5_000,
            isActive: true,
          },
        });
        const outputItem = await tx.inventoryItem.create({
          data: {
            code: `TEST-OUT-LOW-${stamp}`,
            name: `Test Output Low ${stamp}`,
            unit: 'kg',
            currentStock: 0,
            isActive: true,
          },
        });
        await submitProductionRunInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            warehouseId,
            inputs: [{ itemId: inputItem.id, quantity: 100 }], // 100 > 10
            outputs: [{ itemId: outputItem.id, quantity: 50, unitPrice: 6_000 }],
          },
          userId,
        );
      }),
    ).rejects.toThrow(/stok.*tidak cukup/i);
  });
});
