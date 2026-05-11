import { Router } from 'express';
import { roleMiddleware, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { recalculateAccountBalances } from '../utils/accountBalance';

const router = Router();

interface CheckResult {
  name: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  count: number;
  details?: unknown[];
  fixable: boolean;
}

// ── GET /api/health-check — Run all diagnostic checks ────────────────────────
router.get('/', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    const checks: CheckResult[] = await Promise.all([
      checkAleSync(),
      checkAccountBalanceDrift(),
      checkUnbalancedJournals(),
      checkOrphanAle(),
      checkStockMovementMismatch(),
      checkWarehouseStockDrift(),
    ]);

    const overallStatus = checks.some((c) => c.status === 'error')
      ? 'error'
      : checks.some((c) => c.status === 'warning')
        ? 'warning'
        : 'ok';

    res.json({ success: true, data: { status: overallStatus, checks } });
  } catch (error) {
    logger.error(error, 'Health check failed');
    res.status(500).json({ success: false, error: 'Gagal menjalankan health check' });
  }
});

// ── GET /api/health-check/preview/:check — Preview what fix will change ─────
router.get('/preview/:check', roleMiddleware(['Admin']), async (req, res) => {
  const check = String(req.params.check ?? '');

  try {
    let preview: { description: string; count: number; details: unknown[]; warning?: string };

    switch (check) {
      case 'ale-sync':
        preview = await previewAleSync();
        break;
      case 'account-balance-drift':
        preview = await previewAccountBalanceDrift();
        break;
      case 'orphan-ale':
        preview = await previewOrphanAle();
        break;
      default:
        return res.status(400).json({ success: false, error: 'Check tidak dapat di-preview' });
    }

    res.json({ success: true, data: { check, ...preview } });
  } catch (error) {
    logger.error(error, `Health check preview failed: ${check}`);
    res.status(500).json({ success: false, error: 'Gagal membuat preview' });
  }
});

