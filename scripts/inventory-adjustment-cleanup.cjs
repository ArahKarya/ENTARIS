// Cleanup pass:
//   1. Zero-kan stok BRS-WLM-5KG (qty 0, avg 0) — sebelumnya tertinggal -15
//   2. Auto-zero residual akun 1.4.26 Pagi Jaya: bring GL ke sum nilai item
//      (435.000 = 30 × 14.500)

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const ADJUSTMENTS = [
  { code: 'BRS-WLM-5KG', newQty: 0, newAvg: 0, note: 'Zero-kan stok (tidak dipakai)' },
];
const ZERO_ACCOUNTS = ['1.4.26']; // Auto-zero Pagi Jaya juga
const WAREHOUSE_CODE = 'POLES';
const COUNTER_ACCOUNT = '8.8';
const ADJ_DATE = new Date('2026-05-22T00:00:00.000Z');
const ADJ_NOTE = 'Cleanup: zero WLM-5KG + auto-zero 1.4.26 Pagi Jaya (drift historis)';
const OPNAME_NUMBER = 'ADJ-2605-CLEANUP';

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: ADJ_DATE }, endDate: { gte: ADJ_DATE } },
  });
  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' }, orderBy: { createdAt: 'asc' } });
  const warehouse = await prisma.warehouse.findFirst({ where: { code: WAREHOUSE_CODE } });
  const counterAccount = await prisma.account.findFirst({ where: { accountNumber: COUNTER_ACCOUNT } });
  const zeroAccounts = await prisma.account.findMany({ where: { accountNumber: { in: ZERO_ACCOUNTS } } });

  const codes = ADJUSTMENTS.map((a) => a.code);
  const items = await prisma.inventoryItem.findMany({
    where: { code: { in: codes } }, include: { account: true },
  });
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  const poleStocks = await prisma.inventoryStock.findMany({
    where: { warehouseId: warehouse.id, itemId: { in: items.map((i) => i.id) } },
  });
  const poleStockByItem = new Map(poleStocks.map((s) => [s.itemId, s]));

  console.log('=== ITEM PREVIEW ===');
  const plans = [];
  for (const adj of ADJUSTMENTS) {
    const item = itemByCode.get(adj.code);
    const currentQty = new Decimal(item.currentStock.toString());
    const currentAvg = new Decimal(item.averageCost.toString());
    const newQty = new Decimal(adj.newQty);
    const newAvg = new Decimal(adj.newAvg);
    const deltaValue = newQty.times(newAvg).minus(currentQty.times(currentAvg)).toDecimalPlaces(2);
    const poleStock = poleStockByItem.get(item.id);
    const poleCurrentQty = poleStock ? new Decimal(poleStock.currentStock.toString()) : new Decimal(0);
    const poleDeltaQty = newQty.minus(poleCurrentQty);
    plans.push({ item, adj, currentQty, currentAvg, newQty, newAvg, deltaValue, poleDeltaQty });
    console.log(`${adj.code.padEnd(15)} | qty ${currentQty} → ${newQty} | avg ${currentAvg} → ${newAvg} | Δval ${deltaValue}`);
  }

  console.log('\n=== ZERO-ACCOUNT PREVIEW ===');
  const zeroOps = [];
  for (const za of zeroAccounts) {
    const currentBal = new Decimal(za.balance.toString());
    const itemDeltaInThisAccount = plans
      .filter((p) => p.item.accountId === za.id)
      .reduce((acc, p) => acc.plus(p.deltaValue), new Decimal(0));
    const balanceAfterItemAdj = currentBal.plus(itemDeltaInThisAccount);
    const accountItems = await prisma.inventoryItem.findMany({ where: { accountId: za.id } });
    let target = new Decimal(0);
    for (const ai of accountItems) {
      const plan = plans.find((p) => p.item.id === ai.id);
      const effQty = plan ? plan.newQty : new Decimal(ai.currentStock.toString());
      const effAvg = plan ? plan.newAvg : new Decimal(ai.averageCost.toString());
      target = target.plus(effQty.times(effAvg));
    }
    target = target.toDecimalPlaces(2);
    const residual = target.minus(balanceAfterItemAdj);
    zeroOps.push({ account: za, residual });
    console.log(`${za.accountNumber} ${za.name}: GL ${currentBal} → after item ${balanceAfterItemAdj} → target ${target} → residual ${residual}`);
  }

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
  const result = await prisma.$transaction(async (tx) => {
    const journalItems = [];
    const affectedAccountIds = new Set([counterAccount.id, ...zeroAccounts.map((a) => a.id)]);

    for (const p of plans) {
      const { item, newQty, newAvg, deltaValue, poleDeltaQty } = p;
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { currentStock: newQty.toNumber(), averageCost: newAvg.toNumber(), updatedAt: new Date() },
      });
      await tx.inventoryStock.upsert({
        where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouse.id } },
        create: { itemId: item.id, warehouseId: warehouse.id, currentStock: newQty.toNumber() },
        update: { currentStock: newQty.toNumber() },
      });
      if (!poleDeltaQty.isZero()) {
        // Pakai unitCost current avg sebagai paper trail; total_value
        // hitung di absDelta × currentAvg supaya tidak inflate kalau avg=0.
        const absDelta = poleDeltaQty.abs();
        const isIncrease = poleDeltaQty.gt(0);
        const recordedCost = newAvg.gt(0) ? newAvg : p.currentAvg;
        await tx.stockMovement.create({
          data: {
            movementNumber: `SM-ADJ-${yymm}-${item.code}-CLN`,
            date: ADJ_DATE,
            itemId: item.id,
            warehouseId: warehouse.id,
            movementType: isIncrease ? 'AdjustmentIn' : 'AdjustmentOut',
            quantity: absDelta.toNumber(),
            unitCost: recordedCost.toNumber(),
            totalValue: absDelta.times(recordedCost).toDecimalPlaces(2).toNumber(),
            referenceType: 'InventoryAdjustment',
            referenceNumber: OPNAME_NUMBER,
            offsetAccountId: counterAccount.id,
            notes: `${p.adj.note}: ${item.name}`,
            fiscalYearId: fiscalYear.id,
            createdById: adminUser.id,
          },
        });
      }
      if (!deltaValue.isZero()) {
        affectedAccountIds.add(item.accountId);
        const dv = deltaValue.toNumber();
        if (dv > 0) {
          journalItems.push({ accountId: item.accountId, debit: dv, credit: 0, description: `Cleanup ${item.code}` });
          journalItems.push({ accountId: counterAccount.id, debit: 0, credit: dv, description: `Cleanup ${item.code} → 8.8` });
        } else {
          const abs = Math.abs(dv);
          journalItems.push({ accountId: counterAccount.id, debit: abs, credit: 0, description: `Cleanup ${item.code} → 8.8` });
          journalItems.push({ accountId: item.accountId, debit: 0, credit: abs, description: `Cleanup ${item.code}` });
        }
      }
    }

    for (const op of zeroOps) {
      if (op.residual.isZero()) continue;
      const r = op.residual.toNumber();
      if (r > 0) {
        journalItems.push({ accountId: op.account.id, debit: r, credit: 0, description: `Auto-zero ${op.account.accountNumber} (drift historis)` });
        journalItems.push({ accountId: counterAccount.id, debit: 0, credit: r, description: `Auto-zero ${op.account.accountNumber} → 8.8` });
      } else {
        const abs = Math.abs(r);
        journalItems.push({ accountId: counterAccount.id, debit: abs, credit: 0, description: `Auto-zero ${op.account.accountNumber} → 8.8` });
        journalItems.push({ accountId: op.account.id, debit: 0, credit: abs, description: `Auto-zero ${op.account.accountNumber} (drift historis)` });
      }
    }

    let journalEntryId = null;
    if (journalItems.length > 0) {
      const journal = await tx.journalEntry.create({
        data: {
          entryNumber: `JV-${OPNAME_NUMBER}`,
          date: ADJ_DATE,
          narration: ADJ_NOTE,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: adminUser.id,
          submittedAt: new Date(),
          items: { create: journalItems },
        },
      });
      journalEntryId = journal.id;
      await tx.accountingLedgerEntry.createMany({
        data: journalItems.map((ji) => ({
          date: ADJ_DATE,
          accountId: ji.accountId,
          debit: ji.debit,
          credit: ji.credit,
          referenceType: 'JournalEntry',
          referenceId: journal.id,
          description: ji.description,
          fiscalYearId: fiscalYear.id,
        })),
      });
    }

    for (const accountId of affectedAccountIds) {
      const sum = await tx.journalItem.aggregate({
        where: { accountId, journalEntry: { status: { not: 'Cancelled' } } },
        _sum: { debit: true, credit: true },
      });
      const account = await tx.account.findUnique({ where: { id: accountId } });
      const dr = new Decimal((sum._sum.debit || 0).toString());
      const cr = new Decimal((sum._sum.credit || 0).toString());
      const balance = ['ASSET', 'EXPENSE'].includes(account.rootType) ? dr.minus(cr) : cr.minus(dr);
      await tx.account.update({ where: { id: accountId }, data: { balance: balance.toDecimalPlaces(2).toNumber() } });
    }
    return { opnameNumber: OPNAME_NUMBER, journalEntryId, journalLineCount: journalItems.length };
  }, { timeout: 60000 });

  console.log('\n=== APPLIED ===');
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
