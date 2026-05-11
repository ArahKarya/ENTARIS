import { Prisma } from '@prisma/client';

/**
 * Generates a sequential document number using advisory locks to prevent
 * race conditions under concurrent requests.
 *
 * Format: {prefix}-YYYYMM-XXXX  e.g. SI-202603-0001
 * Count is scoped to (prefix, fiscalYear, month) to ensure sequential numbering per month.
 */
export async function generateDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: 'JV' | 'SI' | 'PI' | 'PAY' | 'SM' | 'PR' | 'OB' | 'SO' | 'QO' | 'INQ' | 'ST',
  date: Date,
  fiscalYearId: string
): Promise<string> {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const monthStr = String(month + 1).padStart(2, '0');
  const yearMonth = `${year}${monthStr}`;

  // Use a deterministic advisory lock key per (prefix, yearMonth)
  // FNV-1a-like hash to avoid collisions between different prefix+month combos
  const key = `${prefix}-${yearMonth}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // keep as unsigned 32-bit
  }
  const lockKey = hash % 2147483647; // ensure fits in PostgreSQL int4
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  // Count existing documents in this fiscal year AND month to get proper sequential number
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const dateFilter = { date: { gte: monthStart, lt: monthEnd } };
  const where = { fiscalYearId, ...dateFilter };

  let count = 0;
  if (prefix === 'SI') {
    count = await tx.salesInvoice.count({ where });
  } else if (prefix === 'PI') {
    count = await tx.purchaseInvoice.count({ where });
  } else if (prefix === 'PAY') {
    count = await tx.payment.count({ where });
  } else if (prefix === 'SM') {
    count = await tx.stockMovement.count({ where });
  } else if (prefix === 'PR') {
    count = await tx.productionRun.count({ where });
  } else if (prefix === 'SO') {
    count = await tx.stockOpname.count({ where });
  } else if (prefix === 'QO') {
    count = await tx.quotation.count({ where });
  } else if (prefix === 'INQ') {
    count = await tx.inquiry.count({ where });
  } else if (prefix === 'ST') {
    count = await tx.stockTransfer.count({ where });
  } else {
    count = await tx.journalEntry.count({ where });
  }

  return `${prefix}-${yearMonth}-${String(count + 1).padStart(4, '0')}`;
}