// ── POST /api/health-check/fix/:check — Auto-fix a specific check ────────────
router.post('/fix/:check', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const check = String(req.params.check ?? '');
  const userId = req.user?.userId;
  const userAgent = Array.isArray(req.headers['user-agent'])
    ? req.headers['user-agent'][0]
    : req.headers['user-agent'];

  const actionMap: Record<string, string> = {
    'ale-sync': 'FIX_ALE_SYNC',
    'account-balance-drift': 'FIX_ACCOUNT_BALANCE_DRIFT',
    'orphan-ale': 'FIX_ORPHAN_ALE',
  };

  if (!actionMap[check]) {
    return res.status(400).json({ success: false, error: 'Check tidak dapat diperbaiki otomatis' });
  }

  const startedAt = new Date();
  try {
    let result: { fixed: number; message: string; snapshot?: unknown };

    switch (check) {
      case 'ale-sync':
        result = await fixAleSync();
        break;
      case 'account-balance-drift':
        result = await fixAccountBalanceDrift();
        break;
      case 'orphan-ale':
        result = await fixOrphanAle();
        break;
      default:
        return res.status(400).json({ success: false, error: 'Check tidak dapat diperbaiki otomatis' });
    }

    if (userId) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: actionMap[check],
          entityType: 'health-check',
          entityId: check,
          newValues: {
            check,
            fixed: result.fixed,
            message: result.message,
            snapshot: result.snapshot ?? null,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
          },
          ipAddress: req.ip,
          userAgent,
        },
      }).catch((err) => logger.error({ err }, 'Audit log write failed for health fix'));
    }

    logger.info({ check, userId, fixed: result.fixed }, 'Health check fix applied');
    res.json({ success: true, data: { fixed: result.fixed, message: result.message } });
  } catch (error) {
    logger.error(error, `Health check fix failed: ${check}`);
    if (userId) {
      await prisma.auditLog.create({
        data: {
          userId,
          action: `${actionMap[check]}_FAILED`,
          entityType: 'health-check',
          entityId: check,
          newValues: {
            check,
            error: error instanceof Error ? error.message : String(error),
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
          },
          ipAddress: req.ip,
          userAgent,
        },
      }).catch((err) => logger.error({ err }, 'Audit log write failed for health fix error'));
    }
    res.status(500).json({ success: false, error: 'Gagal memperbaiki masalah' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// CHECK FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * 1. ALE vs JournalItem sync
 * Compare ALE totals (per account, for JournalEntry references) against JournalItem totals.
 */
async function checkAleSync(): Promise<CheckResult> {
  const mismatches = await prisma.$queryRaw<Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    ji_debit: number;
    ji_credit: number;
    ale_debit: number;
    ale_credit: number;
  }>>`
    WITH ji_totals AS (
      SELECT jea.account_id,
             SUM(jea.debit)  AS total_debit,
             SUM(jea.credit) AS total_credit
        FROM journal_entry_accounts jea
        JOIN journal_entries je ON je.id = jea.journal_entry_id
       WHERE je.status != 'Cancelled'
       GROUP BY jea.account_id
    ),
    ale_totals AS (
      SELECT ale.account_id,
             SUM(ale.debit)  AS total_debit,
             SUM(ale.credit) AS total_credit
        FROM accounting_ledger_entries ale
       WHERE ale.reference_type = 'JournalEntry'
         AND ale.is_cancelled = false
       GROUP BY ale.account_id
    )
    SELECT COALESCE(ji.account_id, ale.account_id) AS account_id,
           a."accountNumber" AS account_code,
           a.name AS account_name,
           COALESCE(ji.total_debit, 0)  AS ji_debit,
           COALESCE(ji.total_credit, 0) AS ji_credit,
           COALESCE(ale.total_debit, 0) AS ale_debit,
           COALESCE(ale.total_credit, 0) AS ale_credit
      FROM ji_totals ji
      FULL OUTER JOIN ale_totals ale ON ji.account_id = ale.account_id
      JOIN accounts a ON a.id = COALESCE(ji.account_id, ale.account_id)
     WHERE COALESCE(ji.total_debit, 0) != COALESCE(ale.total_debit, 0)
        OR COALESCE(ji.total_credit, 0) != COALESCE(ale.total_credit, 0)
     ORDER BY a."accountNumber"
  `;

  return {
    name: 'ALE vs JournalItem Sync',
    status: mismatches.length > 0 ? 'error' : 'ok',
    message: mismatches.length > 0
      ? `${mismatches.length} akun memiliki perbedaan antara ALE dan JournalItem`
      : 'ALE dan JournalItem sinkron',
    count: mismatches.length,
    details: mismatches.slice(0, 20),
    fixable: true,
  };
}

/**
 * 2. Account balance drift
 * Compare accounts.balance against computed balance from JournalItems.
 */
async function checkAccountBalanceDrift(): Promise<CheckResult> {
  const drifts = await prisma.$queryRaw<Array<{
    account_id: string;
    account_code: string;
    account_name: string;
    root_type: string;
    stored_balance: number;
    computed_balance: number;
    drift: number;
  }>>`
    WITH computed AS (
      SELECT jea.account_id,
             a."rootType" AS root_type,
             CASE
               WHEN a."rootType" IN ('ASSET', 'EXPENSE')
                 THEN SUM(jea.debit) - SUM(jea.credit)
               ELSE SUM(jea.credit) - SUM(jea.debit)
             END AS computed_balance
        FROM journal_entry_accounts jea
        JOIN journal_entries je ON je.id = jea.journal_entry_id
        JOIN accounts a ON a.id = jea.account_id
       WHERE je.status != 'Cancelled'
       GROUP BY jea.account_id, a."rootType"
    )
    SELECT c.account_id,
           a."accountNumber" AS account_code,
           a.name AS account_name,
           c.root_type,
           a.balance AS stored_balance,
           c.computed_balance,
           ABS(a.balance - c.computed_balance) AS drift
      FROM computed c
      JOIN accounts a ON a.id = c.account_id
     WHERE ABS(a.balance - c.computed_balance) > 0.01
     ORDER BY ABS(a.balance - c.computed_balance) DESC
     LIMIT 20
  `;

  return {
    name: 'Account Balance Drift',
    status: drifts.length > 0 ? 'warning' : 'ok',
    message: drifts.length > 0
      ? `${drifts.length} akun memiliki saldo yang tidak sesuai dengan jurnal`
      : 'Semua saldo akun sesuai',
    count: drifts.length,
    details: drifts,
    fixable: true,
  };
}

/**
 * 3. Unbalanced journal entries
 * Find posted journals where total debit != total credit.
 */
async function checkUnbalancedJournals(): Promise<CheckResult> {
  const unbalanced = await prisma.$queryRaw<Array<{
    journal_id: string;
    entry_number: string;
    total_debit: number;
    total_credit: number;
    difference: number;
  }>>`
    SELECT je.id AS journal_id,
           je.entry_number,
           SUM(jea.debit)  AS total_debit,
           SUM(jea.credit) AS total_credit,
           ABS(SUM(jea.debit) - SUM(jea.credit)) AS difference
      FROM journal_entries je
      JOIN journal_entry_accounts jea ON jea.journal_entry_id = je.id
     WHERE je.status = 'Submitted'
     GROUP BY je.id, je.entry_number
    HAVING ABS(SUM(jea.debit) - SUM(jea.credit)) > 0.01
     ORDER BY difference DESC
     LIMIT 20
  `;

  return {
    name: 'Unbalanced Journal Entries',
    status: unbalanced.length > 0 ? 'error' : 'ok',
    message: unbalanced.length > 0
      ? `${unbalanced.length} jurnal tidak balance (debit ≠ kredit)`
      : 'Semua jurnal balance',
    count: unbalanced.length,
    details: unbalanced,
    fixable: false,
  };
}

/**
 * 4. Orphan ALE entries
 * ALE entries whose source record no longer exists.
 */
async function checkOrphanAle(): Promise<CheckResult> {
  const orphans = await prisma.$queryRaw<Array<{
    ale_id: string;
    reference_type: string;
    reference_id: string;
    account_code: string;
    debit: number;
    credit: number;
  }>>`
    SELECT ale.id AS ale_id,
           ale.reference_type,
           ale.reference_id,
           a."accountNumber" AS account_code,
           ale.debit,
           ale.credit
      FROM accounting_ledger_entries ale
      JOIN accounts a ON a.id = ale.account_id
     WHERE ale.is_cancelled = false
       AND (
         (ale.reference_type = 'JournalEntry'
           AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockMovement'
           AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockOpname'
           AND NOT EXISTS (SELECT 1 FROM stock_opnames so WHERE so.id = ale.reference_id))
       )
     ORDER BY ale.reference_type
     LIMIT 30
  `;

  return {
    name: 'Orphan ALE Entries',
    status: orphans.length > 0 ? 'warning' : 'ok',
    message: orphans.length > 0
      ? `${orphans.length} entri ALE merujuk ke record yang tidak ada`
      : 'Tidak ada ALE orphan',
    count: orphans.length,
    details: orphans.slice(0, 20),
    fixable: true,
  };
}

/**
 * 5. Stock vs movement mismatch
 * Compare product currentStock against sum of stock movements.
 */
async function checkStockMovementMismatch(): Promise<CheckResult> {
  const mismatches = await prisma.$queryRaw<Array<{
    item_id: string;
    item_name: string;
    code: string;
    stored_stock: number;
    computed_stock: number;
    difference: number;
  }>>`
    WITH computed AS (
      SELECT sm.item_id,
             SUM(CASE WHEN sm.movement_type IN ('In', 'AdjustmentIn') THEN sm.quantity ELSE -sm.quantity END) AS total_stock
        FROM stock_movements sm
       WHERE sm.is_cancelled = false
       GROUP BY sm.item_id
    )
    SELECT i.id AS item_id,
           i.name AS item_name,
           i.code,
           i.current_stock AS stored_stock,
           COALESCE(c.total_stock, 0) AS computed_stock,
           ABS(i.current_stock - COALESCE(c.total_stock, 0)) AS difference
      FROM inventory_items i
      LEFT JOIN computed c ON c.item_id = i.id
     WHERE ABS(i.current_stock - COALESCE(c.total_stock, 0)) > 0.001
     ORDER BY difference DESC
     LIMIT 20
  `;

  return {
    name: 'Stock vs Movement Mismatch',
    status: mismatches.length > 0 ? 'warning' : 'ok',
    message: mismatches.length > 0
      ? `${mismatches.length} produk memiliki stok tidak sesuai dengan movement`
      : 'Semua stok produk sesuai',
    count: mismatches.length,
    details: mismatches,
    fixable: false,
  };
}

// Per-warehouse stock drift: inventory_items.current_stock (denormalized total)
// should equal SUM(inventory_stocks.current_stock) for that item. A mismatch
// means one of the multi-warehouse update paths is missing an inventory_stocks
// upsert — bug introduced 2026-05-11 with multi-warehouse rollout.
async function checkWarehouseStockDrift(): Promise<CheckResult> {
  const drifts = await prisma.$queryRaw<Array<{
    item_id: string;
    item_name: string;
    code: string;
    item_total: number;
    warehouse_sum: number;
    difference: number;
  }>>`
    WITH wh_sum AS (
      SELECT item_id, COALESCE(SUM(current_stock), 0) AS total
        FROM inventory_stocks
       GROUP BY item_id
    )
    SELECT i.id AS item_id,
           i.name AS item_name,
           i.code,
           i.current_stock AS item_total,
           COALESCE(w.total, 0) AS warehouse_sum,
           ABS(i.current_stock - COALESCE(w.total, 0)) AS difference
      FROM inventory_items i
      LEFT JOIN wh_sum w ON w.item_id = i.id
     WHERE ABS(i.current_stock - COALESCE(w.total, 0)) > 0.001
     ORDER BY difference DESC
     LIMIT 20
  `;

  return {
    name: 'Drift Stok per Gudang',
    status: drifts.length > 0 ? 'warning' : 'ok',
    message: drifts.length > 0
      ? `${drifts.length} item: total inventory_items ≠ SUM(inventory_stocks per gudang)`
      : 'Total stok per item konsisten dengan saldo per gudang',
    count: drifts.length,
    details: drifts,
    fixable: false,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW FUNCTIONS — capture "what will change" without mutating
// ══════════════════════════════════════════════════════════════════════════════

async function previewAleSync(): Promise<{ description: string; count: number; details: unknown[]; warning?: string }> {
  const [aleCount, jiCount, jeCount] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM accounting_ledger_entries WHERE reference_type = 'JournalEntry'
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM journal_entry_accounts
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM journal_entries
    `,
  ]);

  const deleteCount = Number(aleCount[0]?.count ?? 0);
  const createCount = Number(jiCount[0]?.count ?? 0);
  const jeTotal = Number(jeCount[0]?.count ?? 0);

  return {
    description: `Akan MENGHAPUS ${deleteCount.toLocaleString('id-ID')} baris ALE referensi JournalEntry, lalu membuat ulang ${createCount.toLocaleString('id-ID')} baris dari ${jeTotal.toLocaleString('id-ID')} jurnal.`,
    warning: 'Operasi ini intensif (mungkin 1-2 menit) dan akan menulis ulang seluruh buku besar dari jurnal. Pastikan tidak ada transaksi berjalan.',
    count: deleteCount,
    details: [
      { action: 'Hapus ALE JournalEntry', jumlah: deleteCount },
      { action: 'Buat ulang dari JournalItem', jumlah: createCount },
      { action: 'Journal entries diproses', jumlah: jeTotal },
    ],
  };
}

async function previewAccountBalanceDrift(): Promise<{ description: string; count: number; details: unknown[] }> {
  const drifts = await prisma.$queryRaw<Array<{
    account_code: string;
    account_name: string;
    root_type: string;
    stored_balance: string;
    computed_balance: string;
    drift: string;
  }>>`
    WITH computed AS (
      SELECT jea.account_id,
             a."rootType" AS root_type,
             CASE
               WHEN a."rootType" IN ('ASSET','EXPENSE')
                 THEN SUM(jea.debit) - SUM(jea.credit)
               ELSE SUM(jea.credit) - SUM(jea.debit)
             END AS computed_balance
        FROM journal_entry_accounts jea
        JOIN journal_entries je ON je.id = jea.journal_entry_id
        JOIN accounts a ON a.id = jea.account_id
       WHERE je.status != 'Cancelled'
       GROUP BY jea.account_id, a."rootType"
    )
    SELECT a."accountNumber" AS account_code,
           a.name AS account_name,
           c.root_type,
           a.balance::text AS stored_balance,
           c.computed_balance::text AS computed_balance,
           ABS(a.balance - c.computed_balance)::text AS drift
      FROM computed c
      JOIN accounts a ON a.id = c.account_id
     WHERE ABS(a.balance - c.computed_balance) > 0.01
     ORDER BY ABS(a.balance - c.computed_balance) DESC
     LIMIT 50
  `;

  return {
    description: drifts.length === 0
      ? 'Tidak ada akun yang drift. Semua saldo sudah sesuai dengan jurnal. Klik "Perbaiki" hanya akan menghitung ulang tanpa mengubah nilai.'
      : `Akan MENGUBAH saldo ${drifts.length} akun berikut agar sesuai dengan hasil hitung dari jurnal:`,
    count: drifts.length,
    details: drifts,
  };
}

async function previewOrphanAle(): Promise<{ description: string; count: number; details: unknown[] }> {
  const orphans = await prisma.$queryRaw<Array<{
    ale_id: string;
    reference_type: string;
    reference_id: string;
    account_code: string;
    account_name: string;
    debit: string;
    credit: string;
  }>>`
    SELECT ale.id AS ale_id,
           ale.reference_type,
           ale.reference_id,
           a."accountNumber" AS account_code,
           a.name AS account_name,
           ale.debit::text,
           ale.credit::text
      FROM accounting_ledger_entries ale
      JOIN accounts a ON a.id = ale.account_id
     WHERE ale.is_cancelled = false
       AND (
         (ale.reference_type = 'JournalEntry'
           AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockMovement'
           AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.id = ale.reference_id))
         OR
         (ale.reference_type = 'StockOpname'
           AND NOT EXISTS (SELECT 1 FROM stock_opnames so WHERE so.id = ale.reference_id))
       )
     ORDER BY ale.reference_type
     LIMIT 100
  `;

  return {
    description: orphans.length === 0
      ? 'Tidak ada ALE orphan. Tidak ada yang akan berubah.'
      : `Akan MENANDAI ${orphans.length} entri ALE berikut sebagai cancelled (tidak dihapus):`,
    count: orphans.length,
    details: orphans,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// FIX FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fix ALE sync: delete all JournalEntry ALEs and recreate from JournalItems.
 */
async function fixAleSync(): Promise<{ fixed: number; message: string; snapshot: unknown }> {
  return await prisma.$transaction(async (tx) => {
    // Delete all JournalEntry ALE entries
    const deleted = await tx.accountingLedgerEntry.deleteMany({
      where: { referenceType: 'JournalEntry' },
    });

    // Recreate from JournalItems for all journal entries (Posted + Cancelled)
    const journalEntries = await tx.journalEntry.findMany({
      include: { items: true },
    });

    let created = 0;
    for (const je of journalEntries) {
      const isCancelled = je.status === 'Cancelled';
      for (const item of je.items) {
        await tx.accountingLedgerEntry.create({
          data: {
            date: je.date,
            accountId: item.accountId,
            partyId: item.partyId,
            debit: item.debit,
            credit: item.credit,
            referenceType: 'JournalEntry',
            referenceId: je.id,
            description: item.description || je.narration || '',
            fiscalYearId: je.fiscalYearId,
            isCancelled,
          },
        });
        created++;
      }
    }

    return {
      fixed: created,
      message: `Dihapus ${deleted.count} ALE lama, dibuat ${created} ALE baru dari JournalItem`,
      snapshot: {
        deletedCount: deleted.count,
        createdCount: created,
        journalEntriesProcessed: journalEntries.length,
      },
    };
  }, { timeout: 120000 });
}

/**
 * Fix account balance drift: recalculate all account balances from JournalItems.
 * Captures before/after snapshot of drifted accounts for audit.
 */
async function fixAccountBalanceDrift(): Promise<{ fixed: number; message: string; snapshot: unknown }> {
  return await prisma.$transaction(async (tx) => {
    // Capture drifted accounts BEFORE recalculation (rootType-aware formula)
    const beforeDrift = await tx.$queryRaw<Array<{
      account_code: string;
      account_name: string;
      root_type: string;
      stored_balance: string;
      computed_balance: string;
    }>>`
      WITH computed AS (
        SELECT jea.account_id,
               a."rootType" AS root_type,
               CASE
                 WHEN a."rootType" IN ('ASSET','EXPENSE')
                   THEN SUM(jea.debit) - SUM(jea.credit)
                 ELSE SUM(jea.credit) - SUM(jea.debit)
               END AS computed_balance
          FROM journal_entry_accounts jea
          JOIN journal_entries je ON je.id = jea.journal_entry_id
          JOIN accounts a ON a.id = jea.account_id
         WHERE je.status != 'Cancelled'
         GROUP BY jea.account_id, a."rootType"
      )
      SELECT a."accountNumber" AS account_code,
             a.name AS account_name,
             c.root_type,
             a.balance::text AS stored_balance,
             c.computed_balance::text AS computed_balance
        FROM computed c
        JOIN accounts a ON a.id = c.account_id
       WHERE ABS(a.balance - c.computed_balance) > 0.01
       ORDER BY ABS(a.balance - c.computed_balance) DESC
       LIMIT 50
    `;

    await recalculateAccountBalances(tx);
    const count = await tx.account.count();

    return {
      fixed: count,
      message: `Dihitung ulang saldo ${count} akun dari jurnal`,
      snapshot: {
        driftedAccountsBefore: beforeDrift,
        totalDrifted: beforeDrift.length,
        totalAccountsRecalc: count,
      },
    };
  }, { timeout: 60000 });
}

/**
 * Fix orphan ALE: mark orphan entries as cancelled.
 * Captures snapshot of affected entries for audit.
 */
async function fixOrphanAle(): Promise<{ fixed: number; message: string; snapshot: unknown }> {
  return await prisma.$transaction(async (tx) => {
    // Capture orphan entries BEFORE marking cancelled
    const orphansBefore = await tx.$queryRaw<Array<{
      ale_id: string;
      reference_type: string;
      reference_id: string;
      account_code: string;
      debit: string;
      credit: string;
    }>>`
      SELECT ale.id AS ale_id,
             ale.reference_type,
             ale.reference_id,
             a."accountNumber" AS account_code,
             ale.debit::text,
             ale.credit::text
        FROM accounting_ledger_entries ale
        JOIN accounts a ON a.id = ale.account_id
       WHERE ale.is_cancelled = false
         AND (
           (ale.reference_type = 'JournalEntry'
             AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = ale.reference_id))
           OR
           (ale.reference_type = 'StockMovement'
             AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.id = ale.reference_id))
           OR
           (ale.reference_type = 'StockOpname'
             AND NOT EXISTS (SELECT 1 FROM stock_opnames so WHERE so.id = ale.reference_id))
         )
       LIMIT 100
    `;

    const result = await tx.$executeRaw`
      UPDATE accounting_ledger_entries ale
         SET is_cancelled = true
       WHERE ale.is_cancelled = false
         AND (
           (ale.reference_type = 'JournalEntry'
             AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = ale.reference_id))
           OR
           (ale.reference_type = 'StockMovement'
             AND NOT EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.id = ale.reference_id))
           OR
           (ale.reference_type = 'StockOpname'
             AND NOT EXISTS (SELECT 1 FROM stock_opnames so WHERE so.id = ale.reference_id))
         )
    `;

    return {
      fixed: result,
      message: `${result} entri ALE orphan ditandai sebagai cancelled`,
      snapshot: { orphansAffected: orphansBefore, totalAffected: result },
    };
  }, { timeout: 60000 });
}

export default router;
