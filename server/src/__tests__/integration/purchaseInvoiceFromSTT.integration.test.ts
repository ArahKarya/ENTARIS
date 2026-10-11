/**
 * Integration test: PI dibuat dari STT (Phase 3 contract).
 *
 * Asserts:
 *   - PI items dengan goodsReceiptItemId → tidak buat stock In baru
 *   - JE includes: DR Persediaan (standalone lines, kalau ada) +
 *     DR Hutang Belum Tagih (reverse accrual @ provisional) +
 *     DR/CR Selisih Harga Pembelian (variance) + CR Hutang Usaha (actual)
 *   - STT.invoiceId terisi setelah PI submit
 *   - Cancel PI: release STT (clear invoiceId), JV terbalik, stok tidak
 *     terganggu (STT yang punya)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitGoodsReceiptInTx } from '../../services/goodsReceiptSubmit';
import { submitPurchaseInvoiceInTx } from '../../services/purchaseInvoiceSubmit';
import { cancelPurchaseInvoiceInTx } from '../../services/invoiceCancellation';
import { systemAccountNumber } from '../helpers/systemAccountNumbers';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let warehouseId: string;
let supplierId: string;

// Account numbers resolved from Akun Sistem (they differ per chart of accounts).
let accruedNo: string;
let varianceNo: string;
let apNo: string;
let inventoryNo: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  userId = user!.id;

  const wh = await prisma.warehouse.findFirst({ where: { isActive: true } });
  warehouseId = wh!.id;

  accruedNo = await systemAccountNumber(prisma, 'ACCRUED_PAYABLE');
  varianceNo = await systemAccountNumber(prisma, 'PURCHASE_PRICE_VARIANCE');
  apNo = await systemAccountNumber(prisma, 'AP');
  inventoryNo = await systemAccountNumber(prisma, 'INVENTORY');

  const supplier = await prisma.party.findFirst({
    where: { isActive: true, partyType: { in: ['Supplier', 'Both'] } },
  });
  supplierId = supplier!.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('PI from STT — Phase 3 flow', () => {
  it('skips stock, reverses accrual, posts the landed-cost delta to inventory, marks STT invoiced', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            code: `TEST-FROM-STT-${stamp}`,
            name: `From-STT ${stamp}`,
            unit: 'kg',
            currentStock: 0,
            averageCost: 0,
            isActive: true,
          },
        });

        // STT at provisional cost 10_000
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
              lockedUnitCost: 10_000,
            }],
          },
          userId,
        );
        const grItem = await tx.goodsReceiptItem.findFirst({ where: { goodsReceiptId: stt.id } });
        const stockBefore = Number((await tx.inventoryItem.findUnique({ where: { id: item.id } }))!.currentStock);
        expect(stockBefore).toBe(100); // STT did the stock-in

        // PI from STT at actual 11_000 (variance +100k = 100 × 1000)
        const pi = await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              itemName: item.name,
              inventoryItemId: item.id,
              warehouseId,
              quantity: 100,
              unit: 'kg',
              rate: 11_000,
              taxPct: 0,
              pphPct: 0,
              goodsReceiptItemId: grItem!.id,
            }],
          },
          userId,
        );

        // Stock unchanged (no double-In)
        const stockAfter = Number((await tx.inventoryItem.findUnique({ where: { id: item.id } }))!.currentStock);
        expect(stockAfter).toBe(100);

        // No PI-owned SM exists
        const piSMs = await tx.stockMovement.findMany({
          where: { referenceType: 'PurchaseInvoice', referenceId: pi.id, isCancelled: false },
        });
        expect(piSMs.length).toBe(0);

        // STT marked invoiced
        const sttAfter = await tx.goodsReceipt.findUnique({ where: { id: stt.id } });
        expect(sttAfter!.invoiceId).toBe(pi.id);
        expect(sttAfter!.invoicedAt).not.toBeNull();

        // PI item back-linked
        const piItem = await tx.purchaseInvoiceItem.findFirst({
          where: { purchaseInvoiceId: pi.id, goodsReceiptItemId: grItem!.id },
        });
        expect(piItem).not.toBeNull();

        // JE composition — should be balanced
        const jv = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${pi.invoiceNumber}` },
          include: { items: { include: { account: true } } },
        });
        const totalDr = jv!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCr = jv!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDr).toBe(totalCr); // balanced
        expect(totalCr).toBe(1_100_000); // CR Hutang Usaha = 100 × 11_000

        // DR Hutang Belum Tagih @ 1_000_000 (provisional from STT)
        const accrualReverse = jv!.items.find(
          (i) => i.account.accountNumber === accruedNo && Number(i.debit) > 0,
        );
        expect(accrualReverse).toBeDefined();
        expect(Number(accrualReverse!.debit)).toBe(1_000_000);

        // DR Persediaan @ 100_000: the landed-cost delta (actual > provisional) goes to inventory,
        // not to Selisih Harga Pembelian, so the unit cost reflects the full PI cost.
        const landed = jv!.items.find(
          (i) => i.account.accountNumber === inventoryNo && Number(i.debit) > 0,
        );
        expect(landed).toBeDefined();
        expect(Number(landed!.debit)).toBe(100_000);
        expect(jv!.items.some((i) => i.account.accountNumber === varianceNo)).toBe(false);

        // CR Hutang Usaha @ 1_100_000
        const ap = jv!.items.find((i) => i.account.accountNumber === apNo && Number(i.credit) > 0);
        expect(Number(ap!.credit)).toBe(1_100_000);
        expect(ap!.partyId).toBe(supplierId);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('handles a negative delta (PI cheaper than STT provisional) with CR Persediaan', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: { code: `TEST-NEG-VAR-${stamp}`, name: `NegVar ${stamp}`, unit: 'kg', currentStock: 0, averageCost: 0, isActive: true },
        });

        const stt = await submitGoodsReceiptInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              inventoryItemId: item.id, warehouseId, itemName: item.name,
              quantity: 100, unit: 'kg', lockedUnitCost: 10_000,
            }],
          },
          userId,
        );
        const grItem = await tx.goodsReceiptItem.findFirst({ where: { goodsReceiptId: stt.id } });

        const pi = await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              itemName: item.name, inventoryItemId: item.id, warehouseId,
              quantity: 100, unit: 'kg', rate: 9_500, taxPct: 0, pphPct: 0,
              goodsReceiptItemId: grItem!.id,
            }],
          },
          userId,
        );

        const jv = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${pi.invoiceNumber}` },
          include: { items: { include: { account: true } } },
        });
        // Delta = (9500 - 10000) × 100 = -50_000 → CR Persediaan 50_000 (landed cost down)
        const landedCr = jv!.items.find(
          (i) => i.account.accountNumber === inventoryNo && Number(i.credit) > 0,
        );
        expect(landedCr).toBeDefined();
        expect(Number(landedCr!.credit)).toBe(50_000);

        // Balanced: DR 1M (accrual reverse) = CR 950k (AP) + 50k (Persediaan)
        const totalDr = jv!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCr = jv!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDr).toBe(totalCr);
        expect(totalDr).toBe(1_000_000);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('cancel PI releases STT (clears invoiceId), stock untouched', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: { code: `TEST-PI-CXL-${stamp}`, name: `PI Cxl ${stamp}`, unit: 'kg', currentStock: 0, averageCost: 0, isActive: true },
        });

        const stt = await submitGoodsReceiptInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              inventoryItemId: item.id, warehouseId, itemName: item.name,
              quantity: 100, unit: 'kg', lockedUnitCost: 10_000,
            }],
          },
          userId,
        );
        const grItem = await tx.goodsReceiptItem.findFirst({ where: { goodsReceiptId: stt.id } });

        const pi = await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              itemName: item.name, inventoryItemId: item.id, warehouseId,
              quantity: 100, unit: 'kg', rate: 10_500, taxPct: 0, pphPct: 0,
              goodsReceiptItemId: grItem!.id,
            }],
          },
          userId,
        );

        const sttBefore = await tx.goodsReceipt.findUnique({ where: { id: stt.id } });
        expect(sttBefore!.invoiceId).toBe(pi.id);

        const stockBefore = Number((await tx.inventoryItem.findUnique({ where: { id: item.id } }))!.currentStock);
        expect(stockBefore).toBe(100);

        // Cancel PI
        await cancelPurchaseInvoiceInTx(tx, pi.id);

        // STT released
        const sttAfter = await tx.goodsReceipt.findUnique({ where: { id: stt.id } });
        expect(sttAfter!.invoiceId).toBeNull();
        expect(sttAfter!.invoicedAt).toBeNull();

        // Stock unchanged — STT owns the stock In, PI never had its own SM
        const stockAfter = Number((await tx.inventoryItem.findUnique({ where: { id: item.id } }))!.currentStock);
        expect(stockAfter).toBe(100);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects PI from STT if STT line already invoiced', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: { code: `TEST-DUP-INV-${stamp}`, name: `Dup ${stamp}`, unit: 'kg', currentStock: 0, averageCost: 0, isActive: true },
        });

        const stt = await submitGoodsReceiptInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              inventoryItemId: item.id, warehouseId, itemName: item.name,
              quantity: 50, unit: 'kg', lockedUnitCost: 5_000,
            }],
          },
          userId,
        );
        const grItem = await tx.goodsReceiptItem.findFirst({ where: { goodsReceiptId: stt.id } });

        // First PI OK
        await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              itemName: item.name, inventoryItemId: item.id, warehouseId,
              quantity: 50, unit: 'kg', rate: 5_000, taxPct: 0, pphPct: 0,
              goodsReceiptItemId: grItem!.id,
            }],
          },
          userId,
        );

        // Second PI on same STT line → reject
        await expect(submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: supplierId,
            items: [{
              itemName: item.name, inventoryItemId: item.id, warehouseId,
              quantity: 50, unit: 'kg', rate: 5_000, taxPct: 0, pphPct: 0,
              goodsReceiptItemId: grItem!.id,
            }],
          },
          userId,
        )).rejects.toThrow(/sudah di-invoice/i);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
