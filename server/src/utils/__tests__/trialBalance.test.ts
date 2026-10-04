import { describe, it, expect } from 'vitest';
import { buildTrialBalance, TrialBalanceAccount } from '../trialBalance';

const acc = (id: string, accountNumber: string, rootType: string): TrialBalanceAccount => ({
  id, accountNumber, name: id, accountType: rootType, rootType,
});

describe('buildTrialBalance', () => {
  const accounts = [
    acc('cash', '1.1.1', 'ASSET'),
    acc('inv', '1.4.0', 'ASSET'),
    acc('sales', '4.1', 'REVENUE'),
    acc('cogsGroup', '5', 'EXPENSE'), // group account with legacy direct postings
    acc('unused', '6.1', 'EXPENSE'),
  ];
  const sums = [
    { accountId: 'cash', debit: 1000, credit: 0 },
    { accountId: 'sales', debit: 0, credit: 1000 },
    { accountId: 'cogsGroup', debit: 600, credit: 0 },
    { accountId: 'inv', debit: 0, credit: 600 },
  ];

  it('includes group accounts that have direct postings', () => {
    const rows = buildTrialBalance(accounts, sums);
    expect(rows.find((r) => r.id === 'cogsGroup')).toMatchObject({ debit: 600, credit: 0, balance: 600 });
  });

  it('keeps totals balanced', () => {
    const rows = buildTrialBalance(accounts, sums);
    const dr = rows.reduce((t, r) => t + r.debit, 0);
    const cr = rows.reduce((t, r) => t + r.credit, 0);
    expect(dr).toBe(cr);
  });

  it('omits accounts without postings, sorts by number and keeps the row shape', () => {
    const rows = buildTrialBalance(accounts, sums);
    expect(rows.map((r) => r.accountNumber)).toEqual(['1.1.1', '1.4.0', '4.1', '5']);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['accountNumber', 'accountType', 'balance', 'credit', 'debit', 'id', 'name', 'rootType'],
    );
  });
});
