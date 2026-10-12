// Starts and runs a demo-data batch in the background. The HTTP request that starts it returns at
// once; the client polls the batch row for progress.

import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { hasCap } from '../permissionService';
import { createDemoApi, type DemoActor, type DemoApi } from './api';
import { makeRecorder, makeScheduler, makeSkipper, sortEvents, type DemoContext, type DemoEvent } from './context';
import { activeDemoBatch, findNonEmptyDataTables, hasLegacyDummyData } from './guard';
import { createMasters, ensureFiscalYears, postOpeningBalances, resolveAccounts } from './scenario/setup';
import { schedulePurchasing, type PurchaseState } from './scenario/purchasing';
import { scheduleSales, type SalesState } from './scenario/sales';
import { scheduleSalesExtras } from './scenario/salesExtras';
import { scheduleFinance } from './scenario/finance';

export type StartBlock =
  | { code: 'demo_exists' }
  | { code: 'legacy_dummy' }
  | { code: 'not_empty'; tables: string[] };

export class DemoStartBlocked extends Error {
  constructor(readonly block: StartBlock) {
    super(block.code);
    this.name = 'DemoStartBlocked';
  }
}

const SETUP_STEPS = 4;

async function findStaffActor(): Promise<DemoActor | null> {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, role: true }, orderBy: { createdAt: 'asc' } });
  for (const u of users) if (!(await hasCap(u.role, 'approval.bypass'))) return { id: u.id, role: u.role };
  return null;
}

function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** Refuse unless the company has no business data yet; then create the batch row. */
export async function startDemoGeneration(admin: DemoActor, api: DemoApi = createDemoApi()): Promise<string> {
  // Check and create under one advisory lock so two clicks or two admins cannot start two batches.
  const batch = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('entaris_demo_data'))`;
    if (await activeDemoBatch(tx)) throw new DemoStartBlocked({ code: 'demo_exists' });
    if (await hasLegacyDummyData(tx)) throw new DemoStartBlocked({ code: 'legacy_dummy' });
    const tables = await findNonEmptyDataTables(tx);
    if (tables.length) throw new DemoStartBlocked({ code: 'not_empty', tables });
    return tx.demoDataBatch.create({ data: { createdBy: admin.id, step: 'Persiapan', totalSteps: SETUP_STEPS } });
  });
  runBatch(batch.id, admin, api).catch((err) => logger.error({ err, batchId: batch.id }, 'Demo data batch crashed'));
  return batch.id;
}

/** A batch left 'running' by a stopped server can never finish; mark it failed so it can be deleted. */
export async function failOrphanedDemoBatches(): Promise<number> {
  const { count } = await prisma.demoDataBatch.updateMany({
    where: { status: 'running' },
    data: { status: 'failed', error: 'Server dimulai ulang saat data uji coba sedang dibuat.', finishedAt: new Date() },
  });
  return count;
}

export async function runBatch(batchId: string, admin: DemoActor, api: DemoApi): Promise<void> {
  const today = startOfToday();
  const queue: DemoEvent[] = [];
  let done = 0;
  const progress = (step: string, totalSteps?: number) =>
    prisma.demoDataBatch.update({ where: { id: batchId }, data: { step, doneSteps: done, ...(totalSteps ? { totalSteps } : {}) } });

  try {
    const ctx: DemoContext = {
      api,
      batchId,
      admin,
      staff: await findStaffActor(),
      today,
      accounts: {} as DemoContext['accounts'],
      warehouses: {} as DemoContext['warehouses'],
      parties: {},
      items: {},
      serviceItems: {},
      temporaryNote: null,
      record: makeRecorder(batchId),
      skip: makeSkipper(batchId),
      schedule: makeScheduler(today, queue),
    };
    await progress('Tahun buku');
    await ensureFiscalYears(api, admin, today, ctx.record);
    done++;
    await progress('Akun');
    ctx.accounts = await resolveAccounts(api, admin);
    done++;
    await progress('Data induk');
    await createMasters(ctx);
    done++;
    await progress('Saldo awal');
    await postOpeningBalances(ctx);
    done++;

    const purchases: PurchaseState = { invoices: [] };
    const sales: SalesState = { invoices: [] };
    schedulePurchasing(ctx, purchases);
    scheduleSales(ctx, sales);
    scheduleSalesExtras(ctx, sales);
    scheduleFinance(ctx, purchases);
    const events = sortEvents(queue);
    await progress('Transaksi', SETUP_STEPS + events.length);

    for (const ev of events) {
      await progress(ev.label);
      await ev.run();
      done++;
    }
    await prisma.demoDataBatch.update({ where: { id: batchId }, data: { status: 'done', step: null, doneSteps: done, finishedAt: new Date() } });
    logger.info({ batchId, steps: done }, 'Demo data generated');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, batchId }, 'Demo data generation failed');
    await prisma.demoDataBatch
      .update({ where: { id: batchId }, data: { status: 'failed', error: message.slice(0, 1000), finishedAt: new Date() } })
      .catch((e) => logger.error({ e, batchId }, 'Could not mark demo batch failed'));
  }
}
