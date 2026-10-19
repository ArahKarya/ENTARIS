import { Prisma } from '@prisma/client';
import { updateAccountBalance } from './accountBalance';

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
