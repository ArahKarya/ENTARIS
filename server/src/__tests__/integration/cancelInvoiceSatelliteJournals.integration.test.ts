/**
 * Integration test: cancelling an invoice also cancels its satellite journals.
 *
 * Bug (PMD, Okt 2026): SI-202604-0038 was cancelled but JV-SI-202604-0038-CORR (posted by a
 * correction script) stayed active, so AR/revenue/PPh/PPN of a cancelled invoice kept counting.
 * cancel*InvoiceInTx used to look up only JV-<no> and JV-COGS-<no> by exact number.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { submitSalesInvoiceInTx } from '../../services/salesInvoiceSubmit';
import { submitPurchaseInvoiceInTx } from '../../services/purchaseInvoiceSubmit';
import { cancelSalesInvoiceInTx, cancelPurchaseInvoiceInTx } from '../../services/invoiceCancellation';
import { updateAccountBalance } from '../../utils/accountBalance';
import { systemAccounts } from '../../services/systemAccounts';

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

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Line = { accountId: string; debit: number; credit: number; partyId?: string | null };

/** Post a journal the way the correction scripts did: JE + items + ALE + account balance. */
async function postJournal(tx: Tx, entryNumber: string, fiscalYearId: string, lines: Line[]) {
  const date = new Date();
  const je = await tx.journalEntry.create({
    data: {
      entryNumber, date, status: 'Submitted', submittedAt: date, fiscalYearId, createdBy: userId,
      narration: `Test satellite ${entryNumber}`,
      items: { create: lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, partyId: l.partyId ?? null })) },
    },
  });
  await tx.accountingLedgerEntry.createMany({
    data: lines.map((l) => ({
      date, accountId: l.accountId, partyId: l.partyId ?? null, debit: l.debit, credit: l.credit,
      referenceType: 'JournalEntry', referenceId: je.id, fiscalYearId,
    })),
  });
  for (const l of lines) await updateAccountBalance(tx, l.accountId, l.debit, l.credit);
  return je;
}

async function balance(tx: Tx, accountId: string) {
  const a = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
  return Number(a.balance);
}

async function revenueAccount(tx: Tx) {
  const acc = await tx.account.findFirst({ where: { rootType: 'REVENUE', isGroup: false } });
  if (!acc) throw new Error('No revenue account.');
  return acc;
}

