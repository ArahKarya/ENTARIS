// Koreksi harga SI-202605-0090 (BGN Susukan - Guz Azka, 24 Mei):
// Beras Cruise 25Kg, rate 14.000 → 13.900 (qty 1.000 Kg). Delta −Rp 100.000.
// Lookup by invoice_number (aman dari display garbling) + assert kondisi awal.
//
// REVENUE side saja (COGS tetap, qty sama):
//   item.amount & invoice.grandTotal −100.000
//   invoice.outstanding = grandTotal_baru − totalPaid (recompute)
//   JV-SI: DR Piutang(1.2.1) & CR Penjualan(4.1) masing2 −100.000 (JE + ALE)
//   recalc saldo 1.2.1 + 4.1 + party outstanding
// Kalau totalPaid > grandTotal_baru → overpaid; LAPOR & stop (perlu keputusan).

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const INV = 'SI-202605-0090';
const NEW_RATE = 13900;
const EXPECT_RATE = 14000;
const EXPECT_QTY = 1000;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function recalcBalance(tx, accNum) {
  const acc = await tx.account.findFirst({ where: { accountNumber: accNum } });
  if (!acc) return;
  const sum = await tx.journalItem.aggregate({
    where: { accountId: acc.id, journalEntry: { status: { not: 'Cancelled' } } },
    _sum: { debit: true, credit: true },
  });
  const dr = new Decimal((sum._sum.debit ?? 0).toString());
  const cr = new Decimal((sum._sum.credit ?? 0).toString());
  const bal = ['ASSET', 'EXPENSE'].includes(acc.rootType) ? dr.minus(cr) : cr.minus(dr);
  await tx.account.update({ where: { id: acc.id }, data: { balance: bal.toDecimalPlaces(2).toNumber() } });
}

async function main() {
  const inv = await prisma.salesInvoice.findUnique({
    where: { invoiceNumber: INV },
    include: { items: true, customer: true },
  });
  if (!inv) throw new Error('Invoice tidak ditemukan: ' + INV);

  const line = inv.items.find((it) =>
    Number(it.rate) === EXPECT_RATE && Number(it.quantity) === EXPECT_QTY);
  if (!line) throw new Error('Baris rate=14000 qty=1000 tidak ketemu — abort (data beda).');

  const qty = new Decimal(line.quantity.toString());
  const oldAmount = new Decimal(line.amount.toString());
  const newAmount = qty.times(NEW_RATE).toDecimalPlaces(2);
  const delta = oldAmount.minus(newAmount); // +100.000
  const oldGrand = new Decimal(inv.grandTotal.toString());
  const newGrand = oldGrand.minus(delta);

  const allocs = await prisma.paymentAllocation.aggregate({
    where: { invoiceType: 'SalesInvoice', invoiceId: inv.id },
    _sum: { allocatedAmount: true },
  });
  const totalPaid = new Decimal((allocs._sum.allocatedAmount ?? 0).toString());
  const newOutstanding = newGrand.minus(totalPaid);

  console.log('=== STATE ===');
  console.log(`${INV} | ${inv.customer?.name} | ${inv.status}`);
  console.log(`item qty=${qty} rate=${line.rate} amount=${oldAmount}`);
  console.log(`grand=${oldGrand} outstanding=${inv.outstanding} paid=${totalPaid}`);
  console.log('=== TARGET ===');
  console.log(`rate=${NEW_RATE} amount=${newAmount} grand=${newGrand} outstanding=${newOutstanding}`);

  if (newOutstanding.lt(0)) {
    console.log(`\n⚠️ OVERPAID Rp ${newOutstanding.abs()} — stop, perlu keputusan refund/credit.`);
    await prisma.$disconnect(); return;
  }
  const newStatus = newOutstanding.isZero() ? 'Paid'
    : (newOutstanding.lt(newGrand) ? 'PartiallyPaid' : 'Submitted');
  console.log(`status: ${inv.status} → ${newStatus}`);

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute.');
    await prisma.$disconnect(); return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesInvoiceItem.update({ where: { id: line.id }, data: { rate: NEW_RATE, amount: newAmount.toNumber() } });
    await tx.salesInvoice.update({ where: { id: inv.id }, data: { grandTotal: newGrand.toNumber(), outstanding: newOutstanding.toNumber(), status: newStatus } });

    const je = await tx.journalEntry.findUnique({
      where: { entryNumber: `JV-${INV}` },
      include: { items: { include: { account: true } } },
    });
    if (je) {
      const dNum = delta.toNumber();
      for (const ji of je.items) {
        const num = ji.account.accountNumber;
        if (num === '1.2.1' && Number(ji.debit) > 0) {
          await tx.journalItem.update({ where: { id: ji.id }, data: { debit: new Decimal(ji.debit.toString()).minus(delta).toNumber() } });
        } else if (num === '4.1' && Number(ji.credit) > 0) {
          await tx.journalItem.update({ where: { id: ji.id }, data: { credit: new Decimal(ji.credit.toString()).minus(delta).toNumber() } });
        }
      }
      // Sinkronkan ALE (dipakai laporan Buku Besar)
      const ales = await tx.accountingLedgerEntry.findMany({
        where: { referenceType: 'JournalEntry', referenceId: je.id, isCancelled: false },
        include: { account: true },
      });
      for (const ale of ales) {
        const num = ale.account?.accountNumber;
        if (num === '1.2.1' && Number(ale.debit) > 0) {
          await tx.accountingLedgerEntry.update({ where: { id: ale.id }, data: { debit: new Decimal(ale.debit.toString()).minus(delta).toNumber() } });
        } else if (num === '4.1' && Number(ale.credit) > 0) {
          await tx.accountingLedgerEntry.update({ where: { id: ale.id }, data: { credit: new Decimal(ale.credit.toString()).minus(delta).toNumber() } });
        }
      }
      void dNum;
    }

    await recalcBalance(tx, '1.2.1');
    await recalcBalance(tx, '4.1');

    const sums = await tx.salesInvoice.aggregate({
      where: { partyId: inv.partyId, status: { not: 'Cancelled' } },
      _sum: { outstanding: true },
    });
    await tx.party.update({ where: { id: inv.partyId }, data: { outstandingAmount: Number(sums._sum.outstanding ?? 0) } });
  }, { timeout: 60000 });

  console.log('\n=== APPLIED ✓ ===');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('ERR:', e.message); await prisma.$disconnect(); process.exit(1); });
