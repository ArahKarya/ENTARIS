/**
 * Integration test: cancelPurchaseInvoiceInTx happy path.
 * Mirror of cancelSalesInvoice — submit + cancel, assert reversal.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitPurchaseInvoiceInTx } from '../../services/purchaseInvoiceSubmit';
import { cancelPurchaseInvoiceInTx } from '../../services/invoiceCancellation';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });
  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user.');
  userId = user.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('cancelPurchaseInvoiceInTx — service-only invoice', () => {
  it('flips invoice + JE to Cancelled, restores supplier outstanding to 0', async () => {
    const partyName = `TEST-SUPP-CANCEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: {
            name: partyName,
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
              itemName: 'Biaya angkutan (cancel test)',
              quantity: 1,
              rate: 2_000_000,
              timbanganDiterima: 1,
            }],
          },
          userId,
        );
        expect(invoice.status).toBe('Submitted');
        expect(Number(invoice.outstanding)).toBe(2_000_000);

        const partyAfterSubmit = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfterSubmit!.outstandingAmount)).toBe(2_000_000);

        const result = await cancelPurchaseInvoiceInTx(tx, invoice.id);
        expect(result.status).toBe('Cancelled');

        const invoiceAfter = await tx.purchaseInvoice.findUnique({ where: { id: invoice.id } });
        expect(invoiceAfter!.status).toBe('Cancelled');
        expect(Number(invoiceAfter!.outstanding)).toBe(0);
        expect(invoiceAfter!.cancelledAt).not.toBeNull();

        const je = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${invoice.invoiceNumber}` },
        });
        expect(je).not.toBeNull();
        expect(je!.status).toBe('Cancelled');

        const ale = await tx.accountingLedgerEntry.findMany({ where: { referenceId: je!.id } });
        expect(ale.every((a) => a.isCancelled)).toBe(true);

        const partyAfterCancel = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfterCancel!.outstandingAmount)).toBe(0);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects when invoice has active payment allocation', async () => {
    const partyName = `TEST-SUPP-PAID-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: { name: partyName, partyType: 'Supplier', isActive: true },
        });
        const invoice = await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            items: [{ itemName: 'X', quantity: 1, rate: 100, timbanganDiterima: 1 }],
          },
          userId,
        );

        // Inject a fake allocation row so cancel sees it.
        // 1.1.1 is the petty cash account from seed; any 1.1.x works.
        const cashAccount = await tx.account.findFirst({
          where: { accountNumber: { startsWith: '1.1.' }, isGroup: false },
        });
        if (!cashAccount) throw new Error('No cash account configured (1.1.x).');
        const dummyPayment = await tx.payment.create({
          data: {
            paymentNumber: `TEST-PAY-${Date.now()}`,
            date: new Date(),
            partyId: party.id,
            amount: 100,
            paymentType: 'Pay',
            accountId: cashAccount.id,
            status: 'Submitted',
            fiscalYearId: invoice.fiscalYearId,
            createdBy: userId,
          },
        });
        await tx.paymentAllocation.create({
          data: {
            paymentId: dummyPayment.id,
            invoiceType: 'PurchaseInvoice',
            invoiceId: invoice.id,
            allocatedAmount: 100,
          },
        });

        await expect(cancelPurchaseInvoiceInTx(tx, invoice.id))
          .rejects.toThrow(/pembayaran teralokasi/i);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
