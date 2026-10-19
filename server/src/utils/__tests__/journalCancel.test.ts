import { describe, it, expect, vi } from 'vitest';
import { cancelJournalsByPrefix } from '../journalCancel';

describe('cancelJournalsByPrefix', () => {
  const makeJournal = (id: string, entryNumber: string, items: Array<{ accountId: string; debit: number; credit: number }>) => ({
    id,
    entryNumber,
    items: items.map((item, idx) => ({ id: `ji-${id}-${idx}`, ...item })),
  });

  const makeTx = (journals: ReturnType<typeof makeJournal>[]) => ({
    journalEntry: {
      findMany: vi.fn().mockResolvedValue(journals),
      update: vi.fn().mockResolvedValue({}),
    },
    accountingLedgerEntry: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    account: {
      findUnique: vi.fn().mockResolvedValue({ rootType: 'ASSET' }),
      update: vi.fn().mockResolvedValue({}),
    },
  });

  it('cancels a single journal matching prefix', async () => {
    const journal = makeJournal('j1', 'JV-PR0004', [
      { accountId: 'a1', debit: 1000, credit: 0 },
      { accountId: 'a2', debit: 0, credit: 1000 },
    ]);
    const tx = makeTx([journal]) as any;

    const count = await cancelJournalsByPrefix(tx, 'JV-PR0004');

    expect(count).toBe(1);
    expect(tx.journalEntry.findMany).toHaveBeenCalledWith({
      where: {
        entryNumber: { startsWith: 'JV-PR0004' },
        status: { not: 'Cancelled' },
      },
      include: { items: true },
    });
    expect(tx.journalEntry.update).toHaveBeenCalledWith({
      where: { id: 'j1' },
      data: { status: 'Cancelled', cancelledAt: expect.any(Date) },
    });
    expect(tx.accountingLedgerEntry.updateMany).toHaveBeenCalledWith({
      where: { referenceId: 'j1' },
      data: { isCancelled: true },
    });
  });

  it('cancels multiple journals including revisions (JV-PR0004, JV-PR0004-R, JV-PR0004-R2)', async () => {
    const journals = [
      makeJournal('j1', 'JV-PR0004', [
        { accountId: 'inv', debit: 0, credit: 500 },
        { accountId: 'hpp', debit: 500, credit: 0 },
      ]),
      makeJournal('j2', 'JV-PR0004-R', [
        { accountId: 'inv', debit: 0, credit: 600 },
        { accountId: 'hpp', debit: 600, credit: 0 },
      ]),
      makeJournal('j3', 'JV-PR0004-R2', [
        { accountId: 'inv', debit: 0, credit: 700 },
        { accountId: 'hpp', debit: 700, credit: 0 },
      ]),
    ];
    const tx = makeTx(journals) as any;

    const count = await cancelJournalsByPrefix(tx, 'JV-PR0004');

    expect(count).toBe(3);
    expect(tx.journalEntry.update).toHaveBeenCalledTimes(3);
    expect(tx.accountingLedgerEntry.updateMany).toHaveBeenCalledTimes(3);
  });

  it('reverses account balances (swaps debit/credit)', async () => {
    const journal = makeJournal('j1', 'JV-SO0001', [
      { accountId: 'inventory', debit: 1000, credit: 0 },
      { accountId: 'variance', debit: 0, credit: 1000 },
    ]);
    const tx = makeTx([journal]) as any;

    await cancelJournalsByPrefix(tx, 'JV-SO0001');

    // Balance reversal: swap debit↔credit → call updateAccountBalance(credit, debit)
    // For inventory (debit=1000, credit=0): reversed → updateAccountBalance(0, 1000)
    // For variance (debit=0, credit=1000): reversed → updateAccountBalance(1000, 0)
    expect(tx.account.update).toHaveBeenCalledTimes(2);
  });

  it('returns 0 when no active journals match prefix', async () => {
    const tx = makeTx([]) as any;

    const count = await cancelJournalsByPrefix(tx, 'JV-NONEXISTENT');

    expect(count).toBe(0);
    expect(tx.journalEntry.update).not.toHaveBeenCalled();
    expect(tx.accountingLedgerEntry.updateMany).not.toHaveBeenCalled();
  });

  it('uses startsWith to match prefix (not exact match)', async () => {
    const tx = makeTx([]) as any;

    await cancelJournalsByPrefix(tx, 'JV-PR0004');

    expect(tx.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entryNumber: { startsWith: 'JV-PR0004' },
        }),
      })
    );
  });
});
