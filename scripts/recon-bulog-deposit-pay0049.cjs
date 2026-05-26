// Rekonsiliasi sub-ledger uang muka Bulog Indramayu (PAY-202604-0049).
//
// Masalah: halaman Uang Muka Pelanggan tampilkan sisa Rp 643.561.014 untuk
// Bulog, padahal party balance + GL 2.1.2 = Rp 1.034 (benar). Penyebab:
// koreksi manual JE 2 April ("Koreksi saldo awal uang muka GKP Bulog",
// DR 2.1.2 Rp 643.559.980) mengurangi GL + party balance, TAPI tidak
// tercatat sebagai aplikasi/refund di deposit PAY-0049 → halaman hitung
// sisa dari tabel aplikasi saja → phantom 643jt.
//
// Fix: set refunded_amount PAY-0049 = 643.559.980 (GL-NEUTRAL — GL sudah
// benar via koreksi April, TIDAK posting jurnal baru). Halaman hitung
// remaining = amount − applied − refunded → 1.338.902.500 − 695.341.486
// − 643.559.980 = Rp 1.034, cocok party balance + GL.

const { PrismaPg } = require('/app/server/node_modules/@prisma/adapter-pg');
const { PrismaClient } = require('/app/server/node_modules/@prisma/client');
const Decimal = require('/app/server/node_modules/decimal.js');

const PAYMENT_NUMBER = 'PAY-202604-0049';
const REFUND_AMOUNT = 643559980; // = koreksi saldo awal JE 2 April

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const pay = await prisma.payment.findUnique({
    where: { paymentNumber: PAYMENT_NUMBER },
    include: { customerDepositApplications: { where: { isCancelled: false } } },
  });
  if (!pay) throw new Error('Payment tidak ditemukan: ' + PAYMENT_NUMBER);

  const applied = pay.customerDepositApplications.reduce(
    (s, a) => s.plus(new Decimal(a.appliedAmount.toString())), new Decimal(0));
  const amount = new Decimal(pay.amount.toString());
  const curRefund = new Decimal(pay.refundedAmount.toString());

  console.log('=== SEBELUM ===');
  console.log(`amount=${amount} applied=${applied} refunded=${curRefund}`);
  console.log(`remaining (halaman) = ${amount.minus(applied).minus(curRefund)}`);

  const newRefund = curRefund.plus(REFUND_AMOUNT);
  const newRemaining = amount.minus(applied).minus(newRefund);
  console.log('\n=== SESUDAH (target) ===');
  console.log(`refunded=${newRefund} → remaining = ${newRemaining}`);

  if (process.env.APPLY !== '1') {
    console.log('\nSet APPLY=1 to execute. (GL-neutral, tidak posting jurnal)');
    await prisma.$disconnect();
    return;
  }

  await prisma.payment.update({
    where: { id: pay.id },
    data: {
      refundedAmount: newRefund.toNumber(),
      notes: (pay.notes ? pay.notes + ' | ' : '') +
        'Rekonsiliasi sub-ledger: Rp 643.559.980 sudah dikurangi via koreksi saldo awal JE 2 April (GL-neutral, bukan refund kas).',
    },
  });

  console.log('\n=== APPLIED ✓ ===');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
