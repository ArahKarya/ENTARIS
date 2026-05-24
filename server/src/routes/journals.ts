import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateBalancesForItems } from '../utils/accountBalance';
import { applyPartyImpact } from '../utils/partyBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateJournalSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/journals — list all journal entries
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', startDate, endDate, search, hideCancelled } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Math.max(1, Number(page)) - 1) * take;

    const where: Prisma.JournalEntryWhereInput = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as any).gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        (where.date as any).lte = end;
      }
    }
    // Server-side search supaya pagination tetap konsisten (kalau client-side
    // filter, halaman lain bisa miss match). Match di:
    //   - JE header: entryNumber, narration
    //   - Line items: account name / accountNumber, line description
    // Bug fix 2026-05-24: dulu hanya match header → user search "piutang
    // karyawan" miss JV yg narration-nya "Kasbon Karyawan" meskipun ada
    // baris ke akun 1.2.2 Piutang Karyawan.
    if (typeof search === 'string' && search.trim().length > 0) {
      const q = search.trim();
      where.OR = [
        { entryNumber: { contains: q, mode: 'insensitive' } },
        { narration: { contains: q, mode: 'insensitive' } },
        { items: { some: { description: { contains: q, mode: 'insensitive' } } } },
        { items: { some: { account: { name: { contains: q, mode: 'insensitive' } } } } },
        { items: { some: { account: { accountNumber: { contains: q, mode: 'insensitive' } } } } },
      ];
    }
    if (hideCancelled === 'true') {
      where.status = { not: 'Cancelled' };
    }

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          items: { include: { account: { select: { accountNumber: true, name: true } } } },
          user: { select: { fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return res.json({ data: entries, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /journals error');
    return res.status(500).json({ error: 'Gagal mengambil data jurnal.' });
  }
});

// POST /api/journals — create journal entry
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateJournalSchema, req.body, res);
  if (!body) return;

  // Validate: each line must have either debit OR credit, not both
  for (const item of body.items) {
    if ((item.debit || 0) > 0 && (item.credit || 0) > 0) {
      return res.status(400).json({
        error: 'Satu baris jurnal tidak boleh memiliki debit dan kredit sekaligus.',
      });
    }
  }

  const totalDebit = body.items.reduce((s, i) => s + (i.debit || 0), 0);
  const totalCredit = body.items.reduce((s, i) => s + (i.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return res.status(400).json({
      error: `Jurnal tidak seimbang. Total Debit (${totalDebit}) ≠ Total Kredit (${totalCredit}).`,
    });
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
      const entryNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: parsedDate,
          narration: body.narration,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: body.items.map((item) => ({
              accountId: item.accountId,
              partyId: item.partyId || null,
              debit: item.debit || 0,
              credit: item.credit || 0,
              description: item.description || body.narration,
            })),
          },
        },
        include: {
          items: {
            include: { account: { select: { accountNumber: true, rootType: true } } },
          },
        },
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
          description: item.description || body.narration,
          fiscalYearId: fiscalYear.id,
        })),
      });

      // Update account balances with correct direction
      await updateBalancesForItems(
        tx,
        journalEntry.items.map((i) => ({
          accountId: i.accountId,
          debit: i.debit,
          credit: i.credit,
        })),
      );

      // Update party denorm balances — account-aware so UM (2.1.2/1.3) lines
      // hit customerDepositBalance/depositBalance instead of outstandingAmount.
      await applyPartyImpact(
        tx,
        journalEntry.items.map((i) => ({
          partyId: i.partyId,
          debit: Number(i.debit),
          credit: Number(i.credit),
          accountNumber: i.account.accountNumber,
          rootType: i.account.rootType,
        })),
        'apply',
      );

      return journalEntry;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /journals', 'Gagal menyimpan jurnal.');
  }
});

// GET /api/journals/:id — get single journal entry
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        items: { include: { account: { select: { id: true, accountNumber: true, name: true, rootType: true } } } },
        user: { select: { fullName: true } },
      },
    });
    if (!entry) return res.status(404).json({ error: 'Jurnal tidak ditemukan.' });
    return res.json(entry);
  } catch (error) {
    logger.error({ error }, 'GET /journals/:id error');
    return res.status(500).json({ error: 'Gagal mengambil data jurnal.' });
  }
});

