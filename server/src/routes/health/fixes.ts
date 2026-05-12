// Preview + fix functions for /api/health-check/preview/:check and /fix/:check.
// Three "auto-fixable" issues: ALE sync, account balance drift, orphan ALE.
import { prisma } from '../../lib/prisma';
import { recalculateAccountBalances } from '../../utils/accountBalance';

export async function previewAleSync(): Promise<{ description: string; count: number; details: unknown[]; warning?: string }> {
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

export async function previewAccountBalanceDrift(): Promise<{ description: string; count: number; details: unknown[] }> {
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

export async function previewOrphanAle(): Promise<{ description: string; count: number; details: unknown[] }> {
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
export async function fixAleSync(): Promise<{ fixed: number; message: string; snapshot: unknown }> {
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
export async function fixAccountBalanceDrift(): Promise<{ fixed: number; message: string; snapshot: unknown }> {
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
export async function fixOrphanAle(): Promise<{ fixed: number; message: string; snapshot: unknown }> {
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
