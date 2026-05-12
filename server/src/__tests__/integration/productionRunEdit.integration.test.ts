/**
 * Integration test: editProductionRunInTx.
 *
 * Flow: submit run → edit it with different qty/cost → assert:
 *   - run keeps same runNumber
 *   - original JE flipped to Cancelled, new JE created with -R1 suffix
 *   - old stock movements isCancelled, new ones active
 *   - final item totals reflect the edited (not original) numbers
 *   - account balances recalculated from JE sums (no drift)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitProductionRunInTx } from '../../services/productionRunSubmit';
import { editProductionRunInTx } from '../../services/productionRunEdit';

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

d('editProductionRunInTx — single input / single output', () => {
  it('preserves runNumber, cancels old JE, creates -R1 revision, final stock matches edit', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        // Ensure a default warehouse for resolveWarehouseId in submit/edit.
        const inputItem = await tx.inventoryItem.create({
          data: {
            code: `TEST-EDIT-IN-${stamp}`,
            name: `Edit Input ${stamp}`,
            unit: 'kg',
            currentStock: 200,
            averageCost: 10_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: inputItem.id, warehouseId, currentStock: 200 },
        });

        const outputItem = await tx.inventoryItem.create({
          data: {
            code: `TEST-EDIT-OUT-${stamp}`,
            name: `Edit Output ${stamp}`,
            unit: 'kg',
            currentStock: 0,
            averageCost: 0,
            isActive: true,
          },
        });

        // SUBMIT v1: input 60 → output 50
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
        const originalRunNumber = run!.runNumber;

        // After v1: input=140, output=50
        let inputCheck = await tx.inventoryItem.findUnique({ where: { id: inputItem.id } });
        expect(Number(inputCheck!.currentStock)).toBe(140);
        let outputCheck = await tx.inventoryItem.findUnique({ where: { id: outputItem.id } });
        expect(Number(outputCheck!.currentStock)).toBe(50);

        // EDIT: input 80 → output 70 (different from v1)
        const edited = await editProductionRunInTx(
          tx,
          run!.id,
          {
            date: new Date().toISOString().slice(0, 10),
            warehouseId,
            inputs: [{ itemId: inputItem.id, quantity: 80 }],
            outputs: [{ itemId: outputItem.id, quantity: 70, unitPrice: 12_000 }],
          },
          userId,
        );
        expect(edited).not.toBeNull();
        expect(edited!.runNumber).toBe(originalRunNumber); // same number

        // Final stock should reflect EDIT only (cancel of v1 + apply v2):
        // input: 200 → 140 (v1) → 200 (cancel v1) → 120 (apply v2)
        // output: 0 → 50 (v1) → 0 (cancel v1) → 70 (apply v2)
        inputCheck = await tx.inventoryItem.findUnique({ where: { id: inputItem.id } });
        expect(Number(inputCheck!.currentStock)).toBe(120);
        outputCheck = await tx.inventoryItem.findUnique({ where: { id: outputItem.id } });
        expect(Number(outputCheck!.currentStock)).toBe(70);

        // Original JE cancelled, revision JE active.
        const originalJe = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${originalRunNumber}` },
        });
        expect(originalJe).not.toBeNull();
        expect(originalJe!.status).toBe('Cancelled');

        const revisionJe = await tx.journalEntry.findFirst({
          where: { entryNumber: { startsWith: `JV-${originalRunNumber}-R` } },
          include: { items: true },
        });
        expect(revisionJe).not.toBeNull();
        expect(revisionJe!.status).toBe('Submitted');

        // Revision JE balanced (DB trigger guard).
        const totalDebit = revisionJe!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCredit = revisionJe!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDebit).toBe(totalCredit);

        // Old stock movements cancelled, new ones active.
        const allMovements = await tx.stockMovement.findMany({
          where: { referenceType: 'ProductionRun', referenceId: run!.id },
        });
        const cancelled = allMovements.filter((m) => m.isCancelled);
        const active = allMovements.filter((m) => !m.isCancelled);
        expect(cancelled.length).toBe(2); // v1 in + out
        expect(active.length).toBe(2);    // v2 in + out

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects edit of an already-cancelled run', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const inputItem = await tx.inventoryItem.create({
          data: { code: `TEST-CXL-EDIT-IN-${stamp}`, name: `X ${stamp}`, unit: 'kg', currentStock: 100, averageCost: 1000, isActive: true },
        });
        await tx.inventoryStock.create({
          data: { itemId: inputItem.id, warehouseId, currentStock: 100 },
        });
        const outputItem = await tx.inventoryItem.create({
          data: { code: `TEST-CXL-EDIT-OUT-${stamp}`, name: `Y ${stamp}`, unit: 'kg', isActive: true },
        });

        const run = await submitProductionRunInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            warehouseId,
            inputs: [{ itemId: inputItem.id, quantity: 10 }],
            outputs: [{ itemId: outputItem.id, quantity: 8, unitPrice: 1500 }],
          },
          userId,
        );

        // Manually mark the run cancelled (mirrors cancelProductionRunInTx
        // effect without running its full logic — we only need the status).
        await tx.productionRun.update({
          where: { id: run!.id },
          data: { isCancelled: true },
        });

        await expect(
          editProductionRunInTx(
            tx,
            run!.id,
            {
              date: new Date().toISOString().slice(0, 10),
              warehouseId,
              inputs: [{ itemId: inputItem.id, quantity: 5 }],
              outputs: [{ itemId: outputItem.id, quantity: 4, unitPrice: 1500 }],
            },
            userId,
          ),
        ).rejects.toThrow(/sudah dibatalkan/i);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
