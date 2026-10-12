/**
 * Demo data end to end: generate through the real HTTP handlers, check the books, then delete and
 * check that only settings and pre-existing masters remain.
 *
 * Starts the full app (src/index.ts) on a free port. Needs DATABASE_URL pointing at a database with
 * NO business data (exclusive mode) and DEMO_DATA_IT=1, so it never runs against a dev database by
 * accident. Example:
 *   DEMO_DATA_IT=1 DATABASE_URL=postgresql://.../entaris_demo_test npm run test:integration -- demoData
 */
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const enabled = Boolean(process.env.DATABASE_URL) && process.env.DEMO_DATA_IT === '1';
const d = enabled ? describe : describe.skip;

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

d('demo data (exclusive mode)', () => {
  let prisma: typeof import('../../lib/prisma').prisma;
  let admin: { id: string; role: string };

  beforeAll(async () => {
    process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
    process.env.PORT = String(await freePort());
    ({ prisma } = await import('../../lib/prisma'));
    const { findNonEmptyDataTables } = await import('../../services/demoData/guard');
    const busy = await findNonEmptyDataTables();
    if (busy.length) throw new Error(`Test database must have no business data; found rows in: ${busy.join(', ')}`);
    await import('../../index');
    for (let i = 0; i < 50; i++) {
      const ok = await fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => r.ok).catch(() => false);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const user = await prisma.user.findFirstOrThrow({ where: { role: 'Admin', isActive: true }, select: { id: true, role: true } });
    admin = user;
  }, 60_000);

  afterAll(async () => {
    const { wipeDemoData } = await import('../../services/demoData/wipe');
    if (await prisma.demoDataBatch.findFirst()) await wipeDemoData();
  });

  it('generates every phase-1 module with balanced books', async () => {
    const { runBatch } = await import('../../services/demoData/runner');
    const { createDemoApi } = await import('../../services/demoData/api');
    const batch = await prisma.demoDataBatch.create({ data: { createdBy: admin.id } });
    await runBatch(batch.id, admin, createDemoApi());

    const done = await prisma.demoDataBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(done.error).toBeNull();
    expect(done.status).toBe('done');

    const totals = await prisma.accountingLedgerEntry.aggregate({ where: { isCancelled: false }, _sum: { debit: true, credit: true } });
    expect(Number(totals._sum.debit)).toBeCloseTo(Number(totals._sum.credit), 2);

    const counts = await Promise.all([
      prisma.inquiry.count(),
      prisma.quotation.count(),
      prisma.salesOrder.count(),
      prisma.deliveryOrder.count(),
      prisma.salesInvoice.count(),
      prisma.salesReturn.count(),
      prisma.purchaseOrder.count(),
      prisma.goodsReceipt.count(),
      prisma.purchaseInvoice.count(),
      prisma.payment.count(),
    ]);
    for (const c of counts) expect(c).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { via: 'demo' } })).toBeGreaterThan(0);
  }, 300_000);

  it('deletes everything it created and leaves settings intact', async () => {
    const { wipeDemoData } = await import('../../services/demoData/wipe');
    const { findNonEmptyDataTables } = await import('../../services/demoData/guard');
    const usersBefore = await prisma.user.count();
    const accountsBefore = await prisma.account.count();

    await wipeDemoData();

    expect(await findNonEmptyDataTables()).toEqual([]);
    expect(await prisma.party.count({ where: { isDummy: true } })).toBe(0);
    expect(await prisma.demoDataBatch.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { via: 'demo' } })).toBe(0);
    expect(await prisma.user.count()).toBe(usersBefore);
    expect(await prisma.account.count()).toBe(accountsBefore);
    const nonZero = await prisma.account.count({ where: { NOT: { balance: 0 } } });
    expect(nonZero).toBe(0);
  }, 120_000);
});