d('cancel invoice — satellite journals (-CORR, -WAPU, …)', () => {
  it('sales: cancels -CORR / -CORR-PPN satellites, restores AR and revenue balances', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({ data: { name: `TEST-CUST-SAT-${Date.now()}`, partyType: 'Customer', isActive: true } });
        const ar = await systemAccounts.getAccount('AR');
        const rev = await revenueAccount(tx);
        const arBefore = await balance(tx, ar.id);
        const revBefore = await balance(tx, rev.id);

        const invoice = await submitSalesInvoiceInTx(
          tx,
          { date: new Date().toISOString().slice(0, 10), partyId: party.id, items: [{ itemName: 'Jasa', itemType: 'service', quantity: 1, rate: 5_000_000 }] },
          userId,
        );
        const base = `JV-${invoice.invoiceNumber}`;
        // Script-style corrections: reduce revenue/AR by 2.000.000, then a PPN-style tweak of 100.000.
        const corr = await postJournal(tx, `${base}-CORR`, invoice.fiscalYearId, [
          { accountId: rev.id, debit: 2_000_000, credit: 0 },
          { accountId: ar.id, debit: 0, credit: 2_000_000, partyId: party.id },
        ]);
        const corrPpn = await postJournal(tx, `${base}-CORR-PPN`, invoice.fiscalYearId, [
          { accountId: ar.id, debit: 100_000, credit: 0, partyId: party.id },
          { accountId: rev.id, debit: 0, credit: 100_000 },
        ]);
        // Look-alike number of ANOTHER document must not be touched (dash boundary).
        const lookalike = await postJournal(tx, `${base}0-CORR`, invoice.fiscalYearId, [
          { accountId: rev.id, debit: 7_000, credit: 0 },
          { accountId: ar.id, debit: 0, credit: 7_000 },
        ]);

        await cancelSalesInvoiceInTx(tx, invoice.id);

        for (const je of [corr, corrPpn]) {
          const after = await tx.journalEntry.findUniqueOrThrow({ where: { id: je.id } });
          expect(after.status).toBe('Cancelled');
          const ale = await tx.accountingLedgerEntry.findMany({ where: { referenceId: je.id } });
          expect(ale.length).toBe(2);
          expect(ale.every((a) => a.isCancelled)).toBe(true);
        }
        const main = await tx.journalEntry.findUniqueOrThrow({ where: { entryNumber: base } });
        expect(main.status).toBe('Cancelled');

        const other = await tx.journalEntry.findUniqueOrThrow({ where: { id: lookalike.id } });
        expect(other.status).toBe('Submitted');

        // Only the look-alike journal (-7.000 AR, +7.000 revenue debit) remains on the balances.
        expect(await balance(tx, ar.id)).toBeCloseTo(arBefore - 7_000, 2);
        expect(await balance(tx, rev.id)).toBeCloseTo(revBefore - 7_000, 2);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('sales: satellite of the COGS journal (JV-COGS-<no>-…) is cancelled too', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({ data: { name: `TEST-CUST-SATC-${Date.now()}`, partyType: 'Customer', isActive: true } });
        const rev = await revenueAccount(tx);
        const ar = await systemAccounts.getAccount('AR');
        const invoice = await submitSalesInvoiceInTx(
          tx,
          { date: new Date().toISOString().slice(0, 10), partyId: party.id, items: [{ itemName: 'Jasa', itemType: 'service', quantity: 1, rate: 1_000_000 }] },
          userId,
        );
        const sat = await postJournal(tx, `JV-COGS-${invoice.invoiceNumber}-CORR`, invoice.fiscalYearId, [
          { accountId: rev.id, debit: 50_000, credit: 0 },
          { accountId: ar.id, debit: 0, credit: 50_000 },
        ]);
        await cancelSalesInvoiceInTx(tx, invoice.id);
        expect((await tx.journalEntry.findUniqueOrThrow({ where: { id: sat.id } })).status).toBe('Cancelled');
        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('purchase: cancels -CORR / -CORR-2 satellites and restores AP balance', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({ data: { name: `TEST-SUPP-SAT-${Date.now()}`, partyType: 'Supplier', isActive: true } });
        const ap = await systemAccounts.getAccount('AP');
        const apBefore = await balance(tx, ap.id);
        const invoice = await submitPurchaseInvoiceInTx(
          tx,
          { date: new Date().toISOString().slice(0, 10), partyId: party.id, items: [{ itemName: 'Biaya angkutan', quantity: 1, rate: 2_000_000, timbanganDiterima: 1 }] },
          userId,
        );
        const exp = await tx.account.findFirst({ where: { rootType: 'EXPENSE', isGroup: false } });
        const base = `JV-${invoice.invoiceNumber}`;
        const c1 = await postJournal(tx, `${base}-CORR`, invoice.fiscalYearId, [
          { accountId: exp!.id, debit: 300_000, credit: 0 },
          { accountId: ap.id, debit: 0, credit: 300_000, partyId: party.id },
        ]);
        const c2 = await postJournal(tx, `${base}-CORR-2`, invoice.fiscalYearId, [
          { accountId: exp!.id, debit: 20_000, credit: 0 },
          { accountId: ap.id, debit: 0, credit: 20_000, partyId: party.id },
        ]);

        await cancelPurchaseInvoiceInTx(tx, invoice.id);

        for (const je of [c1, c2]) {
          expect((await tx.journalEntry.findUniqueOrThrow({ where: { id: je.id } })).status).toBe('Cancelled');
          const ale = await tx.accountingLedgerEntry.findMany({ where: { referenceId: je.id } });
          expect(ale.every((a) => a.isCancelled)).toBe(true);
        }
        expect(await balance(tx, ap.id)).toBeCloseTo(apBefore, 2);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });

  it('already-cancelled satellite is not reversed twice', async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const party = await tx.party.create({ data: { name: `TEST-CUST-SATX-${Date.now()}`, partyType: 'Customer', isActive: true } });
        const ar = await systemAccounts.getAccount('AR');
        const rev = await revenueAccount(tx);
        const arPre = await balance(tx, ar.id);
        const invoice = await submitSalesInvoiceInTx(
          tx,
          { date: new Date().toISOString().slice(0, 10), partyId: party.id, items: [{ itemName: 'Jasa', itemType: 'service', quantity: 1, rate: 1_000_000 }] },
          userId,
        );
        const arBefore = await balance(tx, ar.id);
        const sat = await postJournal(tx, `JV-${invoice.invoiceNumber}-CORR-QTY`, invoice.fiscalYearId, [
          { accountId: rev.id, debit: 40_000, credit: 0 },
          { accountId: ar.id, debit: 0, credit: 40_000 },
        ]);
        // Cancel the satellite by hand first (reverse its effect), as data already in PMD.
        await tx.journalEntry.update({ where: { id: sat.id }, data: { status: 'Cancelled', cancelledAt: new Date() } });
        await tx.accountingLedgerEntry.updateMany({ where: { referenceId: sat.id }, data: { isCancelled: true } });
        await updateAccountBalance(tx, rev.id, 0, 40_000);
        await updateAccountBalance(tx, ar.id, 40_000, 0);
        expect(await balance(tx, ar.id)).toBeCloseTo(arBefore, 2);

        await cancelSalesInvoiceInTx(tx, invoice.id);
        // Main JV reversed once; the already-cancelled satellite is not reversed a second time.
        expect(await balance(tx, ar.id)).toBeCloseTo(arPre, 2);

        throw new RollbackSentinel();
      });
    } catch (err) {
      if (!(err instanceof RollbackSentinel)) throw err;
    }
  });
});
