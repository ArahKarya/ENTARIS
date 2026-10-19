/**
 * Integration test: cancelSalesInvoiceInTx happy path.
 *
 * Flow: submit invoice → assert state → cancel invoice → assert reversal.
 * Both ops run inside the same outer transaction so the rollback sentinel
 * cleans everything up at the end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitSalesInvoiceInTx } from '../../services/salesInvoiceSubmit';
import { cancelSalesInvoiceInTx } from '../../services/invoiceCancellation';

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

d('cancelSalesInvoiceInTx — service-only invoice', () => {
  it('flips invoice + JE to Cancelled, restores party outstanding to 0', async () => {
    const partyName = `TEST-CUST-CANCEL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: {
            name: partyName,
            partyType: 'Customer',
            isActive: true,
            openingOutstanding: 0,
            outstandingAmount: 0,
          },
        });

        // SUBMIT
        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            items: [{
              itemName: 'Jasa konsultansi (cancel test)',
              itemType: 'service',
              quantity: 1,
              rate: 3_000_000,
            }],
          },
          userId,
        );
        expect(invoice.status).toBe('Submitted');
        expect(Number(invoice.outstanding)).toBe(3_000_000);

        const partyAfterSubmit = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfterSubmit!.outstandingAmount)).toBe(3_000_000);

        // CANCEL
        const result = await cancelSalesInvoiceInTx(tx, invoice.id);
        expect(result.status).toBe('Cancelled');

        // Invoice fields flipped
        const invoiceAfter = await tx.salesInvoice.findUnique({ where: { id: invoice.id } });
        expect(invoiceAfter!.status).toBe('Cancelled');
        expect(Number(invoiceAfter!.outstanding)).toBe(0);
        expect(invoiceAfter!.cancelledAt).not.toBeNull();

        // JE cancelled
        const je = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${invoice.invoiceNumber}` },
        });
        expect(je).not.toBeNull();
        expect(je!.status).toBe('Cancelled');
        expect(je!.cancelledAt).not.toBeNull();

        // ALE rows marked cancelled
        const ale = await tx.accountingLedgerEntry.findMany({
          where: { referenceId: je!.id },
        });
        expect(ale.length).toBeGreaterThan(0);
        expect(ale.every((a) => a.isCancelled)).toBe(true);

        // Party outstanding rolled back to 0
        const partyAfterCancel = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfterCancel!.outstandingAmount)).toBe(0);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects cancellation of already-cancelled invoice', async () => {
    const partyName = `TEST-CUST-DBLCXL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({
          data: { name: partyName, partyType: 'Customer', isActive: true },
        });
        const invoice = await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: party.id,
            items: [{ itemName: 'X', itemType: 'service', quantity: 1, rate: 100 }],
          },
          userId,
        );
        await cancelSalesInvoiceInTx(tx, invoice.id);

        // Second cancel should throw
        await expect(cancelSalesInvoiceInTx(tx, invoice.id))
          .rejects.toThrow(/sudah dibatalkan/i);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
