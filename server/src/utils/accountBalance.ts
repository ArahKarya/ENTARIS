import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { logger } from '../lib/logger';

/**
 * Returns the correct balance impact for a given account root type.
 *
 * Normal balance sides:
 *   ASSET, EXPENSE  → debit-normal  (debit increases, credit decreases)
 *   LIABILITY, EQUITY, REVENUE → credit-normal (credit increases, debit decreases)
 */
export function computeImpact(rootType: string, debit: number | Decimal, credit: number | Decimal): number {
  const d = new Decimal(debit.toString());
  const c = new Decimal(credit.toString());
  if (rootType === 'ASSET' || rootType === 'EXPENSE') {
    return d.minus(c).toNumber();
  }
  return c.minus(d).toNumber();
}

/**
 * Update a single account's balance with correct direction logic.
 */
export async function updateAccountBalance(
  tx: Prisma.TransactionClient,
  accountId: string,
  debit: number | Decimal,
  credit: number | Decimal
): Promise<void> {
  const account = await tx.account.findUnique({
    where: { id: accountId },
    select: { rootType: true },
  });
  if (!account) return;

  const impact = computeImpact(account.rootType, debit, credit);
  await tx.account.update({
    where: { id: accountId },
    data: { balance: { increment: impact } },
  });
}

/**
 * Batch update balances for multiple journal items.
 */
export async function updateBalancesForItems(
  tx: Prisma.TransactionClient,
  items: Array<{ accountId: string; debit: number | Decimal; credit: number | Decimal }>
): Promise<void> {
  for (const item of items) {
    await updateAccountBalance(tx, item.accountId, item.debit, item.credit);
  }
}

/**
 * Recalculate account balances from the sum of all active (non-cancelled) journal entries.
 * This fixes any drift caused by incremental balance updates.
 *
 * @param accountIds - Array of account IDs to recalculate. If empty, recalculates ALL accounts.
 */
export async function recalculateAccountBalances(
  tx: Prisma.TransactionClient,
  accountIds?: string[]
): Promise<void> {
  const whereClause = accountIds?.length ? { id: { in: accountIds } } : {};
  const accounts = await tx.account.findMany({
    where: whereClause,
    select: { id: true, rootType: true },
  });

  for (const account of accounts) {
    // Source of truth is accounting_ledger_entries (ALE), which every official report reads.
    // journal_entry_accounts has diverged, so recalculating from it would drift from the reports.
    const totals = await tx.accountingLedgerEntry.aggregate({
      where: {
        accountId: account.id,
        isCancelled: false,
      },
      _sum: { debit: true, credit: true },
    });

    const totalDebit = new Decimal((totals._sum.debit ?? 0).toString());
    const totalCredit = new Decimal((totals._sum.credit ?? 0).toString());

    let balance: number;
    if (account.rootType === 'ASSET' || account.rootType === 'EXPENSE') {
      balance = totalDebit.minus(totalCredit).toNumber();
    } else {
      balance = totalCredit.minus(totalDebit).toNumber();
    }

    await tx.account.update({
      where: { id: account.id },
      data: { balance },
    });
  }
}

/**
 * Recalculate party outstanding_amount from the sum of non-cancelled invoice outstanding.
 * This is the source-of-truth approach that prevents drift from increment/decrement logic.
 */
export async function recalcPartyOutstanding(
  tx: Prisma.TransactionClient,
  partyId: string
): Promise<void> {
  const party = await tx.party.findUnique({
    where: { id: partyId },
    select: { partyType: true, outstandingAmount: true, openingOutstanding: true },
  });
  if (!party) return;

  let newOutstanding = new Decimal(party.openingOutstanding.toString());

  if (party.partyType === 'Supplier' || party.partyType === 'Both') {
    const piSum = await tx.purchaseInvoice.aggregate({
      where: { partyId, status: { not: 'Cancelled' } },
      _sum: { outstanding: true },
    });
    newOutstanding = newOutstanding.plus(new Decimal((piSum._sum.outstanding ?? 0).toString()));
  }

  if (party.partyType === 'Customer' || party.partyType === 'Both') {
    const siSum = await tx.salesInvoice.aggregate({
      where: { partyId, status: { not: 'Cancelled' } },
      _sum: { outstanding: true },
    });
    newOutstanding = newOutstanding.plus(new Decimal((siSum._sum.outstanding ?? 0).toString()));
  }

  const oldOutstanding = new Decimal(party.outstandingAmount.toString());
  if (!oldOutstanding.eq(newOutstanding)) {
    logger.info(
      { partyId, old: oldOutstanding.toNumber(), new: newOutstanding.toNumber() },
      'recalcPartyOutstanding: correcting drift'
    );
  }

  await tx.party.update({
    where: { id: partyId },
    data: { outstandingAmount: newOutstanding.toNumber() },
  });
}
