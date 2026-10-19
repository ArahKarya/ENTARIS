import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const EXPIRY_NOTIFICATION_DAYS = 3;

/**
 * Mark `Sent` quotations whose `validUntil` has passed as `Expired`.
 * Atomic UPDATE so it's safe against the accept endpoint racing with the
 * sweeper — accept also re-validates `validUntil >= now` inside its own
 * transaction.
 */
async function expireOverdueQuotations(): Promise<number> {
  const result = await prisma.quotation.updateMany({
    where: { status: 'Sent', validUntil: { lt: new Date() } },
    data: { status: 'Expired', expiredAt: new Date() },
  });
  return result.count;
}

/**
 * Notify creators when a `Sent` quotation is approaching expiry. Each row
 * gets a single notification ever — guarded by `expiry_notified_at IS NULL`.
 */
async function notifyExpiringQuotations(): Promise<number> {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + EXPIRY_NOTIFICATION_DAYS);

  const candidates = await prisma.quotation.findMany({
    where: {
      status: 'Sent',
      validUntil: { gte: new Date(), lte: horizon },
      expiryNotifiedAt: null,
    },
    select: {
      id: true,
      quotationNumber: true,
      validUntil: true,
      createdBy: true,
      customer: { select: { name: true } },
    },
  });

  let created = 0;
  for (const q of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.notification.create({
          data: {
            userId: q.createdBy,
            type: 'quotation_expiring',
            title: 'Penawaran akan kadaluarsa',
            message: `Penawaran ${q.quotationNumber} untuk ${q.customer.name} akan kadaluarsa pada ${q.validUntil.toISOString().slice(0, 10)}.`,
            metadata: { quotationId: q.id, quotationNumber: q.quotationNumber },
          },
        });
        await tx.quotation.update({
          where: { id: q.id },
          data: { expiryNotifiedAt: new Date() },
        });
      });
      created++;
    } catch (err) {
      logger.error({ err, quotationId: q.id }, 'Failed to create expiry notification');
    }
  }
  return created;
}

export async function runQuotationSweeper(): Promise<void> {
  try {
    const [expired, notified] = await Promise.all([
      expireOverdueQuotations(),
      notifyExpiringQuotations(),
    ]);
    if (expired > 0 || notified > 0) {
      logger.info({ expired, notified }, 'Quotation sweeper run');
    }
  } catch (err) {
    logger.error({ err }, 'Quotation sweeper failed');
  }
}

/**
 * Start an interval that runs the sweeper every hour. Caller is responsible
 * for keeping a reference if it needs to clear the interval (e.g. tests).
 */
export function startQuotationSweeper(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  void runQuotationSweeper();
  return setInterval(() => void runQuotationSweeper(), intervalMs);
}
