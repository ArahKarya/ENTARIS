import { Prisma } from '@prisma/client';
import { BusinessError } from './errors';

/**
 * Find the open fiscal year that contains the given date.
 * Throws BusinessError if not found or already closed.
 */
export async function getOpenFiscalYear(
  tx: Prisma.TransactionClient,
  date: Date
) {
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      isClosed: false,
    },
  });

  if (!fiscalYear) {
    throw new BusinessError('Tahun fiskal tidak ditemukan atau sudah ditutup untuk tanggal ini.');
  }

  return fiscalYear;
}
