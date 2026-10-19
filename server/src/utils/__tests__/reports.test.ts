import { describe, it, expect } from 'vitest';

/**
 * Standalone reimplementation of the Maps-based getBalance algorithm
 * extracted from reports.ts (profit-loss handler).
 *
 * This tests the ALGORITHM — the pure business logic — without needing
 * Express, Prisma, or a running database.
 */

type AccountRow = {
  id: string;
  parentId: string | null;
  rootType: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'LIABILITY' | 'EQUITY';
  isGroup: boolean;
  accountNumber: string;
  name: string;
};

type SummaryEntry = { debit: number; credit: number };

function buildMaps(accounts: AccountRow[]) {
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const childrenOf = new Map<string | null, AccountRow[]>();
  for (const a of accounts) {
    if (!childrenOf.has(a.parentId)) childrenOf.set(a.parentId, []);
    childrenOf.get(a.parentId)!.push(a);
  }
  return { accountById, childrenOf };
}

function getPLBalance(
  accountId: string,
  summaryMap: Map<string, SummaryEntry>,
  accountById: Map<string, AccountRow>,
  childrenOf: Map<string | null, AccountRow[]>
): number {
  const summ = summaryMap.get(accountId);
  const account = accountById.get(accountId);
  let balance = 0;
  if (summ && account) {
    balance = account.rootType === 'REVENUE' ? summ.credit - summ.debit : summ.debit - summ.credit;
  }
  for (const child of childrenOf.get(accountId) ?? []) {
    balance += getPLBalance(child.id, summaryMap, accountById, childrenOf);
  }
  return balance;
}

function getBSBalance(
  accountId: string,
  summaryMap: Map<string, SummaryEntry>,
  accountById: Map<string, AccountRow>,
  childrenOf: Map<string | null, AccountRow[]>
): number {
  const summ = summaryMap.get(accountId);
  const account = accountById.get(accountId);
  let balance = 0;
  if (summ && account) {
    balance = account.rootType === 'ASSET' ? summ.debit - summ.credit : summ.credit - summ.debit;
  }
  for (const child of childrenOf.get(accountId) ?? []) {
    balance += getBSBalance(child.id, summaryMap, accountById, childrenOf);
  }
  return balance;
}

const revenueGroup: AccountRow = {
  id: 'rev-group', parentId: null, rootType: 'REVENUE', isGroup: true,
  accountNumber: '4', name: 'Pendapatan',
};
const salesAccount: AccountRow = {
  id: 'rev-1', parentId: 'rev-group', rootType: 'REVENUE', isGroup: false,
  accountNumber: '4.1.1', name: 'Penjualan Beras',
};
const expenseGroup: AccountRow = {
  id: 'exp-group', parentId: null, rootType: 'EXPENSE', isGroup: true,
  accountNumber: '5', name: 'Beban',
};
const cogsAccount: AccountRow = {
  id: 'exp-1', parentId: 'exp-group', rootType: 'EXPENSE', isGroup: false,
  accountNumber: '5.1.1', name: 'Harga Pokok Penjualan',
};

const assetGroup: AccountRow = {
  id: 'asset-group', parentId: null, rootType: 'ASSET', isGroup: true,
  accountNumber: '1', name: 'Aset',
};
const cashAccount: AccountRow = {
  id: 'asset-1', parentId: 'asset-group', rootType: 'ASSET', isGroup: false,
  accountNumber: '1.1.1', name: 'Kas',
};

// P&L getBalance tests

