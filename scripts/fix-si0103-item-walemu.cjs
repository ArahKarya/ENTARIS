// Ganti item SI-202605-0103 (Bapak Bambang, 28 Mei): Cruise 25Kg → Walemu 50Kg.
// Harga & qty TETAP (rate 14.500, qty 50, amount 725.000) → revenue/AR/payment
// TIDAK berubah. Yang berubah: item, stok (Cruise+50 / Walemu-50), COGS pindah
// akun 1.4.20 (Cruise) → 1.4.24 (Walemu). Nilai COGS 704.347 tetap (kebetulan
// = 50 × avg Walemu 14.086,94 = cost terkunci SM).
//
// Lookup by nomor + assert kondisi awal → batal otomatis kalau data beda.

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CRUISE = '63f56a91-e484-4714-9aa8-0f04257c63f8';
const WALEMU = '9d847bc2-1fba-461a-8e43-9f8f7e317af1';
const QTY = 50;

async function recalcBalance(tx, accId) {
  const acc = await tx.account.findUnique({ where: { id: accId } });
  const sum = await tx.journalItem.aggregate({
    where: { accountId: accId, journalEntry: { status: { not: 'Cancelled' } } },
    _sum: { debit: true, credit: true },
  });
  const dr = new Decimal((sum._sum.debit ?? 0).toString());
  const cr = new Decimal((sum._sum.credit ?? 0).toString());
  const bal = ['ASSET', 'EXPENSE'].includes(acc.rootType) ? dr.minus(cr) : cr.minus(dr);
  await tx.account.update({ where: { id: accId }, data: { balance: bal.toDecimalPlaces(2).toNumber() } });
  return bal.toString();
}

async function main() {
  const inv = await prisma.salesInvoice.findUnique({
    where: { invoiceNumber: 'SI-202605-0103' },
    include: { items: { include: { deliveryOrderItem: { include: { stockMovement: true } } } } },
  });
  if (!inv) throw new Error('SI-202605-0103 tidak ada');
  const sii = inv.items[0];
  const doItem = sii.deliveryOrderItem;
  const sm = doItem?.stockMovement;
  // Asserts
  if (sii.inventoryItemId !== CRUISE) throw new Error('SII bukan Cruise — abort');
  if (Number(sii.quantity) !== QTY) throw new Error('qty != 50 — abort');
  if (!sm || sm.itemId !== CRUISE || Number(sm.quantity) !== QTY) throw new Error('SM tidak cocok — abort');
  const cruise = await prisma.inventoryItem.findUnique({ where: { id: CRUISE } });
  const walemu = await prisma.inventoryItem.findUnique({ where: { id: WALEMU } });
  const wh = doItem.warehouseId;
  const smValue = new Decimal(sm.totalValue.toString());        // 704.347
  const smUnit = new Decimal(sm.unitCost.toString());           // 14.086,94

  // Cruise avg baru (kembali +50 @ smValue). Walemu avg tetap (keluar @ avg).
  const cQty = new Decimal(cruise.currentStock.toString());
  const cAvg = new Decimal(cruise.averageCost.toString());
  const cNewAvg = cQty.times(cAvg).plus(smValue).div(cQty.plus(QTY)).toDecimalPlaces(2);

  // Walemu stok cukup?
  const wWh = await prisma.inventoryStock.findUnique({ where: { itemId_warehouseId: { itemId: WALEMU, warehouseId: wh } } });
  const wWhQty = new Decimal((wWh?.currentStock ?? 0).toString());

  console.log('=== RENCANA ===');
  console.log(`SII ${sii.id}: Cruise → Walemu (rate ${sii.rate}, qty ${sii.quantity}, amount ${sii.amount} TETAP)`);
  console.log(`SM ${sm.movementNumber}: item Cruise→Walemu, unitCost ${smUnit}, totalValue ${smValue} (tetap)`);
  console.log(`Cruise stok ${cQty} → ${cQty.plus(QTY)} | avg ${cAvg} → ${cNewAvg}`);
  console.log(`Walemu stok ${walemu.currentStock} → ${new Decimal(walemu.currentStock.toString()).minus(QTY)} | avg tetap ${walemu.averageCost}`);
  console.log(`Walemu @gudang ${wWhQty} → ${wWhQty.minus(QTY)} ${wWhQty.lt(QTY) ? '⚠️ MINUS!' : ''}`);
  console.log(`COGS JE: CR 1.4.20 (Cruise) → CR 1.4.24 (Walemu) ${smValue}; HPP tetap`);

  if (wWhQty.lt(QTY)) { console.log('STOP: Walemu di gudang kurang.'); await prisma.$disconnect(); return; }
  if (process.env.APPLY !== '1') { console.log('\nSet APPLY=1 to execute.'); await prisma.$disconnect(); return; }

  await prisma.$transaction(async (tx) => {
    // 1) SII + DO item → Walemu
    await tx.salesInvoiceItem.update({ where: { id: sii.id }, data: { itemName: 'Beras Walemu 50Kg', inventoryItemId: WALEMU } });
    await tx.deliveryOrderItem.update({ where: { id: doItem.id }, data: { itemName: 'Beras Walemu 50Kg', inventoryItemId: WALEMU } });
    // 2) Stock movement → Walemu (nilai tetap)
    await tx.stockMovement.update({ where: { id: sm.id }, data: { itemId: WALEMU } });
    // 3) Stok qty: Cruise +50, Walemu -50 (item-level + per-gudang)
    await tx.inventoryItem.update({ where: { id: CRUISE }, data: { currentStock: { increment: QTY }, averageCost: cNewAvg.toNumber() } });
    await tx.inventoryItem.update({ where: { id: WALEMU }, data: { currentStock: { decrement: QTY } } });
    await tx.inventoryStock.update({ where: { itemId_warehouseId: { itemId: CRUISE, warehouseId: wh } }, data: { currentStock: { increment: QTY } } });
    await tx.inventoryStock.update({ where: { itemId_warehouseId: { itemId: WALEMU, warehouseId: wh } }, data: { currentStock: { decrement: QTY } } });
    // 4) COGS JE: pindahkan CR line dari akun Cruise (1.4.20) → akun Walemu (1.4.24)
    const cogsJe = await tx.journalEntry.findUnique({ where: { entryNumber: 'JV-COGS-SI-202605-0103' }, include: { items: { include: { account: true } } } });
    const crLine = cogsJe.items.find((l) => Number(l.credit) > 0 && l.account.accountNumber === '1.4.20');
    if (!crLine) throw new Error('CR line 1.4.20 tdk ketemu di COGS JE');
    await tx.journalItem.update({ where: { id: crLine.id }, data: { accountId: walemu.accountId } });
    // ALE sinkron
    await tx.accountingLedgerEntry.updateMany({
      where: { referenceType: 'JournalEntry', referenceId: cogsJe.id, accountId: cruise.accountId, credit: { gt: 0 } },
      data: { accountId: walemu.accountId },
    });
    // 5) recalc saldo akun Cruise(1.4.20) + Walemu(1.4.24)
    await recalcBalance(tx, cruise.accountId);
    await recalcBalance(tx, walemu.accountId);
  }, { timeout: 60000 });

  console.log('\n=== APPLIED ✓ ===');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('ERR:', e.message); await prisma.$disconnect(); process.exit(1); });
