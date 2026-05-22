// Final cleanup: auto-zero semua akun persediaan (1.4.x) supaya GL =
// sum(item.qty × item.avg) untuk semua item di akun tsb. Plus zero residual
// 5.11 Selisih Harga Pembelian. Counter ke 8.8 Pembulatan & Selisih.
//
// Drift saat ini (per audit 22 Mei post-cleanup):
//   1.4.20 Cruise: +Rp 69,2jt
//   1.4.59 Reject Poles: +Rp 25,2jt
//   1.4.43 HGL: +Rp 22,7jt
//   1.4.52 PK Kebo: +Rp 17jt (item value 0)
//   1.4.5 GKP-IR (GILING): +Rp 9,2jt
//   1.4.58 Menir Jitay: -Rp 7,9jt (item > GL)
//   ... dan minor drifts < Rp 1jt untuk akun lain
//
// Pakai threshold: drift > Rp 1 saja yg di-adjust supaya tidak noise.

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const ADJ_DATE = new Date('2026-05-22T00:00:00.000Z');
const OPNAME_NUMBER = 'ADJ-2605-FINAL-ZERO';
const COUNTER_ACCOUNT = '8.8';
const DRIFT_THRESHOLD = 1; // ignore drift < Rp 1

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const fiscalYear = await prisma.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: ADJ_DATE }, endDate: { gte: ADJ_DATE } },
  });
  const adminUser = await prisma.user.findFirst({ where: { role: 'Admin' }, orderBy: { createdAt: 'asc' } });
  const counterAccount = await prisma.account.findFirst({ where: { accountNumber: COUNTER_ACCOUNT } });

  // 1. Find all 1.4.x accounts + compute drift
  const invAccounts = await prisma.account.findMany({
    where: { accountNumber: { startsWith: '1.4.' }, isGroup: false },
  });
  const itemsByAccount = await prisma.inventoryItem.findMany({
    select: { accountId: true, currentStock: true, averageCost: true },
  });
  const acctItemSum = new Map();
  for (const it of itemsByAccount) {
    if (!it.accountId) continue;
    const cur = acctItemSum.get(it.accountId) || new Decimal(0);
    const val = new Decimal(it.currentStock.toString()).times(new Decimal(it.averageCost.toString()));
    acctItemSum.set(it.accountId, cur.plus(val));
  }

  const adjustments = [];
  for (const acc of invAccounts) {
    const gl = new Decimal(acc.balance.toString());
    const target = (acctItemSum.get(acc.id) || new Decimal(0)).toDecimalPlaces(2);
    const drift = gl.minus(target); // positive = GL > target → need CR acc / DR 8.8
    if (drift.abs().gt(DRIFT_THRESHOLD)) {
      adjustments.push({ acc, gl, target, drift });
    }
  }

  // 2. Add 5.11 zero-out
  const acct511 = await prisma.account.findFirst({ where: { accountNumber: '5.11' } });
  const bal511 = new Decimal(acct511.balance.toString());
  if (bal511.abs().gt(DRIFT_THRESHOLD)) {
    // 5.11 is EXPENSE — DR balance is positive. To zero: CR 5.11 / DR 8.8
    // drift "treated like" GL - target where target = 0
    adjustments.push({ acc: acct511, gl: bal511, target: new Decimal(0), drift: bal511 });
  }

  console.log('=== PREVIEW ===');
  let totalDriftAbsorbed = new Decimal(0);
  for (const adj of adjustments) {
    console.log(`${adj.acc.accountNumber.padEnd(8)} ${adj.acc.name.padEnd(40)} GL ${adj.gl.toString().padStart(16)} → target ${adj.target.toString().padStart(14)} → drift ${adj.drift.toString().padStart(14)}`);
    totalDriftAbsorbed = totalDriftAbsorbed.plus(adj.drift);
  }
  console.log(`\nNet drift absorbed by 8.8: ${totalDriftAbsorbed.toString()}`);

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute.');
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const journalItems = [];
    const affectedAccountIds = new Set([counterAccount.id]);
    for (const adj of adjustments) {
      affectedAccountIds.add(adj.acc.id);
      const d = adj.drift.toNumber();
      // drift > 0 → GL terlalu tinggi → CR akun, DR 8.8
      // drift < 0 → GL terlalu rendah → DR akun, CR 8.8
      if (d > 0) {
        journalItems.push({ accountId: counterAccount.id, debit: d, credit: 0, description: `Auto-zero ${adj.acc.accountNumber} (drift +)` });
        journalItems.push({ accountId: adj.acc.id, debit: 0, credit: d, description: `Auto-zero ${adj.acc.accountNumber}` });
      } else {
        const abs = Math.abs(d);
        journalItems.push({ accountId: adj.acc.id, debit: abs, credit: 0, description: `Auto-zero ${adj.acc.accountNumber}` });
        journalItems.push({ accountId: counterAccount.id, debit: 0, credit: abs, description: `Auto-zero ${adj.acc.accountNumber} (drift -)` });
      }
    }

    const journal = await tx.journalEntry.create({
      data: {
        entryNumber: `JV-${OPNAME_NUMBER}`,
        date: ADJ_DATE,
        narration: 'Final auto-zero drift historis akun persediaan + 5.11',
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: adminUser.id,
        submittedAt: new Date(),
        items: { create: journalItems },
      },
    });
    await tx.accountingLedgerEntry.createMany({
      data: journalItems.map((ji) => ({
        date: ADJ_DATE, accountId: ji.accountId, debit: ji.debit, credit: ji.credit,
        referenceType: 'JournalEntry', referenceId: journal.id,
        description: ji.description, fiscalYearId: fiscalYear.id,
      })),
    });

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
    return { opnameNumber: OPNAME_NUMBER, journalId: journal.id, adjustments: adjustments.length };
  }, { timeout: 60000 });

  console.log('\n=== APPLIED ===');
  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