// PATCH /api/journals/:id/cancel — cancel a journal entry and reverse balances
router.patch('/:id/cancel', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        items: {
          include: { account: { select: { accountNumber: true, rootType: true } } },
        },
        payment: { select: { id: true } },
      },
    });

    if (!entry) return res.status(404).json({ error: 'Jurnal tidak ditemukan.' });
    if (entry.status === 'Cancelled') return res.status(400).json({ error: 'Jurnal sudah dibatalkan.' });
    if (entry.payment) return res.status(400).json({ error: 'Jurnal ini terkait pembayaran. Batalkan dari modul Pembayaran.' });

    // Safety net: block cancel for any journal auto-generated from a source document.
    // Pola entryNumber: JV-PAY-* (pembayaran), JV-SI-* (faktur penjualan),
    // JV-PI-* (faktur pembelian), JV-COGS-* (HPP otomatis).
    if (/^JV-(PAY|SI|PI|COGS)/.test(entry.entryNumber)) {
      return res.status(400).json({
        error:
          'Jurnal ini dibuat otomatis dari transaksi sumber (Pembayaran/Faktur/HPP). Batalkan dari modul asalnya, bukan dari Buku Besar.',
      });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Reverse account balances (swap debit↔credit to undo)
      await updateBalancesForItems(
        tx,
        entry.items.map((i) => ({
          accountId: i.accountId,
          debit: i.credit,
          credit: i.debit,
        })),
      );

      // Reverse party denorm balances — symmetric with POST classification.
      await applyPartyImpact(
        tx,
        entry.items.map((i) => ({
          partyId: i.partyId,
          debit: Number(i.debit),
          credit: Number(i.credit),
          accountNumber: i.account.accountNumber,
          rootType: i.account.rootType,
        })),
        'reverse',
      );

      // Undo refund/offset side-effects created by customerDeposits.ts.
      // Offset JVs: linked customer_deposit_applications → mark cancelled and
      // restore the sales invoice outstanding + status.
      const offsetApps = await tx.customerDepositApplication.findMany({
        where: { journalEntryId: entry.id, isCancelled: false },
      });
      for (const app of offsetApps) {
        await tx.customerDepositApplication.update({
          where: { id: app.id },
          data: { isCancelled: true, cancelledAt: new Date() },
        });
        const inv = await tx.salesInvoice.findUnique({ where: { id: app.salesInvoiceId } });
        if (inv) {
          const restored = new Decimal(inv.outstanding.toString())
            .plus(app.appliedAmount.toString());
          const grandTotal = new Decimal(inv.grandTotal.toString());
          const newStatus = restored.greaterThanOrEqualTo(grandTotal) ? 'Submitted' : 'PartiallyPaid';
          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: { outstanding: restored, status: newStatus },
          });
        }
      }

      // Refund JVs: narration pattern "Refund UM Pelanggan: {paymentNumber} - ...".
      // Roll back payment.refundedAmount by the DR amount on the 2.1.2 line.
      const refundMatch = entry.narration?.match(/^Refund UM Pelanggan:\s*(\S+)/);
      if (refundMatch) {
        const paymentNumber = refundMatch[1];
        const depositLine = entry.items.find(
          (i) => i.account.accountNumber === '2.1.2' && Number(i.debit) > 0,
        );
        if (depositLine) {
          await tx.payment.updateMany({
            where: { paymentNumber },
            data: { refundedAmount: { decrement: Number(depositLine.debit) } },
          });
        }
      }

      // Mark cancelled
      await tx.journalEntry.update({
        where: { id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });

      // Soft-cancel the original ALE rows (consistent with how
      // payment/sales-invoice/purchase-invoice cancel handlers work).
      // Previously this code path created additional [BATAL] reversal
      // entries while leaving originals active, which doubled raw DR/CR
      // totals on ALE vs JournalItem (parent JE is now status=Cancelled
      // so JI rows are implicitly excluded from sums) and tripped the
      // health check 'ALE vs JournalItem Sync'.
      await tx.accountingLedgerEntry.updateMany({
        where: { referenceId: entry.id, isCancelled: false },
        data: { isCancelled: true },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Jurnal berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PATCH /journals/:id/cancel', 'Gagal membatalkan jurnal.');
  }
});

export default router;
