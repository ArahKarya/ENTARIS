// One-shot inventory adjustment script for POLES warehouse.
// Resets currentStock + averageCost for selected items based on physical count
// + actual cost confirmed by warehouse staff. Posts adjustment JE to 8.8
// Pembulatan & Selisih.
//
// Approach:
//   1. Per item: compute delta_qty = new_qty - current_global_qty,
//      old_value = current_qty * current_avg, new_value = new_qty * new_avg,
//      delta_value = new_value - old_value
//   2. Update inventory_items (set absolute qty + avg directly — bypass WAC)
//   3. Upsert inventory_stocks[POLES] to new_qty
//   4. Create StockMovement (AdjustmentIn/Out) with unit_cost = new_avg for audit
//   5. Single JournalEntry: DR/CR Persediaan_item against 8.8 Pembulatan & Selisih
//   6. Recalc affected account balances from authoritative JE sums.

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const ADJUSTMENTS = [
  { code: 'PK-IRBO',      newQty: 1830, newAvg: 12231 },
  { code: 'BRS-PGC-25KG', newQty: 300,  newAvg: 14200 },
  { code: 'BRS-WLM-5KG',  newQty: 750,  newAvg: 14100 },
  { code: 'BRS-HGL-50KG', newQty: 6150, newAvg: 13294 },
  { code: 'BRS-MCL-50KG', newQty: 4050, newAvg: null /* keep current */ },
  { code: 'BRS-PGJ-5KG',  newQty: 30,   newAvg: 14500 },
  { code: 'BRS-PGC-5KG',  newQty: 0,    newAvg: 0 },
];

