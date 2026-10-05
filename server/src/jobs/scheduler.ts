import cron, { type ScheduledTask } from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { runQuotationSweeper } from './quotationSweeper';
import { runDueRecurringTemplates } from '../services/recurringRunner';
import { runNotificationChecks } from '../services/notificationService';
import { runSettlementReminders } from '../services/paymentRequestNotify';
import { pollTelegramUpdates } from '../services/telegramService';
import { purgeExpiredNonces } from '../mcp/tokenService';

/**
 * Postgres advisory lock helper. Returns true if THIS connection acquired the
 * lock (it auto-releases on connection close). Use a stable bigint key per
 * job so a future second instance can't run the same job concurrently.
 *
 * NOTE: pg_try_advisory_lock is session-scoped. The prisma adapter uses a
 * pooled connection, so we wrap the actual work in a $transaction() to pin
 * one connection for the whole job + use the transactional variant
 * (pg_try_advisory_xact_lock) so the lock auto-releases at COMMIT/ROLLBACK.
 */
async function withAdvisoryLock<T>(
  jobKey: bigint,
  job: () => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ locked: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(${jobKey.toString()}) AS locked`,
    );
    if (!rows[0]?.locked) {
      logger.debug({ jobKey: jobKey.toString() }, 'Job skipped (lock held by another instance)');
      return null;
    }
    return await job();
  }, { timeout: 5 * 60 * 1000 }); // 5 min — recurring runs can have many templates
}

const tasks: ScheduledTask[] = [];

/**
 * Purge tokenBlacklist rows whose JWT has already expired. The blacklist is
 * checked on every authenticated request — if it grows unbounded it slows
 * down findUnique.
 */
async function purgeExpiredTokens(): Promise<void> {
  try {
    const result = await prisma.tokenBlacklist.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      logger.info({ deleted: result.count }, 'Purged expired blacklisted tokens');
    }
  } catch (err) {
    logger.error({ err }, 'Token blacklist purge failed');
  }
}

/**
 * Start every recurring job. Idempotent — safe to call multiple times in
 * tests, returns immediately if already started.
 */
let started = false;
export function startScheduler(): void {
  if (started) return;
  started = true;

  // Hourly: token blacklist cleanup. No advisory lock needed — DELETE is
  // already idempotent and cheap.
  tasks.push(
    cron.schedule('0 * * * *', () => {
      void purgeExpiredTokens();
      void purgeExpiredNonces().catch((err) => logger.error({ err }, 'MCP nonce purge failed'));
    }),
  );

  // Hourly: quotation lifecycle (auto-expire + notify-approaching).
  tasks.push(
    cron.schedule('15 * * * *', () => {
      void withAdvisoryLock(BigInt('123456789001'), () => runQuotationSweeper());
    }),
  );

  // Daily 02:00: execute due recurring transaction templates. Off-hours so it
  // doesn't contend with users. Idempotent via advisory lock (key 0x...02).
  tasks.push(
    cron.schedule('0 2 * * *', () => {
      void withAdvisoryLock(BigInt('123456789002'), async () => {
        try {
          const result = await runDueRecurringTemplates();
          if (result.executed > 0 || result.failed > 0) {
            logger.info(result, 'Recurring templates daily run');
          }
        } catch (err) {
          logger.error({ err }, 'Recurring templates daily run failed');
        }
      });
    }, { timezone: 'Asia/Jakarta' }),
  );

  // Daily 07:00 Asia/Jakarta: cek invoice jatuh tempo + stok rendah → notifikasi.
  // Dedup 24h di dalam runNotificationChecks bikin self-healing kalau terlewat.
  tasks.push(
    cron.schedule('0 7 * * *', () => {
      void withAdvisoryLock(BigInt('123456789003'), async () => {
        try {
          const { created } = await runNotificationChecks();
          if (created > 0) logger.info({ created }, 'Notification checks daily run');
          const reminders = await runSettlementReminders();
          if (reminders.created > 0) logger.info(reminders, 'Advance settlement reminders daily run');
        } catch (err) {
          logger.error({ err }, 'Notification checks daily run failed');
        }
      });
    }, { timezone: 'Asia/Jakarta' }),
  );

  // Tiap menit: poll getUpdates Telegram → tautkan /start <kode> ke user.
  // Ringan & langsung skip kalau Telegram nonaktif/no token.
  tasks.push(
    cron.schedule('* * * * *', () => {
      void withAdvisoryLock(BigInt('123456789004'), () => pollTelegramUpdates());
    }),
  );

  // Run quotation sweeper once at startup to catch anything missed during downtime.
  void runQuotationSweeper();
  void purgeExpiredTokens();

  logger.info(`Scheduler started: ${tasks.length} cron tasks registered`);
}

export function stopScheduler(): void {
  for (const t of tasks) {
    try { t.stop(); } catch { /* ignore */ }
  }
  tasks.length = 0;
  started = false;
}
