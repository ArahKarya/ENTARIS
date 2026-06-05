import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { validateBody } from '../utils/validate';
import { CreateFiscalYearSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/fiscal-years
router.get('/', async (req, res) => {
  try {
    const years = await prisma.fiscalYear.findMany({ orderBy: { startDate: 'desc' } });
    return res.json(years);
  } catch (error) {
    logger.error({ error }, 'GET /fiscal-years error');
    return res.status(500).json({ error: 'Gagal mengambil data tahun fiskal.' });
  }
});

// POST /api/fiscal-years (Admin only)
router.post('/', async (req, res) => {
  const body = validateBody(CreateFiscalYearSchema, req.body, res);
  if (!body) return;

  const start = new Date(body.startDate);
  const end = new Date(body.endDate);

  if (start >= end) {
    return res.status(400).json({ error: 'Tanggal mulai harus sebelum tanggal akhir.' });
  }

  try {
    const overlapping = await prisma.fiscalYear.findFirst({
      where: { OR: [{ startDate: { lte: end }, endDate: { gte: start } }] },
    });

    if (overlapping) {
      return res.status(409).json({
        error: `Tahun fiskal bertumpang tindih dengan "${overlapping.name}". Periksa rentang tanggal.`,
      });
    }

    const year = await prisma.fiscalYear.create({
      data: { name: body.name, startDate: start, endDate: end, isClosed: false },
    });
    return res.status(201).json(year);
  } catch (error: any) {
    logger.error({ error }, 'POST /fiscal-years error');
    if (error.code === 'P2002') return res.status(409).json({ error: 'Nama tahun fiskal sudah digunakan.' });
    return res.status(500).json({ error: 'Gagal membuat tahun fiskal.' });
  }
});

// POST /api/fiscal-years/:id/close — close fiscal year (Admin only)
router.post('/:id/close', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const year = await tx.fiscalYear.findUnique({ where: { id } });
      if (!year) throw new BusinessError('Tahun buku tidak ditemukan.');
      if (year.isClosed) throw new BusinessError('Tahun buku sudah ditutup.');

      // 1. Calculate net profit for the year
      const [revAgg, expAgg] = await Promise.all([
        tx.accountingLedgerEntry.aggregate({
          where: { fiscalYearId: id, isCancelled: false, account: { rootType: 'REVENUE' as any } },
          _sum: { debit: true, credit: true },
        }),
        tx.accountingLedgerEntry.aggregate({
          where: { fiscalYearId: id, isCancelled: false, account: { rootType: 'EXPENSE' as any } },
          _sum: { debit: true, credit: true },
        }),
      ]);

      const netRevenue = Number(revAgg._sum?.credit || 0) - Number(revAgg._sum?.debit || 0);
      const netExpense = Number(expAgg._sum?.debit || 0) - Number(expAgg._sum?.credit || 0);
      const profit = netRevenue - netExpense;

      const retainedEarningsAcc = await systemAccounts.getAccount('RETAINED_EARNINGS');
      const currentProfitAcc = await systemAccounts.getAccount('CURRENT_PROFIT');

      if (profit !== 0) {
        // 2. Transfer profit/loss to Retained Earnings
        const closeEntry = await tx.journalEntry.create({
          data: {
            entryNumber: `CLOSE-${year.name}`,
            date: year.endDate,
            narration: `Tutup Buku Tahun ${year.name}`,
            status: 'Submitted',
            fiscalYearId: id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                {
                  accountId: currentProfitAcc.id,
                  debit: profit > 0 ? profit : 0,
                  credit: profit < 0 ? Math.abs(profit) : 0,
                  description: `Tutup akun laba tahun berjalan ${year.name}`,
                },
                {
                  accountId: retainedEarningsAcc.id,
                  debit: profit < 0 ? Math.abs(profit) : 0,
                  credit: profit > 0 ? profit : 0,
                  description: `Transfer ke laba ditahan ${year.name}`,
                },
              ],
            },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            {
              date: year.endDate,
              accountId: currentProfitAcc.id,
              debit: profit > 0 ? profit : 0,
              credit: profit < 0 ? Math.abs(profit) : 0,
              referenceType: 'JournalEntry',
              referenceId: closeEntry.id,
              description: `Tutup buku ${year.name}`,
              fiscalYearId: id,
            },
            {
              date: year.endDate,
              accountId: retainedEarningsAcc.id,
              debit: profit < 0 ? Math.abs(profit) : 0,
              credit: profit > 0 ? profit : 0,
              referenceType: 'JournalEntry',
              referenceId: closeEntry.id,
              description: `Laba ditahan ${year.name}`,
              fiscalYearId: id,
            },
          ],
        });

        await updateAccountBalance(tx, currentProfitAcc.id, profit > 0 ? profit : 0, profit < 0 ? Math.abs(profit) : 0);
        await updateAccountBalance(tx, retainedEarningsAcc.id, profit < 0 ? Math.abs(profit) : 0, profit > 0 ? profit : 0);
      }

      // 3. Decrement Revenue/Expense balances by only this FY's contribution
      const fyAccountSums = await tx.accountingLedgerEntry.groupBy({
        by: ['accountId'],
        where: {
          fiscalYearId: id,
          isCancelled: false,
          account: { OR: [{ rootType: 'REVENUE' as any }, { rootType: 'EXPENSE' as any }] },
        },
        _sum: { debit: true, credit: true },
      });

      const fyAccounts = await tx.account.findMany({
        where: { id: { in: fyAccountSums.map((e) => e.accountId) } },
        select: { id: true, rootType: true },
      });
      const fyAccountMap = new Map(fyAccounts.map((a) => [a.id, a]));

      for (const entry of fyAccountSums) {
        const acct = fyAccountMap.get(entry.accountId);
        if (!acct) continue;
        const debit = Number(entry._sum.debit || 0);
        const credit = Number(entry._sum.credit || 0);
        // Reverse the impact this FY contributed to the running balance
        const impact = acct.rootType === 'ASSET' || acct.rootType === 'EXPENSE'
          ? debit - credit
          : credit - debit;
        if (impact !== 0) {
          await tx.account.update({
            where: { id: entry.accountId },
            data: { balance: { decrement: impact } },
          });
        }
      }

      // 4. Mark fiscal year as closed
      return tx.fiscalYear.update({
        where: { id },
        data: { isClosed: true, closedAt: new Date(), closedBy: req.user!.userId },
      });
    }, { timeout: 30000 }); // heavy transaction: 30s timeout

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /fiscal-years/:id/close', 'Gagal menutup tahun buku.');
  }
});

