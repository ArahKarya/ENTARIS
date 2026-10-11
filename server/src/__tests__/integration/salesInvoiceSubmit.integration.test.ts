/**
 * Integration test: submitSalesInvoiceInTx happy path.
 *
 * Verifies the extracted service produces:
 *   - a Submitted invoice with outstanding == grandTotal
 *   - a balanced revenue JE (DB CHECK trigger enforces SUM(debit)=SUM(credit))
 *   - matching ALE rows
 *   - party.outstandingAmount incremented
 *
 * Strategy: each test creates a one-shot Customer + posts the invoice inside
 * an outer prisma.$transaction that always ROLLBACKS at the end — leaves no
 * trace in the dev DB. Skips automatically when DATABASE_URL is missing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitSalesInvoiceInTx } from '../../services/salesInvoiceSubmit';

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

/**
 * Sentinel used to abort the transaction after assertions pass. Prisma throws
 * this back out, so callers must catch it.
 */
class RollbackSentinel extends Error {
  constructor() { super('rollback'); this.name = 'RollbackSentinel'; }
}

d('submitSalesInvoiceInTx — service-only line (no inventory)', () => {
  it('creates a balanced Submitted invoice, AR=grandTotal, party outstanding updated', async () => {
    const partyName = `TEST-CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      await prisma.$transaction(async (tx) => {
        // Setup: throwaway customer for this test.
        const party = await tx.party.create({
          data: {
            name: partyName,
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
            items: [{
              itemName: 'Jasa Konsultansi (test)',
              itemType: 'service',
              quantity: 1,
              unit: 'jasa',
              rate: 5_000_000,
            }],
          },
          userId,
        );

        expect(invoice.status).toBe('Submitted');
        expect(Number(invoice.grandTotal)).toBe(5_000_000);
        expect(Number(invoice.outstanding)).toBe(5_000_000);
        expect(invoice.items.length).toBe(1);

        // JE was created and is balanced (DB trigger would have aborted if not).
        const je = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${invoice.invoiceNumber}` },
          include: { items: true },
        });
        expect(je).not.toBeNull();
        expect(je!.status).toBe('Submitted');
        const totalDebit = je!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCredit = je!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBe(5_000_000);

        // ALE rows match journal items count.
        const ale = await tx.accountingLedgerEntry.findMany({
          where: { referenceId: je!.id },
        });
        expect(ale.length).toBe(je!.items.length);

        // Party outstanding should have moved by grandTotal.
        const partyAfter = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfter!.outstandingAmount)).toBe(5_000_000);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects unknown party', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await submitSalesInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: '00000000-0000-0000-0000-000000000000',
            items: [{
              itemName: 'X',
              itemType: 'service',
              quantity: 1,
              rate: 100,
            }],
          },
          userId,
        );
      }),
    ).rejects.toThrow(/customer tidak ditemukan/i);
  });
});
