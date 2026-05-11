import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { updateBalancesForItems } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';

interface ExecutionOutcome {
  success: boolean;
  error?: string;
}

/**
 * Resolve the user id under which scheduled (non-HTTP) executions should be
 * recorded. Use the first active Admin — same convention as audit-trail
 * automated entries.
 */
async function resolveSchedulerUserId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'Admin', isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return admin?.id ?? null;
}

/**
 * Calculate the next-run date based on frequency. Mirrors the helper kept
 * in routes/recurring.ts (kept local there for the HTTP path to avoid a
 * cross-module dep cycle; logic is intentionally duplicated and trivial).
 */
function calculateNextRunDate(
  frequency: string,
  fromDate: Date,
  dayOfMonth?: number | null,
): Date {
  const next = new Date(fromDate);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      if (dayOfMonth) {
        const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(dayOfMonth, maxDay));
      }
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

async function executeJournalTemplate(
  template: { id: string; name: string; templateData: unknown },
  userId: string,
): Promise<ExecutionOutcome> {
  const data = template.templateData as {
    items?: Array<{ accountId: string; partyId?: string | null; debit?: number; credit?: number; description?: string }>;
    narration?: string;
  };
  const now = new Date();

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const fiscalYear = await getOpenFiscalYear(tx, now);
      const entryNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);

      const items = (data.items || []).map((item) => ({
        accountId: item.accountId,
        partyId: item.partyId || null,
        debit: item.debit || 0,
        credit: item.credit || 0,
        description: item.description || data.narration || template.name,
      }));

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: now,
          narration: data.narration || template.name,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: userId,
          submittedAt: new Date(),
          items: { create: items },
        },
        include: { items: true },
      });

      await tx.accountingLedgerEntry.createMany({
        data: journalEntry.items.map((item) => ({
          date: now,
          accountId: item.accountId,
          partyId: item.partyId,
          debit: item.debit,
          credit: item.credit,
          referenceType: 'JournalEntry',
          referenceId: journalEntry.id,
          description: item.description || data.narration || template.name,
          fiscalYearId: fiscalYear.id,
        })),
      });

      await updateBalancesForItems(
        tx,
        journalEntry.items.map((i) => ({
          accountId: i.accountId,
          debit: Number(i.debit),
          credit: Number(i.credit),
        })),
      );
    }, { timeout: 15000 });

    return { success: true };
  } catch (error: any) {
    logger.error({ err: error, templateId: template.id }, 'Recurring template execution failed');
    return { success: false, error: error?.message ?? 'Gagal mengeksekusi template.' };
  }
}

/**
 * Find every active template whose nextRunDate is due and execute it. Returns
 * counters for logging. Safe to call from the scheduler (wraps each template
 * in its own transaction; one failure doesn't abort the batch).
 */
export async function runDueRecurringTemplates(): Promise<{
  executed: number;
  failed: number;
  skipped: number;
}> {
  const userId = await resolveSchedulerUserId();
  if (!userId) {
    logger.warn('Recurring runner: no active Admin user to attribute scheduled entries — skipping');
    return { executed: 0, failed: 0, skipped: 0 };
  }

  const now = new Date();
  const due = await prisma.recurringTemplate.findMany({
    where: { isActive: true, nextRunDate: { lte: now } },
  });

  let executed = 0;
  let failed = 0;
  let skipped = 0;

  for (const template of due) {
    if (template.templateType !== 'journal') {
      // Only `journal` is supported via auto-run today.
      skipped++;
      continue;
    }
    const outcome = await executeJournalTemplate(template, userId);
    if (!outcome.success) {
      failed++;
      continue;
    }
    executed++;
    const nextRun = calculateNextRunDate(template.frequency, now, template.dayOfMonth);
    await prisma.recurringTemplate.update({
      where: { id: template.id },
      data: { lastRunDate: now, nextRunDate: nextRun },
    });
  }

  return { executed, failed, skipped };
}
