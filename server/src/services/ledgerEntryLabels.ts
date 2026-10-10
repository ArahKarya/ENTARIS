import { prisma } from '../lib/prisma';

export interface LabelableLedgerEntry {
  referenceType: string;
  referenceId: string;
  description: string | null;
}

/**
 * Ledger rows posted straight from a journal entry may lack their own
 * description (older stock movements never wrote one). Fall back to the
 * journal narration and expose the journal number so the workspace never
 * shows the raw reference type.
 */
export async function withJournalLabels<T extends LabelableLedgerEntry>(
  entries: T[],
): Promise<Array<T & { referenceNumber: string | null }>> {
  const journalIds = [
    ...new Set(entries.filter((e) => e.referenceType === 'JournalEntry').map((e) => e.referenceId)),
  ];
  const journals = journalIds.length
    ? await prisma.journalEntry.findMany({
        where: { id: { in: journalIds } },
        select: { id: true, entryNumber: true, narration: true },
      })
    : [];
  const byId = new Map(journals.map((j) => [j.id, j]));
  return entries.map((e) => {
    const je = e.referenceType === 'JournalEntry' ? byId.get(e.referenceId) : undefined;
    return {
      ...e,
      description: e.description || je?.narration || null,
      referenceNumber: je?.entryNumber ?? null,
    };
  });
}
