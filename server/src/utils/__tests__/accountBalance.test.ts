import { describe, it, expect, vi } from 'vitest';
import { computeImpact, updateAccountBalance, updateBalancesForItems } from '../accountBalance';

// computeImpact

describe('computeImpact', () => {
  describe('ASSET (debit-normal)', () => {
    it('returns positive when debit > credit', () => {
      expect(computeImpact('ASSET', 1000, 0)).toBe(1000);
    });
    it('returns negative when credit > debit', () => {
      expect(computeImpact('ASSET', 0, 500)).toBe(-500);
    });
    it('returns zero when debit equals credit', () => {
      expect(computeImpact('ASSET', 300, 300)).toBe(0);
    });
  });

  describe('EXPENSE (debit-normal)', () => {
    it('returns positive when debit > credit', () => {
      expect(computeImpact('EXPENSE', 250, 0)).toBe(250);
    });
    it('returns negative when credit > debit', () => {
      expect(computeImpact('EXPENSE', 100, 400)).toBe(-300);
    });
  });

  describe('LIABILITY (credit-normal)', () => {
    it('returns positive when credit > debit', () => {
      expect(computeImpact('LIABILITY', 0, 800)).toBe(800);
    });
    it('returns negative when debit > credit', () => {
      expect(computeImpact('LIABILITY', 600, 0)).toBe(-600);
    });
  });

  describe('EQUITY (credit-normal)', () => {
    it('returns positive when credit > debit', () => {
      expect(computeImpact('EQUITY', 0, 5000)).toBe(5000);
    });
    it('returns zero when balanced', () => {
      expect(computeImpact('EQUITY', 1000, 1000)).toBe(0);
    });
  });

  describe('REVENUE (credit-normal)', () => {
    it('returns positive when credit > debit', () => {
      expect(computeImpact('REVENUE', 0, 2000)).toBe(2000);
    });
    it('returns negative when debit > credit (reversal)', () => {
      expect(computeImpact('REVENUE', 500, 200)).toBe(-300);
    });
  });

  it('treats unknown rootType as credit-normal', () => {
    expect(computeImpact('UNKNOWN', 0, 100)).toBe(100);
    expect(computeImpact('UNKNOWN', 100, 0)).toBe(-100);
  });
});

// updateAccountBalance

describe('updateAccountBalance', () => {
  const makeTx = (rootType: string) => ({
    account: {
      findUnique: vi.fn().mockResolvedValue({ rootType }),
      update: vi.fn().mockResolvedValue({}),
    },
  });

  it('increments an ASSET account by debit - credit', async () => {
    const tx = makeTx('ASSET') as any;
    await updateAccountBalance(tx, 'acc-1', 500, 200);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { balance: { increment: 300 } },
    });
  });

  it('increments a REVENUE account by credit - debit', async () => {
    const tx = makeTx('REVENUE') as any;
    await updateAccountBalance(tx, 'acc-2', 0, 1000);
    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acc-2' },
      data: { balance: { increment: 1000 } },
    });
  });

  it('does nothing if account not found', async () => {
    const tx = {
      account: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    } as any;
    await updateAccountBalance(tx, 'missing', 100, 0);
    expect(tx.account.update).not.toHaveBeenCalled();
  });
});

// updateBalancesForItems

describe('updateBalancesForItems', () => {
  it('calls updateAccountBalance once per item', async () => {
    const tx = {
      account: {
        findUnique: vi.fn().mockResolvedValue({ rootType: 'ASSET' }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const items = [
      { accountId: 'a1', debit: 100, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 200 },
      { accountId: 'a3', debit: 50, credit: 50 },
    ];

    await updateBalancesForItems(tx, items);
    expect(tx.account.findUnique).toHaveBeenCalledTimes(3);
    expect(tx.account.update).toHaveBeenCalledTimes(3);
  });

  it('handles an empty items array without errors', async () => {
    const tx = { account: { findUnique: vi.fn(), update: vi.fn() } } as any;
    await expect(updateBalancesForItems(tx, [])).resolves.toBeUndefined();
    expect(tx.account.findUnique).not.toHaveBeenCalled();
  });
});
