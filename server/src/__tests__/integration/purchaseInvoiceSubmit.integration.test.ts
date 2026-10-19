/**
 * Integration test: submitPurchaseInvoiceInTx happy path.
 *
 * Strategy mirrors the sales test — create a throwaway supplier, post a
 * service-only line (no inventory complication), assert balanced JE +
 * outstanding correct + party balance moved. Each test wraps in an outer
 * $transaction that always ROLLBACKs so the dev DB stays clean.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitPurchaseInvoiceInTx } from '../../services/purchaseInvoiceSubmit';

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

d('submitPurchaseInvoiceInTx — service-only line', () => {
  it('creates a balanced Submitted invoice, AP=grandTotal, party outstanding updated', async () => {
    const partyName = `TEST-SUPP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

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
              itemName: 'Biaya angkutan (test)',
              quantity: 1,
              unit: 'pcs',
              rate: 1_500_000,
              timbanganDiterima: 1,
            }],
          },
          userId,
        );

        expect(invoice.status).toBe('Submitted');
        expect(Number(invoice.grandTotal)).toBe(1_500_000);
        expect(Number(invoice.outstanding)).toBe(1_500_000);
        expect(invoice.items.length).toBe(1);

        // Balanced JE (DB trigger would have rejected if not).
        const je = await tx.journalEntry.findUnique({
          where: { entryNumber: `JV-${invoice.invoiceNumber}` },
          include: { items: true },
        });
        expect(je).not.toBeNull();
        const totalDebit = je!.items.reduce((s, i) => s + Number(i.debit), 0);
        const totalCredit = je!.items.reduce((s, i) => s + Number(i.credit), 0);
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBe(1_500_000);

        // Party outstanding should reflect the new payable.
        const partyAfter = await tx.party.findUnique({ where: { id: party.id } });
        expect(Number(partyAfter!.outstandingAmount)).toBe(1_500_000);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('rejects unknown supplier', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await submitPurchaseInvoiceInTx(
          tx,
          {
            date: new Date().toISOString().slice(0, 10),
            partyId: '00000000-0000-0000-0000-000000000000',
            items: [{
              itemName: 'X', quantity: 1, rate: 100, timbanganDiterima: 1,
            }],
          },
          userId,
        );
      }),
    ).rejects.toThrow(/supplier tidak ditemukan/i);
  });
});
