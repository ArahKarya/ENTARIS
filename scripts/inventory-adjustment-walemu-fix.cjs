// One-shot fix untuk salah input WLM-5KG (seharusnya WLM-50KG) di
// adjustment ADJ-2605-POLES yang baru saja jalan, plus auto-zero residual
// saldo akun 1.4.24 Walemu (drift dari corruption historis avg WLM-50KG).
//
// Steps:
//   1. Revert WLM-5KG ke state pre-input (qty -15, avg 0) → CR 1.4.24 10.575.000
//   2. Apply WLM-50KG = 750 Kg @ 14.100/Kg → CR 1.4.24 230.755.031,58
//   3. Auto-zero residual 1.4.24: post adjustment supaya GL = sum nilai item
//      valid (10.575.000)

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const ADJUSTMENTS = [
  { code: 'BRS-WLM-5KG',  newQty: -15, newAvg: 0,     note: 'Revert salah input (seharusnya WLM-50KG)' },
  { code: 'BRS-WLM-50KG', newQty: 750, newAvg: 14100, note: 'Reset fisik gudang POLES' },
];

const ZERO_ACCOUNT = '1.4.24'; // Auto-zero akun Walemu setelah item-level adjustment
const WAREHOUSE_CODE = 'POLES';
const COUNTER_ACCOUNT = '8.8';
const ADJ_DATE = new Date('2026-05-22T00:00:00.000Z');
const ADJ_NOTE = 'Koreksi salah input WLM-5KG → WLM-50KG + auto-zero residual 1.4.24';
const OPNAME_NUMBER = 'ADJ-2605-WLM-FIX';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error('DATABASE_URL not set'); process.exit(1); }
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: ADJ_DATE }, endDate: { gte: ADJ_DATE } },
  });
  if (!fiscalYear) throw new Error('No active fiscal year');
  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' }, orderBy: { createdAt: 'asc' } });
  const warehouse = await prisma.warehouse.findFirst({ where: { code: WAREHOUSE_CODE } });
  const counterAccount = await prisma.account.findFirst({ where: { accountNumber: COUNTER_ACCOUNT } });
  const zeroAccount = await prisma.account.findFirst({ where: { accountNumber: ZERO_ACCOUNT } });
  if (!warehouse || !counterAccount || !zeroAccount) throw new Error('Missing reference data');

  const codes = ADJUSTMENTS.map((a) => a.code);
  const items = await prisma.inventoryItem.findMany({
    where: { code: { in: codes } },
    include: { account: true },
  });
  const itemByCode = new Map(items.map((i) => [i.code, i]));

  const poleStocks = await prisma.inventoryStock.findMany({
    where: { warehouseId: warehouse.id, itemId: { in: items.map((i) => i.id) } },
  });
  const poleStockByItem = new Map(poleStocks.map((s) => [s.itemId, s]));

  console.log('=== PREVIEW ===');
  const plans = [];
  for (const adj of ADJUSTMENTS) {
    const item = itemByCode.get(adj.code);
    if (!item) throw new Error('Item not found: ' + adj.code);
    const currentQty = new Decimal(item.currentStock.toString());
    const currentAvg = new Decimal(item.averageCost.toString());
    const newQty = new Decimal(adj.newQty);
    const newAvg = new Decimal(adj.newAvg);
    const oldValue = currentQty.times(currentAvg).toDecimalPlaces(2);
    const newValue = newQty.times(newAvg).toDecimalPlaces(2);
    const deltaValue = newValue.minus(oldValue);
    const deltaQty = newQty.minus(currentQty);
    const poleStock = poleStockByItem.get(item.id);
    const poleCurrentQty = poleStock ? new Decimal(poleStock.currentStock.toString()) : new Decimal(0);
    const poleDeltaQty = newQty.minus(poleCurrentQty);
    plans.push({ item, adj, currentQty, currentAvg, newQty, newAvg, oldValue, newValue, deltaValue, deltaQty, poleDeltaQty });
    console.log(`${adj.code.padEnd(15)} | qty ${currentQty.toString().padStart(8)} → ${newQty.toString().padStart(8)} | avg ${currentAvg.toString().padStart(12)} → ${newAvg.toString().padStart(8)} | Δval ${deltaValue.toString().padStart(20)}`);
  }
  const itemDeltaTotal = plans.reduce((acc, p) => acc.plus(p.deltaValue), new Decimal(0));
  console.log(`\nItem-level delta total: ${itemDeltaTotal.toString()}`);

  // Auto-zero step: hitung saldo akun 1.4.24 SETELAH item-level adjustment,
  // dibandingkan dengan target = sum nilai semua item yg pakai 1.4.24.
  const zeroAccountBalance = new Decimal(zeroAccount.balance.toString());
  // Item delta yg memengaruhi 1.4.24:
  const itemDeltaToZeroAccount = plans
    .filter((p) => p.item.accountId === zeroAccount.id)
    .reduce((acc, p) => acc.plus(p.deltaValue), new Decimal(0));
  const balanceAfterItemAdj = zeroAccountBalance.plus(itemDeltaToZeroAccount);

  // Target = sum (qty × avg) untuk semua item yg pakai 1.4.24
  const accountItems = await prisma.inventoryItem.findMany({ where: { accountId: zeroAccount.id } });
  let targetBalance = new Decimal(0);
  for (const ai of accountItems) {
    // Pakai value yg AKAN ada setelah adjustment (kalau ada di plans, pakai nilai baru)
    const plan = plans.find((p) => p.item.id === ai.id);
    const effectiveQty = plan ? plan.newQty : new Decimal(ai.currentStock.toString());
    const effectiveAvg = plan ? plan.newAvg : new Decimal(ai.averageCost.toString());
    targetBalance = targetBalance.plus(effectiveQty.times(effectiveAvg));
  }
  targetBalance = targetBalance.toDecimalPlaces(2);
  const residualDelta = targetBalance.minus(balanceAfterItemAdj);
  console.log(`\n${ZERO_ACCOUNT} balance saat ini: ${zeroAccountBalance.toString()}`);
  console.log(`${ZERO_ACCOUNT} setelah item adj: ${balanceAfterItemAdj.toString()}`);
  console.log(`${ZERO_ACCOUNT} target (sum nilai item): ${targetBalance.toString()}`);
  console.log(`${ZERO_ACCOUNT} residual delta (DR ${ZERO_ACCOUNT} / CR ${COUNTER_ACCOUNT}): ${residualDelta.toString()}`);
  console.log('');

  if (process.env.APPLY !== '1') {
    console.log('Set APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
  const result = await prisma.$transaction(async (tx) => {
    const journalItems = [];
    const affectedAccountIds = new Set([counterAccount.id, zeroAccount.id]);

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
        const absDelta = poleDeltaQty.abs();
        const isIncrease = poleDeltaQty.gt(0);
        const movNumber = `SM-ADJ-${yymm}-${item.code}-FIX`;
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber,
            date: ADJ_DATE,
            itemId: item.id,
            warehouseId: warehouse.id,
            movementType: isIncrease ? 'AdjustmentIn' : 'AdjustmentOut',
            quantity: absDelta.toNumber(),
            unitCost: newAvg.toNumber(),
            totalValue: absDelta.times(newAvg).toDecimalPlaces(2).toNumber(),
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
          journalItems.push({ accountId: item.accountId, debit: dv, credit: 0, description: `Koreksi ${item.code} → ${newAvg.toFixed(2)}/Kg` });
          journalItems.push({ accountId: counterAccount.id, debit: 0, credit: dv, description: `Koreksi ${item.code} → 8.8` });
        } else {
          const abs = Math.abs(dv);
          journalItems.push({ accountId: counterAccount.id, debit: abs, credit: 0, description: `Koreksi ${item.code} → 8.8` });
          journalItems.push({ accountId: item.accountId, debit: 0, credit: abs, description: `Koreksi ${item.code} → ${newAvg.toFixed(2)}/Kg` });
        }
      }
    }

    // Auto-zero residual
    if (!residualDelta.isZero()) {
      const rdNum = residualDelta.toNumber();
      if (rdNum > 0) {
        journalItems.push({ accountId: zeroAccount.id, debit: rdNum, credit: 0, description: `Auto-zero residual ${ZERO_ACCOUNT} (drift historis)` });
        journalItems.push({ accountId: counterAccount.id, debit: 0, credit: rdNum, description: `Auto-zero residual ${ZERO_ACCOUNT} → 8.8` });
      } else {
        const abs = Math.abs(rdNum);
        journalItems.push({ accountId: counterAccount.id, debit: abs, credit: 0, description: `Auto-zero residual ${ZERO_ACCOUNT} → 8.8` });
        journalItems.push({ accountId: zeroAccount.id, debit: 0, credit: abs, description: `Auto-zero residual ${ZERO_ACCOUNT} (drift historis)` });
      }
    }

    let journalEntryId = null;
    if (journalItems.length > 0) {
      const jvNumber = `JV-${OPNAME_NUMBER}`;
      const journal = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
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

    // Recalc affected balances dari authoritative JE sums
    for (const accountId of affectedAccountIds) {
      const sum = await tx.journalItem.aggregate({
        where: { accountId, journalEntry: { status: { not: 'Cancelled' } } },
        _sum: { debit: true, credit: true },
      });
      const account = await tx.account.findUnique({ where: { id: accountId } });
      const dr = new Decimal((sum._sum.debit || 0).toString());
      const cr = new Decimal((sum._sum.credit || 0).toString());
      const balance = ['ASSET', 'EXPENSE'].includes(account.rootType) ? dr.minus(cr) : cr.minus(dr);
      await tx.account.update({
        where: { id: accountId },
        data: { balance: balance.toDecimalPlaces(2).toNumber() },
      });
    }

    return { opnameNumber: OPNAME_NUMBER, journalEntryId, journalLineCount: journalItems.length };
  }, { timeout: 60000 });

  console.log('=== APPLIED ===');
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
