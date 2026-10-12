import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { recalculateAccountBalances } from '../../utils/accountBalance';
import { DATA_TABLES, DEMO_MASTER_TABLES } from './tables';

export interface WipeResult {
  dataTables: number;
  masters: Record<string, number>;
  auditRows: number;
  notifications: number;
}

/**
 * Delete demo data in exclusive mode: empty every data table, delete the masters the demo created,
 * drop the demo's audit and notification rows, then reset the balances that were derived from the
 * transactions. Settings, users, chart of accounts and pre-existing masters are kept.
 */
export async function wipeDemoData(): Promise<WipeResult> {
  return prisma.$transaction(
    async (tx) => {
      const batches = await tx.demoDataBatch.findMany({ select: { id: true, startedAt: true } });
      const since = batches.reduce<Date | null>((min, b) => (min && min < b.startedAt ? min : b.startedAt), null);

      // No CASCADE: if a table outside DATA_TABLES references one of them, Postgres refuses instead of
      // silently emptying a kept table.
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${DATA_TABLES.map((t) => `"${t}"`).join(', ')}`);

      const masters: Record<string, number> = {};
      for (const table of DEMO_MASTER_TABLES) {
        const ids = (await tx.demoDataRecord.findMany({ where: { model: table }, select: { recordId: true } })).map((r) => r.recordId);
        if (ids.length === 0) continue;
        masters[table] = await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE id = ANY($1::text[])`, ids);
      }
      const fiscalYearIds = (await tx.demoDataRecord.findMany({ where: { model: 'fiscal_years' }, select: { recordId: true } })).map((r) => r.recordId);
      if (fiscalYearIds.length) masters.fiscal_years = (await tx.fiscalYear.deleteMany({ where: { id: { in: fiscalYearIds } } })).count;

      const auditRows = (await tx.auditLog.deleteMany({ where: { via: 'demo' } })).count;
      const notifications = since ? (await tx.notification.deleteMany({ where: { createdAt: { gte: since } } })).count : 0;

      await resetDerivedBalances(tx);
      await tx.demoDataBatch.deleteMany({});

      return { dataTables: DATA_TABLES.length, masters, auditRows, notifications };
    },
    { timeout: 120_000 },
  );
}

/** With every transaction gone, derived balances return to their opening values. */
async function resetDerivedBalances(tx: Prisma.TransactionClient): Promise<void> {
  await recalculateAccountBalances(tx);
  await tx.$executeRawUnsafe(
    'UPDATE "parties" SET "outstanding_amount" = "opening_outstanding", "deposit_balance" = 0, "customer_deposit_balance" = 0',
  );
  await tx.$executeRawUnsafe('UPDATE "inventory_items" SET "current_stock" = 0');
}
