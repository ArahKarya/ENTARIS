/**
 * Integration test: submitPaymentInTx — Receive + Pay branches.
 *
 * Flow per test:
 *   1. Create throwaway party + submit invoice via service
 *   2. Submit payment via service
 *   3. Assert: party.outstandingAmount = 0, invoice status = Paid,
 *      payment.allocations linked to invoice, JE balanced (DB trigger)
 *
 * Rollback sentinel keeps dev DB clean.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitSalesInvoiceInTx } from '../../services/salesInvoiceSubmit';
import { submitPurchaseInvoiceInTx } from '../../services/purchaseInvoiceSubmit';
import { submitPaymentInTx } from '../../services/paymentSubmit';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let cashAccountId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user.');
  userId = user.id;

  // Any 1.1.x account (cash/bank, non-group). systemAccounts.isCashAccount
  // recognises the 1.1.x prefix, so the service won't reject it.
  const cash = await prisma.account.findFirst({
    where: { accountNumber: { startsWith: '1.1.' }, isGroup: false },
  });
  if (!cash) throw new Error('No cash account (1.1.x) configured.');
  cashAccountId = cash.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('submitPaymentInTx — Receive', () => {
  it('fully pays a single sales invoice, party outstanding goes to 0, status=Paid', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: {
            name: `TEST-RCV-CUST-${stamp}`,
            partyType: 'Customer',
            isActive: true,
            openingOutstanding: 0,
            outstandingAmount: 0,
          },
        });

        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            items: [{ itemName: 'Jasa (rcv test)', itemType: 'service', quantity: 1, rate: 4_000_000 }],
          },
          userId,
        );
        expect(Number(invoice.outstanding)).toBe(4_000_000);

        const { payment, unallocatedAmount } = await submitPaymentInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            paymentType: 'Receive',
            accountId: cashAccountId,
            amount: 4_000_000,
          },
          userId,
        );

        expect(payment.status).toBe('Submitted');
        expect(Number(payment.amount)).toBe(4_000_000);
        expect(unallocatedAmount).toBe(0);

        // Invoice fully paid + status flipped.
        const invAfter = await tx.salesInvoice.findUnique({ where: { id: invoice.id } });
        expect(Number(invAfter!.outstanding)).toBe(0);
        expect(invAfter!.status).toBe('Paid');

        // Allocation row links the payment to the invoice.
        const allocs = await tx.paymentAllocation.findMany({
          where: { paymentId: payment.id },
        });
        expect(allocs.length).toBe(1);
        expect(allocs[0].invoiceType).toBe('SalesInvoice');
        expect(allocs[0].invoiceId).toBe(invoice.id);
        expect(Number(allocs[0].allocatedAmount)).toBe(4_000_000);

        // Party outstanding reset.
        const partyAfter = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfter!.outstandingAmount)).toBe(0);

        // JE balanced (DB constraint trigger would have rejected otherwise).
        const je = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${payment.paymentNumber}` },
          include: { items: true },
        });
        expect(je).not.toBeNull();
        const totalDebit = je!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCredit = je!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBe(4_000_000);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('partially pays: invoice status=PartiallyPaid, unallocatedAmount=0', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: {
            name: `TEST-RCV-PART-${stamp}`,
            partyType: 'Customer',
            isActive: true,
          },
        });

        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            items: [{ itemName: 'Partial test', itemType: 'service', quantity: 1, rate: 10_000_000 }],
          },
          userId,
        );

        const { unallocatedAmount } = await submitPaymentInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            paymentType: 'Receive',
            accountId: cashAccountId,
            amount: 3_000_000,
          },
          userId,
        );

        expect(unallocatedAmount).toBe(0);
        const invAfter = await tx.salesInvoice.findUnique({ where: { id: invoice.id } });
        expect(Number(invAfter!.outstanding)).toBe(7_000_000);
        expect(invAfter!.status).toBe('PartiallyPaid');

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});

d('submitPaymentInTx — Pay', () => {
  it('fully pays a single purchase invoice, party outstanding goes to 0, status=Paid', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: {
            name: `TEST-PAY-SUPP-${stamp}`,
            partyType: 'Supplier',
            isActive: true,
            openingOutstanding: 0,
            outstandingAmount: 0,
          },
        });

        const invoice = await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            items: [{
              itemName: 'Biaya angkutan (pay test)',
              quantity: 1,
              rate: 2_500_000,
              timbanganDiterima: 1,
            }],
          },
          userId,
        );
        expect(Number(invoice.outstanding)).toBe(2_500_000);

        const { payment } = await submitPaymentInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            paymentType: 'Pay',
            accountId: cashAccountId,
            amount: 2_500_000,
          },
          userId,
        );

        const invAfter = await tx.purchaseInvoice.findUnique({ where: { id: invoice.id } });
        expect(Number(invAfter!.outstanding)).toBe(0);
        expect(invAfter!.status).toBe('Paid');

        const allocs = await tx.paymentAllocation.findMany({
          where: { paymentId: payment.id },
        });
        expect(allocs.length).toBe(1);
        expect(allocs[0].invoiceType).toBe('PurchaseInvoice');
        expect(Number(allocs[0].allocatedAmount)).toBe(2_500_000);

        const partyAfter = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfter!.outstandingAmount)).toBe(0);

        throw new RollbackSentinel();
      }, { timeout: 30000 });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});

d('submitPaymentInTx — validation', () => {
  it('rejects when account is not a cash/bank account', async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Pick a non-cash account (e.g. Sales 4.1).
    const nonCash = await prisma.account.findFirst({
      where: { accountNumber: { startsWith: '4.' }, isGroup: false },
    });
    if (!nonCash) throw new Error('No revenue account configured for negative test.');

    await expect(
      prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: { name: `TEST-NEG-${stamp}`, partyType: 'Customer', isActive: true },
        });
        await submitPaymentInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            paymentType: 'Receive',
            accountId: nonCash.id,
            amount: 100,
          },
          userId,
        );
      }),
    ).rejects.toThrow(/bukan akun kas\/bank/i);
  });
});
