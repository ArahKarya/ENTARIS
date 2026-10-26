/**
 * Regresi: item BARU (averageCost 0, belum pernah ada stok masuk) diterima lewat STT.
 *
 * Kasus nyata PMD (Okt 2026): item 'BRS-HJT IR' dibuat lalu langsung dipakai di STT tanpa PO.
 * Form STT dulu selalu kirim lockedUnitCost 0 → provisional = averageCost 0 → ditolak guard WAC,
 * sehingga item baru tidak pernah bisa masuk lewat STT.
 *
 * Kontrak sekarang (provisional cost, urut): harga perkiraan di baris STT → averageCost item →
 * estimatedRate baris PO tertaut. Tetap ditolak bila semuanya 0 (guard WAC dipertahankan).
 * PI dari STT mengoreksi ke harga aktual: DR Hutang Belum Tagih @ provisional + selisih ke
 * Persediaan + CR Hutang Usaha @ aktual; averageCost & stock movement ikut harga aktual.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitGoodsReceiptInTx } from '../../services/goodsReceiptSubmit';
import { submitPurchaseInvoiceInTx } from '../../services/purchaseInvoiceSubmit';
import { getOpenFiscalYear } from '../../utils/fiscalYear';
import { systemAccountNumber } from '../helpers/systemAccountNumbers';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let warehouseId: string;
let supplierId: string;
let accruedNo: string;
let inventoryNo: string;
let apNo: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool as any) });
  userId = (await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } }))!.id;
  warehouseId = (await prisma.warehouse.findFirst({ where: { isActive: true } }))!.id;
  supplierId = (await prisma.party.findFirst({ where: { isActive: true, partyType: { in: ['Supplier', 'Both'] } } }))!.id;
  accruedNo = await systemAccountNumber(prisma, 'ACCRUED_PAYABLE');
  inventoryNo = await systemAccountNumber(prisma, 'INVENTORY');
  apNo = await systemAccountNumber(prisma, 'AP');
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

const today = () => new Date().toISOString().slice(0, 10);
const stampOf = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function rollback(fn: (tx: any) => Promise<void>): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await fn(tx);
      throw new RollbackSentinel();
    }, { timeout: 30000 });
  } catch (err) {
    if (!(err instanceof RollbackSentinel)) throw err;
  }
}

async function newItem(tx: any, stamp: string) {
  return tx.inventoryItem.create({
    data: { code: `TEST-NEW ${stamp}`, name: `Beras Baru ${stamp} `, unit: 'Kg', currentStock: 0, averageCost: 0, isActive: true },
  });
}

const line = (item: { id: string; name: string }, extra: Record<string, unknown> = {}) => ({
  inventoryItemId: item.id, warehouseId, itemName: item.name, quantity: 1000, unit: 'Kg', ...extra,
});

d('STT item baru (tanpa averageCost)', () => {
  it('menolak tanpa harga perkiraan, dengan pesan yang menunjuk kolom Harga perkiraan', async () => {
    await rollback(async (tx) => {
      const item = await newItem(tx, stampOf());
      await expect(
        submitGoodsReceiptInTx(tx, { date: today(), partyId: supplierId, items: [line(item, { lockedUnitCost: 0 })] }, userId),
      ).rejects.toThrow(/belum ada \(item baru.*Isi Harga perkiraan di baris STT/);
    });
  });

  it('menerima dengan harga perkiraan: stok, WAC, SM, dan jurnal DR Persediaan / CR Hutang Belum Tagih', async () => {
    await rollback(async (tx) => {
      const item = await newItem(tx, stampOf());
      const stt = await submitGoodsReceiptInTx(tx, { date: today(), partyId: supplierId, items: [line(item, { lockedUnitCost: 12_000 })] }, userId);
      const after = await tx.inventoryItem.findUnique({ where: { id: item.id } });
      expect(Number(after.currentStock)).toBe(1000);
      expect(Number(after.averageCost)).toBe(12_000);
      const sm = await tx.stockMovement.findFirst({ where: { referenceType: 'GoodsReceipt', referenceId: stt.id } });
      expect(Number(sm.unitCost)).toBe(12_000);
      expect(Number(sm.totalValue)).toBe(12_000_000);
      const jv = await tx.journalEntry.findUnique({ where: { entryNumber: `JV-${stt.sttNumber}` }, include: { items: { include: { account: true } } } });
      const dr = jv.items.find((i: any) => Number(i.debit) > 0);
      const cr = jv.items.find((i: any) => Number(i.credit) > 0);
      expect(dr.account.accountNumber).toBe(inventoryNo);
      expect(Number(dr.debit)).toBe(12_000_000);
      expect(cr.account.accountNumber).toBe(accruedNo);
      expect(Number(cr.credit)).toBe(12_000_000);
    });
  });

  it('tanpa harga di baris tetapi tertaut PO: pakai estimatedRate baris PO', async () => {
    await rollback(async (tx) => {
      const stamp = stampOf();
      const item = await newItem(tx, stamp);
      const fy = await getOpenFiscalYear(tx, new Date(today()));
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber: `TEST-PO-${stamp}`, date: new Date(today()), partyId: supplierId, status: 'Submitted', fiscalYearId: fy.id, createdBy: userId,
          items: { create: [{ inventoryItemId: item.id, itemName: item.name, quantity: 1000, unit: 'Kg', estimatedRate: 11_500, estimatedAmount: 11_500_000 }] },
        },
        include: { items: true },
      });
      const stt = await submitGoodsReceiptInTx(
        tx,
        { date: today(), partyId: supplierId, purchaseOrderId: po.id, items: [line(item, { lockedUnitCost: 0, purchaseOrderItemId: po.items[0].id })] },
        userId,
      );
      const sm = await tx.stockMovement.findFirst({ where: { referenceType: 'GoodsReceipt', referenceId: stt.id } });
      expect(Number(sm.unitCost)).toBe(11_500);
      expect(Number((await tx.inventoryItem.findUnique({ where: { id: item.id } })).averageCost)).toBe(11_500);
    });
  });

  it('alur penuh: STT @ perkiraan 12.000 → PI @ aktual 12.500 → Hutang Belum Tagih nol, Persediaan & WAC = aktual', async () => {
    await rollback(async (tx) => {
      const item = await newItem(tx, stampOf());
      const stt = await submitGoodsReceiptInTx(tx, { date: today(), partyId: supplierId, items: [line(item, { lockedUnitCost: 12_000 })] }, userId);
      const grItem = await tx.goodsReceiptItem.findFirst({ where: { goodsReceiptId: stt.id } });
      const pi = await submitPurchaseInvoiceInTx(
        tx,
        {
          date: today(), partyId: supplierId,
          items: [{ itemName: item.name, inventoryItemId: item.id, warehouseId, quantity: 1000, unit: 'Kg', rate: 12_500, taxPct: 0, pphPct: 0, goodsReceiptItemId: grItem.id }],
        },
        userId,
      );
      const jv = await tx.journalEntry.findUnique({ where: { entryNumber: `JV-${pi.invoiceNumber}` }, include: { items: { include: { account: true } } } });
      const sum = (no: string, side: 'debit' | 'credit') =>
        jv.items.filter((i: any) => i.account.accountNumber === no).reduce((s: number, i: any) => s + Number(i[side]), 0);
      expect(sum(accruedNo, 'debit')).toBe(12_000_000); // balik akrual STT
      expect(sum(inventoryNo, 'debit')).toBe(500_000); // selisih ke Persediaan
      expect(sum(apNo, 'credit')).toBe(12_500_000); // hutang = harga aktual

      // Saldo per dokumen: Hutang Belum Tagih nol, Persediaan = nilai aktual.
      const refs = [stt.sttNumber, pi.invoiceNumber].map((n) => `JV-${n}`);
      const jes = await tx.journalEntry.findMany({ where: { entryNumber: { in: refs } }, include: { items: { include: { account: true } } } });
      const net = (no: string) =>
        jes.flatMap((j: any) => j.items).filter((i: any) => i.account.accountNumber === no).reduce((s: number, i: any) => s + Number(i.debit) - Number(i.credit), 0);
      expect(net(accruedNo)).toBe(0);
      expect(net(inventoryNo)).toBe(12_500_000);

      const after = await tx.inventoryItem.findUnique({ where: { id: item.id } });
      expect(Number(after.averageCost)).toBe(12_500);
      const sm = await tx.stockMovement.findFirst({ where: { referenceType: 'GoodsReceipt', referenceId: stt.id } });
      expect(Number(sm.unitCost)).toBe(12_500);
      expect(Number(sm.totalValue)).toBe(12_500_000);
    });
  });

  it('barang titipan customer tetap diterima tanpa harga (GL nol)', async () => {
    await rollback(async (tx) => {
      const item = await newItem(tx, stampOf());
      const stt = await submitGoodsReceiptInTx(tx, { date: today(), partyId: supplierId, isCustomerOwned: true, items: [line(item)] }, userId);
      expect(await tx.journalEntry.findUnique({ where: { entryNumber: `JV-${stt.sttNumber}` } })).toBeNull();
      expect(Number((await tx.inventoryItem.findUnique({ where: { id: item.id } })).averageCost)).toBe(0);
    });
  });
});
