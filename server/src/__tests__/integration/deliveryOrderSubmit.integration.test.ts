/**
 * Integration test: submitDeliveryOrderInTx + cancelDeliveryOrderInTx.
 *
 * DO submits decrement stock (item-total + per-warehouse) and create a
 * stockMovement Out tagged with referenceType='DeliveryOrder'. No GL impact.
 * Cancel restores the same. Rollback sentinel keeps dev DB clean.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitDeliveryOrderInTx } from '../../services/deliveryOrderSubmit';
import { cancelDeliveryOrderInTx } from '../../services/deliveryOrderCancel';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let warehouseId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
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

d('submitDeliveryOrderInTx', () => {
  it('decrements item-total + per-warehouse stock, creates Out movement with locked unitCost, no GL', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        // Ensure a default warehouse for resolveWarehouseId paths.
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        await tx.warehouse.update({ where: { id: warehouseId }, data: { isDefault: true } });

        const customer = await tx.party.create({
          data: {
            name: `TEST-DO-CUST-${stamp}`,
            partyType: 'Customer',
            isActive: true,
          },
        });

        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-DO-ITEM-${stamp}`,
            name: `DO Test Item ${stamp}`,
            unit: 'kg',
            currentStock: 100,
            averageCost: 8_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId, currentStock: 100 },
        });

        const before = Date.now();
        const result = await submitDeliveryOrderInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            nomorMobil: 'B 9999 TEST',
            driverName: 'Pak Test',
            recipientName: 'Test Recipient',
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 30,
              unit: 'kg',
            }],
          },
          userId,
        );

        expect(result.doNumber).toMatch(/^DO-\d{6}-\d{4}$/);
        expect(result.status).toBe('Submitted');
        expect(result.items.length).toBe(1);
        expect(Number(before)).toBeLessThanOrEqual(result.submittedAt!.getTime());

        // Item total: 100 - 30 = 70
        const itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(70);

        // Per-warehouse: also 70 (avoids drift)
        const stockAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
        });
        expect(Number(stockAfter!.currentStock)).toBe(70);

        // Stock movement: Out, ref to DO, unitCost locked at averageCost
        const movements = await tx.stockMovement.findMany({
          where: { referenceType: 'DeliveryOrder', referenceId: result.id },
        });
        expect(movements.length).toBe(1);
        expect(movements[0].movementType).toBe('Out');
        expect(Number(movements[0].quantity)).toBe(30);
        expect(Number(movements[0].unitCost)).toBe(8_000);
        expect(Number(movements[0].totalValue)).toBe(240_000);
        expect(movements[0].warehouseId).toBe(warehouseId);

        // DO line item links to the movement
        const doItem = await tx.deliveryOrderItem.findFirst({
          where: { deliveryOrderId: result.id },
        });
        expect(doItem!.stockMovementId).toBe(movements[0].id);

        // No JE/ALE created (DO has no GL impact)
        const je = await tx.journalEntry.findFirst({
          where: { entryNumber: { contains: result.doNumber } },
        });
        expect(je).toBeNull();

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects when inventory stock is insufficient and allowNegativeStock=false', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        await tx.warehouse.update({ where: { id: warehouseId }, data: { isDefault: true } });

        const customer = await tx.party.create({
          data: { name: `TEST-DO-LOW-${stamp}`, partyType: 'Customer', isActive: true },
        });
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-DO-LOW-${stamp}`,
            name: 'Low stock item',
            unit: 'kg',
            currentStock: 5,
            averageCost: 1_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId, currentStock: 5 },
        });

        await submitDeliveryOrderInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 50,
              unit: 'kg',
            }],
          },
          userId,
        );
      }, { timeout: 30000 }),
    ).rejects.toThrow(/tidak cukup/i);
  });
});

d('cancelDeliveryOrderInTx', () => {
  it('restores stock and marks movement isCancelled', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        await tx.warehouse.update({ where: { id: warehouseId }, data: { isDefault: true } });

        const customer = await tx.party.create({
          data: { name: `TEST-DO-CXL-${stamp}`, partyType: 'Customer', isActive: true },
        });
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-DO-CXL-${stamp}`,
            name: 'Cxl item',
            unit: 'kg',
            currentStock: 50,
            averageCost: 1_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId, currentStock: 50 },
        });

        const result = await submitDeliveryOrderInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 20,
              unit: 'kg',
            }],
          },
          userId,
        );

        // After submit: 50 - 20 = 30
        let itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(30);

        const cancelled = await cancelDeliveryOrderInTx(tx, result.id);
        expect(cancelled.status).toBe('Cancelled');

        // After cancel: back to 50
        itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(50);

        const stockAfter = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
        });
        expect(Number(stockAfter!.currentStock)).toBe(50);

        // Movement marked cancelled
        const movements = await tx.stockMovement.findMany({
          where: { referenceType: 'DeliveryOrder', referenceId: result.id },
        });
        expect(movements.length).toBe(1);
        expect(movements[0].isCancelled).toBe(true);

        // DO header reflects cancellation
        const doAfter = await tx.deliveryOrder.findUnique({ where: { id: result.id } });
        expect(doAfter!.status).toBe('Cancelled');
        expect(doAfter!.cancelledAt).not.toBeNull();

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects cancel when DO is already linked to an invoice', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { submitSalesInvoiceInTx } = await import('../../services/salesInvoiceSubmit');

    try {
      await prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        await tx.warehouse.update({ where: { id: warehouseId }, data: { isDefault: true } });

        const customer = await tx.party.create({
          data: { name: `TEST-DO-INV-${stamp}`, partyType: 'Customer', isActive: true },
        });

        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-DO-INV-${stamp}`,
            name: 'Inv item',
            unit: 'kg',
            currentStock: 50,
            averageCost: 1_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId, currentStock: 50 },
        });

        const doResult = await submitDeliveryOrderInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            items: [{
              inventoryItemId: item.id,
              warehouseId,
              itemName: item.name,
              quantity: 10,
              unit: 'kg',
            }],
          },
          userId,
        );

        // Create a real (cheap) sales invoice + link DO to it. This mimics
        // what the Phase 3 invoice-from-DO flow will do.
        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            items: [{
              itemName: 'Linked invoice line',
              itemType: 'service',
              quantity: 1,
              rate: 10_000,
            }],
          },
          userId,
        );
        await tx.deliveryOrder.update({
          where: { id: doResult.id },
          data: { invoiceId: invoice.id, invoicedAt: new Date() },
        });

        await expect(cancelDeliveryOrderInTx(tx, doResult.id))
          .rejects.toThrow(/invoice/i);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
