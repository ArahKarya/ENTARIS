import { describe, expect, it, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
vi.mock('../../lib/prisma', () => ({ prisma: { journalEntry: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { withJournalLabels } from '../ledgerEntryLabels';

describe('withJournalLabels', () => {
  beforeEach(() => findMany.mockReset());

  it('fills a missing description from the journal narration and exposes the journal number', async () => {
    findMany.mockResolvedValue([{ id: 'je-1', entryNumber: 'JV-202610-0001', narration: 'Stok Masuk: Beras 10 Kg' }]);
    const [row] = await withJournalLabels([{ id: 'l1', referenceType: 'JournalEntry', referenceId: 'je-1', description: null }]);
    expect(row).toMatchObject({ description: 'Stok Masuk: Beras 10 Kg', referenceNumber: 'JV-202610-0001' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['je-1'] } } }));
  });

  it('keeps an existing description and leaves other reference types alone', async () => {
    findMany.mockResolvedValue([{ id: 'je-1', entryNumber: 'JV-1', narration: 'narasi' }]);
    const rows = await withJournalLabels([
      { id: 'l1', referenceType: 'JournalEntry', referenceId: 'je-1', description: 'Baris sendiri' },
      { id: 'l2', referenceType: 'Payment', referenceId: 'pay-1', description: null },
    ]);
    expect(rows[0]).toMatchObject({ description: 'Baris sendiri', referenceNumber: 'JV-1' });
    expect(rows[1]).toMatchObject({ description: null, referenceNumber: null });
  });

  it('skips the lookup when no row points at a journal', async () => {
    const rows = await withJournalLabels([{ id: 'l2', referenceType: 'Payment', referenceId: 'p', description: 'x' }]);
    expect(findMany).not.toHaveBeenCalled();
    expect(rows[0]?.referenceNumber).toBeNull();
  });
});