describe('getBalance (P&L) — REVENUE leaf account', () => {
  it('returns credit - debit for REVENUE', () => {
    const accounts = [revenueGroup, salesAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([['rev-1', { debit: 0, credit: 5_000_000 }]]);
    expect(getPLBalance('rev-1', summaryMap, accountById, childrenOf)).toBe(5_000_000);
  });

  it('returns negative when REVENUE is debited (reversal)', () => {
    const accounts = [revenueGroup, salesAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([['rev-1', { debit: 200_000, credit: 100_000 }]]);
    expect(getPLBalance('rev-1', summaryMap, accountById, childrenOf)).toBe(-100_000);
  });
});

describe('getBalance (P&L) — EXPENSE leaf account', () => {
  it('returns debit - credit for EXPENSE', () => {
    const accounts = [expenseGroup, cogsAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([['exp-1', { debit: 3_000_000, credit: 0 }]]);
    expect(getPLBalance('exp-1', summaryMap, accountById, childrenOf)).toBe(3_000_000);
  });
});

describe('getBalance (P&L) — group account aggregates children', () => {
  it('sums all children balances', () => {
    const subSales: AccountRow = {
      id: 'rev-2', parentId: 'rev-group', rootType: 'REVENUE', isGroup: false,
      accountNumber: '4.1.2', name: 'Penjualan Dedak',
    };
    const accounts = [revenueGroup, salesAccount, subSales];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([
      ['rev-1', { debit: 0, credit: 5_000_000 }],
      ['rev-2', { debit: 0, credit: 1_000_000 }],
    ]);
    // group itself has no direct entries, should sum children
    expect(getPLBalance('rev-group', summaryMap, accountById, childrenOf)).toBe(6_000_000);
  });

  it('returns 0 for group with no activity', () => {
    const accounts = [revenueGroup, salesAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map<string, SummaryEntry>();
    expect(getPLBalance('rev-group', summaryMap, accountById, childrenOf)).toBe(0);
  });
});

describe('getBalance (P&L) — deep nesting (3 levels)', () => {
  it('aggregates balances through 3 levels of hierarchy', () => {
    const mid: AccountRow = {
      id: 'rev-mid', parentId: 'rev-group', rootType: 'REVENUE', isGroup: true,
      accountNumber: '4.1', name: 'Penjualan',
    };
    const leaf: AccountRow = {
      id: 'rev-leaf', parentId: 'rev-mid', rootType: 'REVENUE', isGroup: false,
      accountNumber: '4.1.1', name: 'Penjualan Beras Premium',
    };
    const accounts = [revenueGroup, mid, leaf];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([['rev-leaf', { debit: 0, credit: 2_000_000 }]]);
    expect(getPLBalance('rev-group', summaryMap, accountById, childrenOf)).toBe(2_000_000);
  });
});

// Balance Sheet getBalance tests

describe('getBalance (Balance Sheet) — ASSET leaf account', () => {
  it('returns debit - credit for ASSET', () => {
    const accounts = [assetGroup, cashAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([['asset-1', { debit: 10_000_000, credit: 3_000_000 }]]);
    expect(getBSBalance('asset-1', summaryMap, accountById, childrenOf)).toBe(7_000_000);
  });
});

describe('getBalance (Balance Sheet) — account not in summaryMap returns 0', () => {
  it('returns 0 when no ledger entries exist for account', () => {
    const accounts = [assetGroup, cashAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map<string, SummaryEntry>();
    expect(getBSBalance('asset-1', summaryMap, accountById, childrenOf)).toBe(0);
  });
});

// Map build correctness

describe('buildMaps', () => {
  it('accountById contains all accounts by id', () => {
    const accounts = [revenueGroup, salesAccount, expenseGroup, cogsAccount];
    const { accountById } = buildMaps(accounts);
    expect(accountById.size).toBe(4);
    expect(accountById.get('rev-1')).toEqual(salesAccount);
  });

  it('childrenOf maps parent ids to correct children', () => {
    const accounts = [revenueGroup, salesAccount, expenseGroup, cogsAccount];
    const { childrenOf } = buildMaps(accounts);
    expect(childrenOf.get('rev-group')).toHaveLength(1);
    expect(childrenOf.get('rev-group')![0].id).toBe('rev-1');
    expect(childrenOf.get('exp-group')![0].id).toBe('exp-1');
    // root-level groups appear under null
    expect(childrenOf.get(null)).toHaveLength(2);
  });

  it('unknown account id returns 0 from getBalance', () => {
    const accounts = [revenueGroup, salesAccount];
    const { accountById, childrenOf } = buildMaps(accounts);
    const summaryMap = new Map([['rev-1', { debit: 0, credit: 500 }]]);
    expect(getPLBalance('nonexistent-id', summaryMap, accountById, childrenOf)).toBe(0);
  });
});
