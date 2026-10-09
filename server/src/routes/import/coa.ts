import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { computeImpact, updateBalancesForItems } from '../../utils/accountBalance';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { getOpenFiscalYear } from '../../utils/fiscalYear';
import { systemAccounts } from '../../services/systemAccounts';
import { logger } from '../../lib/logger';
import { upload, parseFile, sanitizeCellValue } from './shared';

const router = Router();

// POST /api/import/coa
router.post(
  '/coa',
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = await parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];
      const validTypes = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

      interface COARow {
        accountNumber: string;
        name: string;
        rootType: string;
        accountType: string;
        parentNumber?: string;
        isGroup: boolean;
        openingBalance: number;
      }

      const validRows: COARow[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const accountNumber = (r.accountNumber || r.account_number || '').trim();
        const name = (r.name || '').trim();
        const rootType = (r.rootType || r.root_type || '').trim().toUpperCase();
        const accountType = (r.accountType || r.account_type || rootType).trim().toUpperCase();
        const parentNumber = (r.parentNumber || r.parent_number || '').trim();
        const isGroupStr = (r.isGroup || r.is_group || '').toString().trim().toLowerCase();
        const isGroup = ['true', '1', 'yes', 'ya'].includes(isGroupStr);
        const openingBalanceStr = (r.openingBalance || r.opening_balance || r.outstandingAmount || r.outstanding_amount || r.saldoAwal || r.saldo_awal || r.piutang || r.hutang || r.balance || '').toString().trim();
        const openingBalance = openingBalanceStr ? parseFloat(openingBalanceStr) : 0;

        if (!accountNumber) {
          errors.push({ row: rowNum, message: 'Kolom "accountNumber" wajib diisi.' });
          continue;
        }
        if (!name) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }
        if (!validTypes.includes(rootType)) {
          errors.push({ row: rowNum, message: `rootType "${rootType}" tidak valid.` });
          continue;
        }
        if (isNaN(openingBalance)) {
          errors.push({ row: rowNum, message: `openingBalance "${openingBalanceStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          accountNumber,
          name: sanitizeCellValue(name),
          rootType,
          accountType,
          parentNumber,
          isGroup,
          openingBalance,
        });
      }

      // Auto-detect isGroup: any account that is a parent of another should be a group
      for (const row of validRows) {
        const parts = row.accountNumber.split('.');
        // Mark all ancestor numbers as groups
        for (let depth = 1; depth < parts.length; depth++) {
          const ancestor = parts.slice(0, depth).join('.');
          const ancestorRow = validRows.find((r) => r.accountNumber === ancestor);
          if (ancestorRow) ancestorRow.isGroup = true;
        }
      }

      // Sort by account number depth so parents are inserted before children
      validRows.sort((a, b) => {
        const depthA = a.accountNumber.split('.').length;
        const depthB = b.accountNumber.split('.').length;
        if (depthA !== depthB) return depthA - depthB;
        return a.accountNumber.localeCompare(b.accountNumber, undefined, { numeric: true });
      });

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      // Insert valid rows — resolve parent by accountNumber
      let success = 0;
      for (const row of validRows) {
        try {
          // Auto-derive parentNumber from accountNumber if not provided
          // e.g. "1.4.5" → parent "1.4", "1.4" → parent "1", "1" → no parent
          let effectiveParentNumber = row.parentNumber;
          if (!effectiveParentNumber) {
            const parts = row.accountNumber.split('.');
            if (parts.length > 1) {
              effectiveParentNumber = parts.slice(0, -1).join('.');
            }
          }

          let parentId: string | null = null;
          if (effectiveParentNumber) {
            const parent = await prisma.account.findUnique({
              where: { accountNumber: effectiveParentNumber },
              select: { id: true },
            });
            if (parent) parentId = parent.id;
          }

          const upsertData = {
            name: row.name,
            rootType: row.rootType as any,
            accountType: row.accountType as any,
            parentId,
            isGroup: row.isGroup,
          };

          const account = await prisma.account.upsert({
            where: { accountNumber: row.accountNumber },
            update: upsertData,
            create: { accountNumber: row.accountNumber, ...upsertData },
          });

          // Create opening balance GL journal for non-group accounts with balance
          if (row.openingBalance !== 0 && !row.isGroup) {
            const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
            if (account.id !== openingEquity.id) {
              const now = new Date();
              const fiscalYear = await getOpenFiscalYear(prisma as any, now);
              const absAmount = Math.abs(row.openingBalance);

              // ASSET/EXPENSE normal balance = debit, LIABILITY/EQUITY/REVENUE normal balance = credit
              const isDebitNormal = ['ASSET', 'EXPENSE'].includes(row.rootType);
              const isPositive = row.openingBalance > 0;

              // Positive balance on debit-normal account → DR account / CR retained
              // Positive balance on credit-normal account → CR account / DR retained
              const accountDebit = (isDebitNormal === isPositive) ? absAmount : 0;
              const accountCredit = (isDebitNormal === isPositive) ? 0 : absAmount;

              await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // Delete existing opening balance journals for this account to prevent duplicates on re-import
                const existingJournals = await tx.journalEntry.findMany({
                  where: {
                    narration: { startsWith: `Saldo awal akun: ${row.accountNumber}` },
                    status: 'Submitted',
                  },
                  select: { id: true, items: { select: { accountId: true, debit: true, credit: true } } },
                });
                for (const ej of existingJournals) {
                  // Reverse the balance impact of old entries
                  for (const item of ej.items) {
                    const acc = await tx.account.findUnique({ where: { id: item.accountId }, select: { rootType: true } });
                    if (acc) {
                      const reverseImpact = computeImpact(acc.rootType, item.debit, item.credit);
                      await tx.account.update({ where: { id: item.accountId }, data: { balance: { decrement: reverseImpact } } });
                    }
                  }
                  await tx.accountingLedgerEntry.deleteMany({ where: { referenceId: ej.id } });
                  await tx.journalItem.deleteMany({ where: { journalEntryId: ej.id } });
                  await tx.journalEntry.delete({ where: { id: ej.id } });
                }

                const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);
                const journal = await tx.journalEntry.create({
                  data: {
                    entryNumber: jvNumber,
                    date: now,
                    narration: `Saldo awal akun: ${row.accountNumber} - ${row.name}`,
                    status: 'Submitted',
                    fiscalYearId: fiscalYear.id,
                    createdBy: req.user!.userId,
                    submittedAt: now,
                    items: {
                      create: [
                        { accountId: account.id, debit: accountDebit, credit: accountCredit, description: `Saldo awal: ${row.accountNumber} - ${row.name}` },
                        { accountId: openingEquity.id, debit: accountCredit, credit: accountDebit, description: `Saldo awal: ${row.accountNumber} - ${row.name}` },
                      ],
                    },
                  },
                  include: { items: true },
                });

                await tx.accountingLedgerEntry.createMany({
                  data: journal.items.map((item: any) => ({
                    date: now,
                    accountId: item.accountId,
                    debit: item.debit,
                    credit: item.credit,
                    referenceType: 'JournalEntry' as const,
                    referenceId: journal.id,
                    description: item.description || `Saldo awal: ${row.accountNumber}`,
                    fiscalYearId: fiscalYear.id,
                  })),
                });

                await updateBalancesForItems(
                  tx,
                  journal.items.map((i: any) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                );
              }, { timeout: 15000 });
            }
          }

          success++;
        } catch (err: any) {
          errors.push({ row: 0, message: `Gagal insert akun "${row.accountNumber}": ${err.message}` });
        }
      }

      return res.json({ success, failed: rows.length - success, errors });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/coa error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

export default router;
