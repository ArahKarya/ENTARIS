import { Prisma } from '@prisma/client';
import { updateAccountBalance } from './accountBalance';

/**
 * Cancel every active journal that belongs to a document: the exact numbers in `baseNumbers`
 * plus their satellites `<base>-…` (e.g. JV-SI-202604-0038-CORR, -CORR-PPN, -WAPU). The dash
 * boundary keeps JV-SI-202604-0038 from matching JV-SI-202604-00380. Ledger entries are marked
 * cancelled and account balances reversed per journal item.
 *
 * @returns entry numbers that were cancelled, in posting order
 */
export async function cancelDocumentJournals(
  tx: Prisma.TransactionClient,
  baseNumbers: string[]
): Promise<string[]> {
  const journals = await tx.journalEntry.findMany({
    where: {
      status: { not: 'Cancelled' },
      OR: baseNumbers.flatMap((base) => [
        { entryNumber: base },
        { entryNumber: { startsWith: `${base}-` } },
      ]),
    },
    include: { items: true },
    orderBy: [{ date: 'asc' }, { entryNumber: 'asc' }],
  });

  const now = new Date();
  for (const journal of journals) {
    await tx.journalEntry.update({
      where: { id: journal.id },
      data: { status: 'Cancelled', cancelledAt: now },
    });
    await tx.accountingLedgerEntry.updateMany({
      where: { referenceId: journal.id },
      data: { isCancelled: true },
    });
    for (const ji of journal.items) {
      await updateAccountBalance(tx, ji.accountId, ji.credit, ji.debit);
    }
  }

  return journals.map((j) => j.entryNumber);
}

/**
 * Cancel ALL active journals whose entryNumber starts with the given prefix,
 * along with their ledger entries, and reverse account balances.
 *
 * This handles revision journals (e.g. JV-PR0004, JV-PR0004-R, JV-PR0004-R2)
 * that are created when a production run or stock opname is edited.
 *
 * @returns number of journals cancelled
 */
export async function cancelJournalsByPrefix(
  tx: Prisma.TransactionClient,
  entryNumberPrefix: string
): Promise<number> {
  const activeJournals = await tx.journalEntry.findMany({
    where: {
      entryNumber: { startsWith: entryNumberPrefix },
      status: { not: 'Cancelled' },
    },
    include: { items: true },
  });

  for (const journal of activeJournals) {
    await tx.journalEntry.update({
      where: { id: journal.id },
      data: { status: 'Cancelled', cancelledAt: new Date() },
    });

    await tx.accountingLedgerEntry.updateMany({
      where: { referenceId: journal.id },
      data: { isCancelled: true },
    });

    // Reverse account balances (swap debit/credit)
    for (const ji of journal.items) {
      await updateAccountBalance(tx, ji.accountId, Number(ji.credit), Number(ji.debit));
    }
  }

  return activeJournals.length;
}
