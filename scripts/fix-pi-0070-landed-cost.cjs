// Retroactive landed cost fix untuk PI-202605-0070 (PT. BPR Broken 50kg +
// Komisi Cepong). Sesuai prinsip user: "biaya2 diluar material (komisi,
// resiko, dll) diserap ke akun material yang dibeli, bukan ke akun lain".
//
// Current state:
//   STT-0050 inbound 10.000 Kg @ stockMovement.unit_cost=12.000 (total 120jt)
//   tapi GL DR 1.4.56 = 103.769.500 (= 10.000 × stale avg 10.376,95).
//   PI-0070 grand_total 121jt. JE post:
//     DR 2.1.5 103.769.500 (reverse accrual)
//     DR 5.11  17.230.500 (variance 16,23jt + komisi 1jt)
//     CR 2.1.1 121.000.000
//   → 17.230.500 nyangkut di 5.11 sebagai expense, padahal harusnya jadi
//     biaya bahan baku.
//
// Target:
//   StockMovement SM-202605-0625: unit_cost 12.100, total_value 121.000.000
//   InventoryItem averageCost: 12.088,50 (= (10.000×12.100 + 1.300×12.000) / 11.300)
//   1.4.56 final: 119.369.542 + 17.230.500 = 136.600.042
//   5.11: 17.230.500 reversed (jadi 0 dari PI ini)
//
// JE: JV-FIX-LANDED-PI-202605-0070

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const PI_NUMBER = 'PI-202605-0070';
const STT_SM_ID = '4894ebbd-d8d7-4e89-9a57-028cf7075e53'; // SM-202605-0625
const STT_QTY = 10000;
const PI_TOTAL = 121000000; // grand_total
const NEW_LANDED_UNIT_COST = 12100; // 121jt / 10.000 Kg
const VARIANCE_TO_RECLASS = 17230500; // current DR 5.11 from PI-0070
const ADJ_DATE = new Date('2026-05-22T00:00:00.000Z');
const FIX_NUMBER = `JV-FIX-LANDED-${PI_NUMBER}`;

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: ADJ_DATE }, endDate: { gte: ADJ_DATE } },
  });
  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' }, orderBy: { createdAt: 'asc' } });
  const acct511 = await prisma.account.findFirst({ where: { accountNumber: '5.11' } });
  const acct1456 = await prisma.account.findFirst({ where: { accountNumber: '1.4.56' } });

  // Sanity check existing state
  const sm = await prisma.stockMovement.findUnique({ where: { id: STT_SM_ID } });
  if (!sm) throw new Error('StockMovement not found: ' + STT_SM_ID);
  const item = await prisma.inventoryItem.findUnique({ where: { id: sm.itemId } });
  console.log('=== CURRENT STATE ===');
  console.log(`SM: qty=${sm.quantity} unitCost=${sm.unitCost} totalValue=${sm.totalValue}`);
  console.log(`Item ${item.code}: currentStock=${item.currentStock} averageCost=${item.averageCost}`);
  console.log(`1.4.56 balance: ${acct1456.balance}`);
  console.log(`5.11 balance: ${acct511.balance}`);

  // Verify variance amount in 5.11 from PI-0070
  const jePI = await prisma.journalEntry.findFirst({
    where: { entryNumber: `JV-${PI_NUMBER}` },
    include: { items: { include: { account: true } } },
  });
  const dr511FromPI = jePI.items.find((i) => i.account.accountNumber === '5.11')?.debit;
  console.log(`PI-0070 DR 5.11: ${dr511FromPI} (script assumes ${VARIANCE_TO_RECLASS})`);
  if (!dr511FromPI || dr511FromPI.toString() !== VARIANCE_TO_RECLASS.toString()) {
    throw new Error('Variance amount mismatch — abort');
  }

  // Compute new averageCost: total value setelah landed / total stock
  // Pre-fix: 11.300 Kg @ 12.000 (current avg) → total value 135.600.000
  // Post-fix: add 1.000.000 komisi to inventory → 136.600.000 → avg 12.088,50
  const currentStock = new Decimal(item.currentStock.toString());
  const currentAvg = new Decimal(item.averageCost.toString());
  const currentTotalValue = currentStock.times(currentAvg);
  const newTotalValue = currentTotalValue.plus(1000000); // add komisi
  const newAvg = newTotalValue.div(currentStock).toDecimalPlaces(2);
  console.log(`\n=== TARGET ===`);
  console.log(`SM: unitCost ${NEW_LANDED_UNIT_COST}, totalValue ${PI_TOTAL}`);
  console.log(`Item: averageCost ${newAvg}`);
  console.log(`JE reclass: DR 1.4.56 ${VARIANCE_TO_RECLASS} / CR 5.11 ${VARIANCE_TO_RECLASS}`);

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update stockMovement
    await tx.stockMovement.update({
      where: { id: STT_SM_ID },
      data: {
        unitCost: NEW_LANDED_UNIT_COST,
        totalValue: PI_TOTAL,
      },
    });

    // 2. Update inventoryItem averageCost
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { averageCost: newAvg.toNumber(), updatedAt: new Date() },
    });

    // 3. JE reclass: DR 1.4.56 / CR 5.11
    const journal = await tx.journalEntry.create({
      data: {
        entryNumber: FIX_NUMBER,
        date: ADJ_DATE,
        narration: `Reclass landed cost ${PI_NUMBER}: komisi + variance ke akun material`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: adminUser.id,
        submittedAt: new Date(),
        items: {
          create: [
            { accountId: acct1456.id, debit: VARIANCE_TO_RECLASS, credit: 0, description: `Reclass landed cost ${PI_NUMBER} → Persediaan` },
            { accountId: acct511.id, debit: 0, credit: VARIANCE_TO_RECLASS, description: `Reverse variance ${PI_NUMBER} → reclass ke material` },
          ],
        },
      },
    });
    await tx.accountingLedgerEntry.createMany({
      data: [
        { date: ADJ_DATE, accountId: acct1456.id, debit: VARIANCE_TO_RECLASS, credit: 0, referenceType: 'JournalEntry', referenceId: journal.id, description: `Reclass landed cost ${PI_NUMBER}`, fiscalYearId: fiscalYear.id },
        { date: ADJ_DATE, accountId: acct511.id, debit: 0, credit: VARIANCE_TO_RECLASS, referenceType: 'JournalEntry', referenceId: journal.id, description: `Reverse variance ${PI_NUMBER}`, fiscalYearId: fiscalYear.id },
      ],
    });

    // 4. Recalc affected balances
    for (const accId of [acct1456.id, acct511.id]) {
      const sum = await tx.journalItem.aggregate({
        where: { accountId: accId, journalEntry: { status: { not: 'Cancelled' } } },
        _sum: { debit: true, credit: true },
      });
      const acc = await tx.account.findUnique({ where: { id: accId } });
      const dr = new Decimal((sum._sum.debit || 0).toString());
      const cr = new Decimal((sum._sum.credit || 0).toString());
      const balance = ['ASSET', 'EXPENSE'].includes(acc.rootType) ? dr.minus(cr) : cr.minus(dr);
      await tx.account.update({ where: { id: accId }, data: { balance: balance.toDecimalPlaces(2).toNumber() } });
    }
    return { fixNumber: FIX_NUMBER, journalId: journal.id };
  }, { timeout: 60000 });

  console.log('\n=== APPLIED ===');
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
