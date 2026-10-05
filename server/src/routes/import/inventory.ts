import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { updateBalancesForItems } from '../../utils/accountBalance';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { getOpenFiscalYear } from '../../utils/fiscalYear';
import { systemAccounts } from '../../services/systemAccounts';
import { logger } from '../../lib/logger';
import { calcWeightedAverage } from '../../utils/weightedAverage';
import { upload, parseFile, sanitizeCellValue } from './shared';

const router = Router();

// ─── POST /api/import/inventory ──────────────────────────────────────────────
router.post(
  '/inventory',
  upload.single('file'),
  async (req: AuthRequest, res) => {
    if (!req.file) return res.status(400).json({ error: 'File wajib diunggah.' });

    try {
      const rows = await parseFile(req.file.buffer, req.file.originalname);
      const isPreview = req.query.preview === 'true';
      const errors: Array<{ row: number; message: string }> = [];
      const validRows: Array<{
        code: string;
        name: string;
        unit: string;
        category?: string;
        description?: string;
        minimumStock?: number;
        openingQty: number;
        openingPrice: number;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;

        const code = (r.code || '').trim();
        const name = (r.name || '').trim();
        const unit = (r.unit || '').trim();

        if (!code) {
          errors.push({ row: rowNum, message: 'Kolom "code" wajib diisi.' });
          continue;
        }
        if (!name) {
          errors.push({ row: rowNum, message: 'Kolom "name" wajib diisi.' });
          continue;
        }
        if (!unit) {
          errors.push({ row: rowNum, message: 'Kolom "unit" wajib diisi.' });
          continue;
        }

        const minStockStr = (r.minimumStock || r.minimum_stock || '').trim();
        const minimumStock = minStockStr ? parseFloat(minStockStr) : undefined;
        if (minimumStock !== undefined && isNaN(minimumStock)) {
          errors.push({ row: rowNum, message: `minimumStock "${minStockStr}" bukan angka valid.` });
          continue;
        }

        const openingQtyStr = (r.openingQty || r.opening_qty || r.stokAwal || r.stok_awal || '').trim();
        const openingQty = openingQtyStr ? parseFloat(openingQtyStr) : 0;
        const openingPriceStr = (r.openingPrice || r.opening_price || r.openingValue || r.opening_value || r.hargaAwal || r.harga_awal || r.nilaiAwal || r.nilai_awal || '').trim();
        const openingPrice = openingPriceStr ? parseFloat(openingPriceStr) : 0;

        if (isNaN(openingQty)) {
          errors.push({ row: rowNum, message: `openingQty "${openingQtyStr}" bukan angka valid.` });
          continue;
        }
        if (isNaN(openingPrice)) {
          errors.push({ row: rowNum, message: `openingPrice "${openingPriceStr}" bukan angka valid.` });
          continue;
        }

        validRows.push({
          code: sanitizeCellValue(code),
          name: sanitizeCellValue(name),
          unit: sanitizeCellValue(unit),
          category: r.category?.trim() ? sanitizeCellValue(r.category) : undefined,
          description: r.description?.trim() ? sanitizeCellValue(r.description) : undefined,
          minimumStock,
          openingQty,
          openingPrice,
        });
      }

      if (isPreview) {
        return res.json({ data: validRows, errors, total: rows.length });
      }

      let success = 0;
      for (const row of validRows) {
        try {
          const { openingQty, openingPrice, ...itemData } = row;

          const item = await prisma.inventoryItem.upsert({
            where: { code: row.code },
            update: { name: itemData.name, unit: itemData.unit, category: itemData.category, description: itemData.description, minimumStock: itemData.minimumStock },
            create: itemData,
          });

          // Create opening stock movement if qty > 0
          if (openingQty > 0 && openingPrice > 0) {
            // Auto-detect if openingPrice is total value or unit price:
            // If openingPrice / qty yields a reasonable unit cost (< openingPrice itself),
            // and the raw total (qty * price) exceeds 18 digits, treat price as total value.
            const rawTotal = openingQty * openingPrice;
            const isLikelyTotalValue = rawTotal > 1e16;
            const unitCost = isLikelyTotalValue ? (openingPrice / openingQty) : openingPrice;
            const totalValue = isLikelyTotalValue ? openingPrice : rawTotal;

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
              const now = new Date();
              const fiscalYear = await getOpenFiscalYear(tx, now);
              const mvNumber = await generateDocumentNumber(tx, 'SM', now, fiscalYear.id);

              await tx.stockMovement.create({
                data: {
                  movementNumber: mvNumber,
                  itemId: item.id,
                  movementType: 'In',
                  quantity: openingQty,
                  unitCost: unitCost,
                  totalValue,
                  date: now,
                  referenceType: 'OpeningBalance',
                  notes: `Stok awal dari import: ${row.code} - ${row.name}`,
                  createdById: req.user!.userId,
                  fiscalYearId: fiscalYear.id,
                },
              });

              // Update currentStock and averageCost on inventory item
              const newAvgCost = calcWeightedAverage(item.currentStock, item.averageCost, openingQty, unitCost);
              await tx.inventoryItem.update({
                where: { id: item.id },
                data: {
                  currentStock: { increment: openingQty },
                  averageCost: newAvgCost,
                },
              });

              // GL: DR Inventory / CR Ekuitas Saldo Awal
              const invAccount = item.accountId
                ? await tx.account.findUnique({ where: { id: item.accountId } })
                : await systemAccounts.getAccount('INVENTORY');
              const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');

              if (invAccount) {
                const jvNumber = await generateDocumentNumber(tx, 'JV', now, fiscalYear.id);
                const journal = await tx.journalEntry.create({
                  data: {
                    entryNumber: jvNumber,
                    date: now,
                    narration: `Saldo awal stok: ${row.code} - ${row.name}`,
                    status: 'Submitted',
                    fiscalYearId: fiscalYear.id,
                    createdBy: req.user!.userId,
                    submittedAt: now,
                    items: {
                      create: [
                        { accountId: invAccount.id, debit: totalValue, credit: 0, description: `Saldo awal stok: ${row.code}` },
                        { accountId: openingEquity.id, debit: 0, credit: totalValue, description: `Saldo awal stok: ${row.code}` },
                      ],
                    },
                  },
                  include: { items: true },
                });

                await tx.accountingLedgerEntry.createMany({
                  data: journal.items.map((ji) => ({
                    date: now,
                    accountId: ji.accountId,
                    debit: ji.debit,
                    credit: ji.credit,
                    referenceType: 'JournalEntry' as const,
                    referenceId: journal.id,
                    description: ji.description || `Saldo awal stok: ${row.code}`,
                    fiscalYearId: fiscalYear.id,
                  })),
                });

                await updateBalancesForItems(
                  tx,
                  journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) }))
                );
              }
            }, { timeout: 15000 });
          }

          success++;
        } catch (err: any) {
          const msg = err.code === 'P2002'
            ? `Kode "${row.code}" sudah digunakan.`
            : err.message;
          errors.push({ row: 0, message: `Gagal insert "${row.code}": ${msg}` });
        }
      }

      return res.json({ success, failed: rows.length - success, errors });
    } catch (error: any) {
      logger.error({ error }, 'POST /import/inventory error');
      return res.status(400).json({ error: error.message || 'Gagal memproses file.' });
    }
  }
);

export default router;