// POST /api/fiscal-years/:id/reopen — reopen a closed fiscal year (Admin only)
router.post('/:id/reopen', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  const fyId = req.params.id as string;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const year = await tx.fiscalYear.findUnique({ where: { id: fyId } });
      if (!year) throw new BusinessError('Tahun buku tidak ditemukan.');
      if (!year.isClosed) throw new BusinessError('Tahun buku belum ditutup.');

      // 1. Find and reverse the closing journal entry (CLOSE-{name})
      const closeEntryNumber = `CLOSE-${year.name}`;
      const closeEntry = await tx.journalEntry.findFirst({
        where: { entryNumber: closeEntryNumber, fiscalYearId: fyId },
        include: { items: true },
      });

      if (closeEntry) {
        // Reverse GL ledger entries created by the closing
        const closeLedgerEntries = await tx.accountingLedgerEntry.findMany({
          where: { referenceType: 'JournalEntry', referenceId: closeEntry.id, fiscalYearId: fyId },
        });

        for (const entry of closeLedgerEntries) {
          // Reverse the balance impact
          await updateAccountBalance(tx, entry.accountId, Number(entry.credit), Number(entry.debit));
        }

        // Delete the closing ledger entries
        await tx.accountingLedgerEntry.deleteMany({
          where: { referenceType: 'JournalEntry', referenceId: closeEntry.id, fiscalYearId: fyId },
        });

        // Delete the closing journal entry (items cascade via onDelete: Cascade)
        await tx.journalEntry.delete({ where: { id: closeEntry.id } });
      }

      // 2. Restore Revenue/Expense account balances
      const fyAccountSums = await tx.accountingLedgerEntry.groupBy({
        by: ['accountId'],
        where: {
          fiscalYearId: fyId,
          isCancelled: false,
          account: { OR: [{ rootType: 'REVENUE' as any }, { rootType: 'EXPENSE' as any }] },
        },
        _sum: { debit: true, credit: true },
      });

      const fyAccounts = await tx.account.findMany({
        where: { id: { in: fyAccountSums.map((e) => e.accountId) } },
        select: { id: true, rootType: true },
      });
      const fyAccountMap = new Map(fyAccounts.map((a) => [a.id, a]));

      for (const entry of fyAccountSums) {
        const acct = fyAccountMap.get(entry.accountId);
        if (!acct) continue;
        const debit = Number(entry._sum.debit || 0);
        const credit = Number(entry._sum.credit || 0);
        // Re-add the impact that was decremented during closing
        const impact = acct.rootType === 'ASSET' || acct.rootType === 'EXPENSE'
          ? debit - credit
          : credit - debit;
        if (impact !== 0) {
          await tx.account.update({
            where: { id: entry.accountId },
            data: { balance: { increment: impact } },
          });
        }
      }

      // 3. Mark fiscal year as open
      return tx.fiscalYear.update({
        where: { id: fyId },
        data: { isClosed: false, closedAt: null, closedBy: null },
      });
    }, { timeout: 30000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /fiscal-years/:id/reopen', 'Gagal membuka kembali tahun buku.');
  }
});

export default router;
