// Tambah by-product Bekatul (7% dari input, @Rp3.500/kg) ke 4 run produksi
// Glosor di GILING bulan Mei yang belum mencatat bekatul.
//
// Pendekatan ADITIF (tidak pakai endpoint edit yang akan terblokir guard
// stok minus, karena output glosor sebagian sudah terjual):
//   1. tambah baris production_run_items (ByProduct, qty=7%×input, @3500, GILING)
//   2. stok Bekatul +qty (item.currentStock + inventory_stocks GILING)
//   3. StockMovement In (konsisten dgn health-check stock-vs-movement)
//   4. WAC Bekatul recompute (masuk @3500, existing avg 3500 → tetap)
//   5. JE: DR Persediaan Bekatul (1.4.60) / CR HPP Beras (5.1) — akui NRV
//      by-product yang mengurangi HPP. GL balance.
//   6. update production_runs.total_byproduct_value (+nilai) untuk laporan
//
// Lookup by run_number + assert kondisi (belum ada bekatul) → aman dari
// double-run.

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const RUN_NUMBERS = ['PR-202605-0002', 'PR-202605-0003', 'PR-202605-0019', 'PR-202605-0022'];
const PCT = new Decimal('0.07');
const UNIT_PRICE = new Decimal('3500');
const BEKATUL_CODE = 'SMP-BEKATUL';
const GILING_WH = 'cd338aa1-895d-47a5-ba8d-bdca33a02c8c';
const HPP_ACCOUNT_NUMBER = '5.1';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const bekatul = await prisma.inventoryItem.findFirst({ where: { code: BEKATUL_CODE } });
  if (!bekatul) throw new Error('Item Bekatul tidak ditemukan');
  const hppAcc = await prisma.account.findFirst({ where: { accountNumber: HPP_ACCOUNT_NUMBER } });
  if (!hppAcc) throw new Error('Akun 5.1 tidak ditemukan');
  const bekatulInvAcc = bekatul.accountId;
  if (!bekatulInvAcc) throw new Error('Bekatul tidak punya account_id');

  const apply = process.env.APPLY === '1';
  console.log(`=== ${apply ? 'APPLY' : 'DRY-RUN'} — tambah bekatul 7% @3500 ke ${RUN_NUMBERS.length} run Mei ===\n`);

  let grandQty = new Decimal(0);
  let grandValue = new Decimal(0);

  for (const rn of RUN_NUMBERS) {
    const run = await prisma.productionRun.findUnique({
      where: { runNumber: rn },
      include: { items: { include: { item: true } } },
    });
    if (!run) throw new Error(`Run ${rn} tidak ditemukan`);
    if (run.isCancelled) throw new Error(`Run ${rn} sudah dibatalkan`);

    // Assert: belum ada bekatul
    const hasBekatul = run.items.some((it) => it.item.code === BEKATUL_CODE);
    if (hasBekatul) {
      console.log(`  SKIP ${rn}: sudah ada bekatul.`);
      continue;
    }

    const totalInput = run.items
      .filter((it) => it.lineType === 'Input')
      .reduce((s, it) => s.plus(new Decimal(it.quantity.toString())), new Decimal(0));
    const qty = totalInput.mul(PCT).toDecimalPlaces(3);
    const value = qty.mul(UNIT_PRICE).toDecimalPlaces(2);
    grandQty = grandQty.plus(qty);
    grandValue = grandValue.plus(value);

    console.log(`  ${rn}: input ${totalInput} → bekatul ${qty} kg × 3500 = Rp ${value}`);

    if (!apply) continue;

    // 1. baris production_run_items (ByProduct)
    await prisma.productionRunItem.create({
      data: {
        productionRunId: run.id,
        itemId: bekatul.id,
        lineType: 'ByProduct',
        quantity: qty.toNumber(),
        isByProduct: true,
        unitPrice: UNIT_PRICE.toNumber(),
        warehouseId: GILING_WH,
      },
    });

    // 2. stok Bekatul +qty (item + per-gudang)
    await prisma.inventoryItem.update({
      where: { id: bekatul.id },
      data: { currentStock: { increment: qty.toNumber() } },
    });
    await prisma.inventoryStock.upsert({
      where: { itemId_warehouseId: { itemId: bekatul.id, warehouseId: GILING_WH } },
      create: { itemId: bekatul.id, warehouseId: GILING_WH, currentStock: qty.toNumber() },
      update: { currentStock: { increment: qty.toNumber() } },
    });

    // 3. StockMovement In
    const fy = run.fiscalYearId;
    // generate movement number sederhana berbasis run (hindari clash):
    const movNo = `SM-BK-${rn}`;
    await prisma.stockMovement.create({
      data: {
        movementNumber: movNo,
        date: run.date,
        itemId: bekatul.id,
        warehouseId: GILING_WH,
        movementType: 'In',
        quantity: qty.toNumber(),
        unitCost: UNIT_PRICE.toNumber(),
        totalValue: value.toNumber(),
        notes: `Bekatul by-product (backfill 7%) dari ${rn}`,
        referenceType: 'ProductionRun',
        referenceId: run.id,
        referenceNumber: rn,
        fiscalYearId: fy,
        createdById: run.createdById,
      },
    });

    // 5. JE: DR Persediaan Bekatul / CR HPP Beras
    const jvNumber = `JV-BK-${rn}`;
    const je = await prisma.journalEntry.create({
      data: {
        entryNumber: jvNumber,
        date: run.date,
        narration: `Backfill by-product Bekatul ${rn} (7% @3500)`,
        status: 'Submitted',
        submittedAt: new Date(),
        fiscalYearId: fy,
        createdBy: run.createdById,
        items: {
          create: [
            { accountId: bekatulInvAcc, debit: value.toNumber(), credit: 0, description: `Bekatul ${rn}` },
            { accountId: hppAcc.id, debit: 0, credit: value.toNumber(), description: `Pengurang HPP via by-product ${rn}` },
          ],
        },
      },
    });
    await prisma.accountingLedgerEntry.createMany({
      data: [
        { date: run.date, accountId: bekatulInvAcc, debit: value.toNumber(), credit: 0, referenceType: 'JournalEntry', referenceId: je.id, description: `Bekatul ${rn}`, fiscalYearId: fy },
        { date: run.date, accountId: hppAcc.id, debit: 0, credit: value.toNumber(), referenceType: 'JournalEntry', referenceId: je.id, description: `Pengurang HPP ${rn}`, fiscalYearId: fy },
      ],
    });
    // update saldo akun
    for (const [accId, dr, cr] of [[bekatulInvAcc, value, new Decimal(0)], [hppAcc.id, new Decimal(0), value]]) {
      const acc = await prisma.account.findUnique({ where: { id: accId } });
      const impact = ['ASSET', 'EXPENSE'].includes(acc.rootType) ? dr.minus(cr) : cr.minus(dr);
      await prisma.account.update({ where: { id: accId }, data: { balance: new Decimal(acc.balance.toString()).plus(impact).toNumber() } });
    }

    // 6. update total_byproduct_value run (utk laporan HPP)
    await prisma.productionRun.update({
      where: { id: run.id },
      data: { totalByproductValue: { increment: value.toNumber() } },
    });
  }

  // WAC bekatul recompute dari active In movements (masuk @3500, tetap 3500)
  if (apply) {
    const activeIns = await prisma.stockMovement.findMany({
      where: { itemId: bekatul.id, movementType: { in: ['In', 'AdjustmentIn', 'TransferIn'] }, isCancelled: false },
      select: { quantity: true, unitCost: true },
    });
    let q = new Decimal(0), v = new Decimal(0);
    for (const m of activeIns) {
      const qq = new Decimal(m.quantity.toString());
      q = q.plus(qq); v = v.plus(qq.mul(new Decimal(m.unitCost.toString())));
    }
    const newAvg = q.gt(0) ? v.div(q).toDecimalPlaces(2).toNumber() : 0;
    await prisma.inventoryItem.update({ where: { id: bekatul.id }, data: { averageCost: newAvg } });
    console.log(`\n  WAC Bekatul recompute → ${newAvg}`);
  }

  console.log(`\n=== TOTAL: bekatul ${grandQty} kg, nilai Rp ${grandValue} ===`);
  console.log(apply ? '=== APPLIED ✓ ===' : '\nSet APPLY=1 untuk eksekusi.');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('ERR:', e.message); await prisma.$disconnect(); process.exit(1); });
