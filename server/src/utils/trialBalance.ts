import { computeImpact } from './accountBalance';
import { compareAccountNumber } from './accountSort';

export interface TrialBalanceAccount {
  id: string;
  name: string;
  accountNumber: string;
  accountType: string;
  rootType: string;
}

export interface TrialBalanceSums {
  accountId: string;
  debit: number;
  credit: number;
}

export type TrialBalanceRow = TrialBalanceAccount & { debit: number; credit: number; balance: number };

/**
 * Build trial-balance rows from per-account ledger sums.
 *
 * Every account with direct postings is included — detail AND group accounts.
 * Group accounts are not supposed to receive postings, but legacy data (e.g.
 * COGS mapped to group '5') does; dropping them would leave the report
 * unbalanced. Accounts without postings are omitted. Sorted by account number.
 */
export function buildTrialBalance(
  accounts: readonly TrialBalanceAccount[],
  sums: readonly TrialBalanceSums[],
): TrialBalanceRow[] {
  const sumMap = new Map(sums.map((s) => [s.accountId, s]));
  return [...accounts]
    .sort((a, b) => compareAccountNumber(a.accountNumber, b.accountNumber))
    .map((account) => {
      const s = sumMap.get(account.id);
      const debit = Number(s?.debit || 0);
      const credit = Number(s?.credit || 0);
      return { ...account, debit, credit, balance: computeImpact(account.rootType, debit, credit) };
    })
    .filter((a) => a.debit !== 0 || a.credit !== 0);
}
