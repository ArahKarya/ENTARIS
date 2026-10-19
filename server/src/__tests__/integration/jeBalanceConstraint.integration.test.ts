/**
 * Integration test: DB-level double-entry invariant.
 *
 * Asserts that the deferred constraint trigger added in migration
 * 20260511b_je_balance_check rejects an unbalanced Submitted journal entry
 * at COMMIT, while allowing balanced ones through.
 *
 * Runs against the live dev DB. Each test uses a randomly-prefixed entry
 * number + a single $transaction that ROLLBACKs after assertion to leave
 * no trace. Skip the file if DATABASE_URL is missing — keeps unit-test
 * runs clean in environments without DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

let prisma: PrismaClient;
let pool: Pool;
let userId: string;
let fyId: string;
let accountId: string;

beforeAll(async () => {
  if (!hasDb) return;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  // Cast: @prisma/adapter-pg bundles its own @types/pg version. The runtime
  // pool is interchangeable; only the type identity differs.
  const adapter = new PrismaPg(pool as any);
  prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findFirst({ where: { role: 'Admin', isActive: true } });
  if (!user) throw new Error('No admin user to attribute test entries.');
  userId = user.id;

  const fy = await prisma.fiscalYear.findFirst({ where: { isClosed: false } });
  if (!fy) throw new Error('No open fiscal year.');
  fyId = fy.id;

  const acc = await prisma.account.findFirst();
  if (!acc) throw new Error('No account in COA.');
  accountId = acc.id;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (pool) await pool.end();
});

d('JE balance constraint (DB trigger)', () => {
  it('rejects an unbalanced Submitted journal entry at COMMIT', async () => {
    const entryNumber = `TEST-UNBAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await expect(
      prisma.$transaction(async (tx) => {
        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: new Date(),
            status: 'Submitted',
            fiscalYearId: fyId,
            createdBy: userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId, debit: 100, credit: 0 },
                { accountId, debit: 0, credit: 50 }, // intentionally off
              ],
            },
          },
        });
        return je;
      }),
    ).rejects.toThrow(/unbalanced/i);
  });

  it('accepts a balanced Submitted journal entry', async () => {
    const entryNumber = `TEST-BAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let createdId: string | null = null;

    try {
      await prisma.$transaction(async (tx) => {
        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: new Date(),
            status: 'Submitted',
            narration: 'integration test — balanced',
            fiscalYearId: fyId,
            createdBy: userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId, debit: 100, credit: 0 },
                { accountId, debit: 0, credit: 100 },
              ],
            },
          },
        });
        createdId = je.id;
      });
      expect(createdId).not.toBeNull();
    } finally {
      // Cleanup: cascade deletes items via FK
      if (createdId) {
        await prisma.journalEntry.delete({ where: { id: createdId } }).catch(() => {});
      }
    }
  });

  it('allows a Draft journal entry to be unbalanced (trigger exempts Draft)', async () => {
    const entryNumber = `TEST-DRAFT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let createdId: string | null = null;

    try {
      await prisma.$transaction(async (tx) => {
        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: new Date(),
            status: 'Draft',
            fiscalYearId: fyId,
            createdBy: userId,
            items: {
              create: [
                { accountId, debit: 100, credit: 0 },
                { accountId, debit: 0, credit: 50 },
              ],
            },
          },
        });
        createdId = je.id;
      });
      expect(createdId).not.toBeNull();
    } finally {
      if (createdId) {
        await prisma.journalEntry.delete({ where: { id: createdId } }).catch(() => {});
      }
    }
  });
});

// Silence "unused" warnings when the suite is skipped.
void Prisma;
