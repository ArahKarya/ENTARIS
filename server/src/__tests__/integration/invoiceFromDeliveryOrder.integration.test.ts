/**
 * Integration test: invoice billed from an existing Delivery Order.
 *
 * Asserts the Phase-3 contract:
 *   - DO submit decrements stock + creates Out movement with locked unitCost
 *   - Invoice with deliveryOrderItemId line does NOT create a second
 *     stockMovement / decrement (would double-stock-out)
 *   - COGS journal at invoice uses the LOCKED unitCost from the DO movement,
 *     not the current averageCost (which may have shifted from later purchases)
 *   - DO.status flips to Invoiced (invoiceId/invoicedAt set)
 *   - Cancelling the invoice releases the DO back to Submitted state
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitDeliveryOrderInTx } from '../../services/deliveryOrderSubmit';
import { submitSalesInvoiceInTx } from '../../services/salesInvoiceSubmit';
import { cancelSalesInvoiceInTx } from '../../services/invoiceCancellation';

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

d('invoice from delivery order', () => {
  it('skips stock-out + uses locked unitCost for COGS + flips DO to Invoiced', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        await tx.warehouse.update({ where: { id: warehouseId }, data: { isDefault: true } });

        const customer = await tx.party.create({
          data: { name: `TEST-DO-INV-${stamp}`, partyType: 'Customer', isActive: true },
        });

        // Item starts at qty=100, cost=10_000.
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-FROM-DO-${stamp}`,
            name: `From-DO Item ${stamp}`,
            unit: 'kg',
            currentStock: 100,
            averageCost: 10_000,
            isActive: true,
          },
        });
        await tx.inventoryStock.create({
          data: { itemId: item.id, warehouseId, currentStock: 100 },
        });

        // Ship via DO at the original 10_000 cost.
        const doResult = await submitDeliveryOrderInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
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
        const doItemId = doResult.items[0].id;

        // After DO: stock 100 -> 70
        let itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(70);

        // Cost shifts before billing: averageCost climbs to 15_000.
        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { averageCost: 15_000 },
        });

        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            items: [{
              itemName: item.name,
              itemType: 'product',
              inventoryItemId: item.id,
              warehouseId,
              deliveryOrderItemId: doItemId,
              quantity: 30,
              unit: 'kg',
              rate: 20_000, // selling price
            }],
          },
          userId,
        );

        // No DOUBLE stock-out: stock should still be 70 (not 40).
        itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(70);

        // Only ONE Out movement should exist for this item — from the DO.
        const movements = await tx.stockMovement.findMany({
          where: { itemId: item.id, isCancelled: false },
        });
        expect(movements.length).toBe(1);
        expect(movements[0].referenceType).toBe('DeliveryOrder');
        // Locked at 10_000 (cost at DO time), not 15_000 (current avgCost).
        expect(Number(movements[0].unitCost)).toBe(10_000);

        // COGS journal posts using the LOCKED cost.
        const cogsJe = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-COGS-${invoice.invoiceNumber}` },
          include: { items: true },
        });
        expect(cogsJe).not.toBeNull();
        const totalDR = cogsJe!.items.reduce((s, ji) => s + Number(ji.debit), 0);
        // 30 × 10_000 = 300_000 (NOT 30 × 15_000 = 450_000)
        expect(totalDR).toBe(300_000);

        // Invoice line links to the DO item.
        const invoiceItem = await tx.salesInvoiceItem.findFirst({
          where: { salesInvoiceId: invoice.id },
        });
        expect(invoiceItem!.deliveryOrderItemId).toBe(doItemId);

        // DO flipped to Invoiced state.
        const doAfter = await tx.deliveryOrder.findUnique({ where: { id: doResult.id } });
        expect(doAfter!.invoiceId).toBe(invoice.id);
        expect(doAfter!.invoicedAt).not.toBeNull();

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('releases DO back to Submitted when invoice is cancelled', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        await tx.warehouse.update({ where: { id: warehouseId }, data: { isDefault: true } });

        const customer = await tx.party.create({
          data: { name: `TEST-INV-CXL-${stamp}`, partyType: 'Customer', isActive: true },
        });
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-INV-CXL-${stamp}`,
            name: 'Cancel item',
            unit: 'kg',
            currentStock: 50,
            averageCost: 5_000,
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
        const doItemId = doResult.items[0].id;

        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: customer.id,
            items: [{
              itemName: item.name,
              itemType: 'product',
              inventoryItemId: item.id,
              warehouseId,
              deliveryOrderItemId: doItemId,
              quantity: 10,
              unit: 'kg',
              rate: 8_000,
            }],
          },
          userId,
        );

        // DO is linked to invoice now.
        let doAfter = await tx.deliveryOrder.findUnique({ where: { id: doResult.id } });
        expect(doAfter!.invoiceId).toBe(invoice.id);

        // Cancel the invoice.
        await cancelSalesInvoiceInTx(tx, invoice.id);

        // DO released back: invoiceId null, invoicedAt null, status still Submitted.
        doAfter = await tx.deliveryOrder.findUnique({ where: { id: doResult.id } });
        expect(doAfter!.invoiceId).toBeNull();
        expect(doAfter!.invoicedAt).toBeNull();
        expect(doAfter!.status).toBe('Submitted');

        // DO's stock movement is still Out and active (goods remain delivered).
        const movements = await tx.stockMovement.findMany({
          where: { referenceType: 'DeliveryOrder', referenceId: doResult.id },
        });
        expect(movements.length).toBe(1);
        expect(movements[0].isCancelled).toBe(false);

        // Stock stays at 40 (DO already removed 10; invoice cancel does not
        // re-add because the goods physically left via DO).
        const itemAfter = await tx.inventoryItem.findUnique({ where: { id: item.id } });
        expect(Number(itemAfter!.currentStock)).toBe(40);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
