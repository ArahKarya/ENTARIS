import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { updateBalancesForItems } from '../../utils/accountBalance';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { getOpenFiscalYear } from '../../utils/fiscalYear';
import { logger } from '../../lib/logger';
import { upload, parseFile, sanitizeCellValue } from './shared';

const router = Router();

// POST /api/import/journals
router.post(
  '/journals',
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = await parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];

      // Group rows by date+narration into journal entries
      const groups = new Map<string, Array<{ accountNumber: string; debit: number; credit: number; description?: string; rowNum: number }>>();

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const date = (r.date || '').trim();
        const narration = sanitizeCellValue(r.narration);
        const accountNumber = (r.accountNumber || r.account_number || '').trim();
        const debit = parseFloat(r.debit || '0') || 0;
        const credit = parseFloat(r.credit || '0') || 0;
        const description = sanitizeCellValue(r.description);

        if (!date) { errors.push({ row: rowNum, message: 'Kolom "date" wajib diisi.' }); continue; }
        if (!narration) { errors.push({ row: rowNum, message: 'Kolom "narration" wajib diisi.' }); continue; }
        if (!accountNumber) { errors.push({ row: rowNum, message: 'Kolom "accountNumber" wajib diisi.' }); continue; }
        if (debit === 0 && credit === 0) { errors.push({ row: rowNum, message: 'Debit atau credit harus diisi.' }); continue; }

        const key = `${date}||${narration}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push({ accountNumber, debit, credit, description, rowNum });
      }

      // Validate balance per group
      const validGroups: Array<{ date: string; narration: string; items: typeof groups extends Map<string, infer V> ? V : never }> = [];
      for (const [key, items] of groups) {
        const separatorIndex = key.indexOf('||');
        const date = key.substring(0, separatorIndex);
        const narration = key.substring(separatorIndex + 2);
        const totalDebit = items.reduce((s, i) => s + i.debit, 0);
        const totalCredit = items.reduce((s, i) => s + i.credit, 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          for (const item of items) {
            errors.push({ row: item.rowNum, message: `Jurnal "${narration}" tidak seimbang: Debit=${totalDebit}, Credit=${totalCredit}` });
          }
          continue;
        }

        validGroups.push({ date, narration, items });
      }

      if (isPreview) {
        return res.json({
          data: validGroups.map((g) => ({
            date: g.date,
            narration: g.narration,
            items: g.items.map((i) => ({ accountNumber: i.accountNumber, debit: i.debit, credit: i.credit, description: i.description })),
          })),
          errors,
          total: rows.length,
          journalCount: validGroups.length,
        });
      }

      // Create journal entries
      let success = 0;
      const userId = req.user!.userId;

      for (const group of validGroups) {
        try {
          await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const parsedDate = new Date(group.date);
            if (isNaN(parsedDate.getTime())) throw new Error(`Tanggal "${group.date}" tidak valid.`);

            const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
            const entryNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);

            // Resolve account numbers to IDs
            const itemsWithIds = [];
            for (const item of group.items) {
              const account = await tx.account.findUnique({
                where: { accountNumber: item.accountNumber },
                select: { id: true },
              });
              if (!account) throw new Error(`Akun "${item.accountNumber}" tidak ditemukan.`);
              itemsWithIds.push({
                accountId: account.id,
                debit: item.debit,
                credit: item.credit,
                description: item.description || group.narration,
              });
            }

            const journalEntry = await tx.journalEntry.create({
              data: {
                entryNumber,
                date: parsedDate,
                narration: group.narration,
                status: 'Submitted',
                fiscalYearId: fiscalYear.id,
                createdBy: userId,
                submittedAt: new Date(),
                items: { create: itemsWithIds },
              },
              include: { items: true },
            });

            // Post to immutable ledger
            await tx.accountingLedgerEntry.createMany({
              data: journalEntry.items.map((item) => ({
                date: parsedDate,
                accountId: item.accountId,
                partyId: item.partyId,
                debit: item.debit,
                credit: item.credit,
                referenceType: 'JournalEntry',
                referenceId: journalEntry.id,
                description: item.description || group.narration,
                fiscalYearId: fiscalYear.id,
              })),
            });

            await updateBalancesForItems(
              tx,
              journalEntry.items.map((i) => ({
                accountId: i.accountId,
                debit: i.debit,
                credit: i.credit,
              })),
            );
          }, { timeout: 15000 });

          success++;
        } catch (err: any) {
          errors.push({ row: 0, message: `Gagal import jurnal "${group.narration}": ${err.message}` });
        }
      }

      return res.json({
        success,
        failed: validGroups.length - success,
        errors,
        totalJournals: validGroups.length,
      });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/journals error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

export default router;