const WAREHOUSE_CODE = 'POLES';
const COUNTER_ACCOUNT = '8.8'; // Pembulatan & Selisih
const ADJ_DATE = new Date('2026-05-22T00:00:00.000Z');
const ADJ_NOTE = 'Reset stok & modal fisik gudang POLES (rekonsiliasi 22 Mei 2026)';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: ADJ_DATE }, endDate: { gte: ADJ_DATE } },
  });
  if (!fiscalYear) throw new Error('No active fiscal year for ' + ADJ_DATE);

  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' }, orderBy: { createdAt: 'asc' } });
  if (!adminUser) throw new Error('No admin user');

  const warehouse = await prisma.warehouse.findFirst({ where: { code: WAREHOUSE_CODE } });
  if (!warehouse) throw new Error('Warehouse not found: ' + WAREHOUSE_CODE);

  const counterAccount = await prisma.account.findFirst({ where: { accountNumber: COUNTER_ACCOUNT } });
  if (!counterAccount) throw new Error('Counter account not found: ' + COUNTER_ACCOUNT);

  // Load items + their inventory accounts
  const codes = ADJUSTMENTS.map((a) => a.code);
  const items = await prisma.inventoryItem.findMany({
    where: { code: { in: codes } },
    include: { account: true },
  });
  const itemByCode = new Map(items.map((i) => [i.code, i]));
  for (const code of codes) {
    if (!itemByCode.has(code)) throw new Error('Item not found: ' + code);
  }

  // Pre-fetch POLES per-warehouse stock
  const poleStocks = await prisma.inventoryStock.findMany({
    where: { warehouseId: warehouse.id, itemId: { in: items.map((i) => i.id) } },
  });
  const poleStockByItem = new Map(poleStocks.map((s) => [s.itemId, s]));

  console.log('=== PREVIEW ===');
  const plans = [];
  for (const adj of ADJUSTMENTS) {
    const item = itemByCode.get(adj.code);
    if (!item.accountId) throw new Error(`Item ${adj.code} has no accountId`);
    const currentQty = new Decimal(item.currentStock.toString());
    const currentAvg = new Decimal(item.averageCost.toString());
    const newQty = new Decimal(adj.newQty);
    const newAvg = adj.newAvg == null ? currentAvg : new Decimal(adj.newAvg);
    const oldValue = currentQty.times(currentAvg).toDecimalPlaces(2);
    const newValue = newQty.times(newAvg).toDecimalPlaces(2);
    const deltaValue = newValue.minus(oldValue);
    const deltaQty = newQty.minus(currentQty);
    const poleStock = poleStockByItem.get(item.id);
    const poleCurrentQty = poleStock ? new Decimal(poleStock.currentStock.toString()) : new Decimal(0);
    const poleDeltaQty = newQty.minus(poleCurrentQty);
    plans.push({ item, adj, currentQty, currentAvg, newQty, newAvg, oldValue, newValue, deltaValue, deltaQty, poleDeltaQty });
    console.log(`${adj.code.padEnd(15)} | qty ${currentQty.toString().padStart(10)} → ${newQty.toString().padStart(10)} | avg ${currentAvg.toString().padStart(12)} → ${newAvg.toString().padStart(10)} | Δval ${deltaValue.toString().padStart(18)} | Δqty(POLES) ${poleDeltaQty.toString()}`);
  }
  const totalDelta = plans.reduce((acc, p) => acc.plus(p.deltaValue), new Decimal(0));
  console.log(`\nTOTAL DELTA: ${totalDelta.toString()} (DR Persediaan / CR ${COUNTER_ACCOUNT})`);
  console.log('');

  if (process.env.APPLY !== '1') {
    console.log('Set APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  // Generate adjustment number (manual since not via documentNumber util)
  const today = new Date();
  const yymm = today.toISOString().slice(2, 7).replace('-', '');
  const opnameNumber = `ADJ-${yymm}-POLES`;

  const result = await prisma.$transaction(async (tx) => {
    const journalItems = [];
    const movements = [];
    const affectedAccountIds = new Set([counterAccount.id]);

    for (const p of plans) {
      const { item, newQty, newAvg, deltaValue, deltaQty, poleDeltaQty } = p;

      // 1. Update inventory_items DIRECTLY (bypass WAC formula).
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          currentStock: newQty.toNumber(),
          averageCost: newAvg.toNumber(),
          updatedAt: new Date(),
        },
      });

      // 2. Upsert per-warehouse stock (POLES set to absolute newQty)
      await tx.inventoryStock.upsert({
        where: { itemId_warehouseId: { itemId: item.id, warehouseId: warehouse.id } },
        create: { itemId: item.id, warehouseId: warehouse.id, currentStock: newQty.toNumber() },
        update: { currentStock: newQty.toNumber() },
      });

      // 3. Create StockMovement for audit trail (only if delta != 0)
      if (!poleDeltaQty.isZero()) {
        const absDelta = poleDeltaQty.abs();
        const isIncrease = poleDeltaQty.gt(0);
        const movementType = isIncrease ? 'AdjustmentIn' : 'AdjustmentOut';
        const totalValue = absDelta.times(newAvg).toDecimalPlaces(2).toNumber();
        const movNumber = `SM-ADJ-${yymm}-${item.code}`;
        const mov = await tx.stockMovement.create({
          data: {
            movementNumber: movNumber,
            date: ADJ_DATE,
            itemId: item.id,
            warehouseId: warehouse.id,
            movementType,
            quantity: absDelta.toNumber(),
            unitCost: newAvg.toNumber(),
            totalValue,
            referenceType: 'InventoryAdjustment',
            referenceNumber: opnameNumber,
            offsetAccountId: counterAccount.id,
            notes: `${ADJ_NOTE}: ${item.name}`,
            fiscalYearId: fiscalYear.id,
            createdById: adminUser.id,
          },
        });
        movements.push(mov);
      }

      // 4. JE: post deltaValue to item's inventory account
      if (!deltaValue.isZero()) {
        affectedAccountIds.add(item.accountId);
        const dv = deltaValue.toNumber();
        if (dv > 0) {
          journalItems.push({ accountId: item.accountId, debit: dv,  credit: 0,  description: `Reset stok ${item.code} (+${deltaQty.toFixed(3)} Kg @ ${newAvg.toFixed(2)})` });
          journalItems.push({ accountId: counterAccount.id, debit: 0, credit: dv, description: `Reset stok ${item.code} → 8.8` });
        } else {
          const abs = Math.abs(dv);
          journalItems.push({ accountId: counterAccount.id, debit: abs, credit: 0, description: `Reset stok ${item.code} → 8.8` });
          journalItems.push({ accountId: item.accountId, debit: 0, credit: abs, description: `Reset stok ${item.code} (${deltaQty.toFixed(3)} Kg @ ${newAvg.toFixed(2)})` });
        }
      }
    }

    let journalEntryId = null;
    if (journalItems.length > 0) {
      const jvNumber = `JV-${opnameNumber}`;
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

    // 5. Recalc affected account balances from authoritative JE sums.
    for (const accountId of affectedAccountIds) {
      const sum = await tx.journalItem.aggregate({
        where: {
          accountId,
          journalEntry: { status: { not: 'Cancelled' } },
        },
        _sum: { debit: true, credit: true },
      });
      const account = await tx.account.findUnique({ where: { id: accountId } });
      const dr = new Decimal((sum._sum.debit || 0).toString());
      const cr = new Decimal((sum._sum.credit || 0).toString());
      // For ASSET/EXPENSE: balance = dr - cr. For LIABILITY/EQUITY/REVENUE: cr - dr.
      const balance = ['ASSET', 'EXPENSE'].includes(account.rootType)
        ? dr.minus(cr)
        : cr.minus(dr);
      await tx.account.update({
        where: { id: accountId },
        data: { balance: balance.toDecimalPlaces(2).toNumber() },
      });
    }

    return { opnameNumber, journalEntryId, movementCount: movements.length, journalLineCount: journalItems.length };
  }, { timeout: 60000 });

  console.log('=== APPLIED ===');
  console.log(JSON.stringify(result, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
