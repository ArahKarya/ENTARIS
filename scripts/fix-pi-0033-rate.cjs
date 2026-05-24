// One-shot fix untuk revisi nota PI-202605-0033 (Basri):
// Line dengan qty 14.152 Kg, rate 7.800 → 7.900 (sesuai dokumen revisi).
//
// Approach:
//   1. Update purchase_invoice_item: rate=7900, amount=14152*7900=111800800
//   2. Update purchase_invoice: subtotal/grand_total +1415200, outstanding
//      +1415200, status Paid → PartiallyPaid (karena outstanding > 0)
//   3. Update inventoryItem.averageCost: bump by delta/current_stock (top-up
//      nilai inventory proporsional ke stok sisa)
//   4. JE adjustment: DR 1.4.3 Persediaan Gabah KB Basah / CR 2.1.1 Hutang
//      Usaha (Dagang) Rp 1.415.200
//   5. Recalc balance affected accounts + Basri outstanding

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const PI_NUMBER = 'PI-202605-0033';
const TARGET_PII_ID = '042a4a64-84b6-4215-806f-88ebc2c1d63e'; // line qty 14.152
const NEW_RATE = 7900;
const OLD_RATE = 7800;
const QTY = 14152;
const DELTA = (NEW_RATE - OLD_RATE) * QTY; // 1.415.200
const ADJ_DATE = new Date('2026-05-24T00:00:00.000Z');
const FIX_NUMBER = `JV-FIX-RATE-${PI_NUMBER}`;

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: ADJ_DATE }, endDate: { gte: ADJ_DATE } },
  });
  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' }, orderBy: { createdAt: 'asc' } });
  const acct144 = await prisma.account.findFirst({ where: { accountNumber: '1.4.3' } });
  const acct211 = await prisma.account.findFirst({ where: { accountNumber: '2.1.1' } });

  const pii = await prisma.purchaseInvoiceItem.findUnique({
    where: { id: TARGET_PII_ID },
    include: { purchaseInvoice: true },
  });
  if (!pii) throw new Error('Line item not found');
  const pi = pii.purchaseInvoice;

  // Item for averageCost bump
  const item = pii.inventoryItemId
    ? await prisma.inventoryItem.findUnique({ where: { id: pii.inventoryItemId } })
    : null;

  console.log('=== CURRENT STATE ===');
  console.log(`PI ${pi.invoiceNumber}: status=${pi.status} grand=${pi.grandTotal} outstanding=${pi.outstanding}`);
  console.log(`Line: qty=${pii.quantity} rate=${pii.rate} amount=${pii.amount}`);
  if (item) console.log(`Item ${item.code}: stock=${item.currentStock} avg=${item.averageCost}`);

  const newAmount = QTY * NEW_RATE;
  const newGrandTotal = new Decimal(pi.grandTotal.toString()).plus(DELTA);
  const newOutstanding = new Decimal(pi.outstanding.toString()).plus(DELTA);
  const newStatus = newOutstanding.gt(0)
    ? (newOutstanding.lt(newGrandTotal) ? 'PartiallyPaid' : 'Submitted')
    : 'Paid';

  console.log('\n=== TARGET ===');
  console.log(`Line: qty=${QTY} rate=${NEW_RATE} amount=${newAmount}`);
  console.log(`PI: grand_total=${newGrandTotal} outstanding=${newOutstanding} status=${newStatus}`);
  if (item) {
    const currentStock = new Decimal(item.currentStock.toString());
    if (currentStock.gt(0)) {
      const oldAvg = new Decimal(item.averageCost.toString());
      const newAvg = oldAvg.plus(new Decimal(DELTA).div(currentStock)).toDecimalPlaces(2);
      console.log(`Item ${item.code} avg: ${oldAvg} → ${newAvg}`);
    } else {
      console.log(`Item ${item.code} stock=0 — averageCost tidak diubah`);
    }
  }
  console.log(`JE adjust: DR 1.4.3 ${DELTA} / CR 2.1.1 ${DELTA}`);

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update PI item
    await tx.purchaseInvoiceItem.update({
      where: { id: TARGET_PII_ID },
      data: { rate: NEW_RATE, amount: newAmount },
    });

    // 2. Update PI header (PI tidak punya subtotal terpisah — hanya grand_total)
    await tx.purchaseInvoice.update({
      where: { id: pi.id },
      data: {
        grandTotal: newGrandTotal.toNumber(),
        outstanding: newOutstanding.toNumber(),
        status: newStatus,
      },
    });

    // 3. Update inventoryItem.averageCost (bump proporsional ke stok sisa)
    if (item && Number(item.currentStock) > 0) {
      const currentStock = new Decimal(item.currentStock.toString());
      const oldAvg = new Decimal(item.averageCost.toString());
      const newAvg = oldAvg.plus(new Decimal(DELTA).div(currentStock)).toDecimalPlaces(2);
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { averageCost: newAvg.toNumber(), updatedAt: new Date() },
      });
    }

    // 4. JE adjustment
    const journal = await tx.journalEntry.create({
      data: {
        entryNumber: FIX_NUMBER,
        date: ADJ_DATE,
        narration: `Revisi rate PI-202605-0033 line qty ${QTY}: ${OLD_RATE} → ${NEW_RATE}/Kg`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: adminUser.id,
        submittedAt: new Date(),
        items: {
          create: [
            { accountId: acct144.id, debit: DELTA, credit: 0, partyId: pi.partyId, description: `Top-up nilai Persediaan ${pi.invoiceNumber} rev rate` },
            { accountId: acct211.id, debit: 0, credit: DELTA, partyId: pi.partyId, description: `Tambah hutang Basri rev rate ${pi.invoiceNumber}` },
          ],
        },
      },
    });
    await tx.accountingLedgerEntry.createMany({
      data: [
        { date: ADJ_DATE, accountId: acct144.id, debit: DELTA, credit: 0, partyId: pi.partyId, referenceType: 'JournalEntry', referenceId: journal.id, description: `Top-up Persediaan rev ${pi.invoiceNumber}`, fiscalYearId: fiscalYear.id },
        { date: ADJ_DATE, accountId: acct211.id, debit: 0, credit: DELTA, partyId: pi.partyId, referenceType: 'JournalEntry', referenceId: journal.id, description: `Tambah hutang rev ${pi.invoiceNumber}`, fiscalYearId: fiscalYear.id },
      ],
    });

    // 5. Recalc balances + party outstanding
    for (const accId of [acct144.id, acct211.id]) {
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

    // Party outstanding (recompute from PI sums)
    const piSums = await tx.purchaseInvoice.aggregate({
      where: { partyId: pi.partyId, status: { not: 'Cancelled' } },
      _sum: { outstanding: true },
    });
    await tx.party.update({
      where: { id: pi.partyId },
      data: { outstandingAmount: Number(piSums._sum.outstanding || 0) },
    });

    return { fixNumber: FIX_NUMBER, journalId: journal.id, newStatus, newOutstanding: newOutstanding.toString() };
  }, { timeout: 60000 });

  console.log('\n=== APPLIED ===');
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
