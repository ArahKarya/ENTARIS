import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { validateBody } from '../utils/validate';
import { CreatePaymentSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { logger } from '../lib/logger';
import { systemAccounts } from '../services/systemAccounts';
import { submitPaymentInTx } from '../services/paymentSubmit';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildCashLedgerFilter,
  CASH_LEDGER_SORT_FIELDS,
  DEFAULT_CASH_LEDGER_SORT,
  listCashLedger,
  summarizeCashLedgerQuery,
} from '../services/paymentList';

const router = Router();

// GET /api/payments
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: { party: true, splits: { include: { account: true } } },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.payment.count(),
    ]);

    return res.json({ data: payments, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /payments error');
    return res.status(500).json({ error: 'Gagal mengambil data pembayaran.' });
  }
});

// GET /api/payments/cash-journals — journal entries affecting cash/bank accounts (not already linked to payments)
router.get('/cash-journals', async (_req, res) => {
  try {
    // Find journal items that touch cash accounts (1.1.x) and aren't linked to payments
    const cashItems = await prisma.journalItem.findMany({
      where: {
        account: { accountNumber: { startsWith: '1.1' }, isGroup: false },
        journalEntry: {
          status: { not: 'Cancelled' },
          // Exclude journals linked to payments (they start with JV-PAY)
          entryNumber: { not: { startsWith: 'JV-PAY' } },
        },
      },
      include: {
        journalEntry: true,
        account: true,
      },
      orderBy: { journalEntry: { date: 'desc' } },
      take: 100,
    });

    // Resolve party names for items with partyId
    const partyIds = [...new Set(cashItems.map((i) => i.partyId).filter((id): id is string => id != null))];
    const parties = partyIds.length > 0
      ? await prisma.party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } })
      : [];
    const partyMap = new Map(parties.map((p) => [p.id, p.name]));

    const data = cashItems.map((item) => ({
      id: item.id,
      journalEntryId: item.journalEntryId,
      date: item.journalEntry.date,
      entryNumber: item.journalEntry.entryNumber,
      narration: item.journalEntry.narration,
      partyName: item.partyId ? partyMap.get(item.partyId) ?? null : null,
      amount: Number(item.credit) > 0 ? Number(item.credit) : Number(item.debit),
      isCredit: Number(item.credit) > 0,
      status: item.journalEntry.status,
    }));

    return res.json({ data });
  } catch (error) {
    logger.error({ error }, 'GET /payments/cash-journals error');
    return res.status(500).json({ error: 'Gagal mengambil data jurnal kas.' });
  }
});

// GET /api/payments/ledger — "Transaksi Kas & Bank" list: payments and
// cash-affecting journal lines as one server-paginated list (see
// services/paymentList). Query: page, limit (≤500), search, type, direction,
// status, partyId, accountId, startDate, endDate (YYYY-MM-DD),
// sort (date | number | party | amount, "-" = descending).
// → { data, total, page, limit }. GET / and /cash-journals stay unchanged.
router.get('/ledger', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 500 });
    const parsed = buildCashLedgerFilter(query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const sort = parseSort(query.sort, CASH_LEDGER_SORT_FIELDS, DEFAULT_CASH_LEDGER_SORT);
    const { rows, total } = await listCashLedger(prisma, parsed.filter, sort, { skip, take });
    return res.json({ data: rows, total, page, limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /payments/ledger error');
    return res.status(500).json({ error: 'Gagal mengambil data transaksi kas & bank.' });
  }
});

// GET /api/payments/ledger/summary — KPI totals (count, money in/out, net) for
// the same filters as /ledger. Declared before /:id.
router.get('/ledger/summary', async (req, res) => {
  try {
    const parsed = buildCashLedgerFilter(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    return res.json(await summarizeCashLedgerQuery(prisma, parsed.filter));
  } catch (error) {
    logger.error({ error }, 'GET /payments/ledger/summary error');
    return res.status(500).json({ error: 'Gagal menghitung ringkasan transaksi kas & bank.' });
  }
});

// GET /api/payments/:id — payment detail
router.get('/:id', async (req, res) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id as string },
      include: {
        party: true,
        account: true,
        splits: { include: { account: true } },
        allocations: true,
        journalEntry: {
          include: { items: { include: { account: true } } },
        },
      },
    });
    if (!payment) return res.status(404).json({ error: 'Pembayaran tidak ditemukan.' });
    return res.json(payment);
  } catch (error) {
    logger.error({ error }, 'GET /payments/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail pembayaran.' });
  }
});

// POST /api/payments — record payment/receipt
// POST /api/payments — record payment/receipt. All 6 paymentType branches
// + auto-allocate live in services/paymentSubmit.ts.
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreatePaymentSchema, req.body, res);
  if (!body) return;

  try {
    const { payment, party, unallocatedAmount } = await prisma.$transaction(
      (tx) => submitPaymentInTx(tx, body, req.user!.userId),
      { timeout: 15000 },
    );
    return res.status(201).json({ ...payment, party, unallocatedAmount });
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /payments', 'Gagal menyimpan pembayaran.');
  }
});

// POST /api/payments/:id/cancel — cancel payment and reverse allocations
router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.findUnique({
        where: { id: req.params.id as string },
        include: { party: true },
      });
      if (!payment) throw new BusinessError('Pembayaran tidak ditemukan.');
      if (payment.status === 'Cancelled') throw new BusinessError('Pembayaran sudah dibatalkan.');

      const numAmount = new Decimal(payment.amount.toString());

      // Deposits must be cancelled via their own endpoints (vendor-deposits / customer-deposits
      // PATCH /:id/cancel); cancelling here too causes a double cancel and GL drift.
      if (payment.paymentType === 'VendorDeposit') {
        throw new BusinessError('Gunakan endpoint Uang Muka Vendor untuk membatalkan deposit.');
      }
      if (payment.paymentType === 'CustomerDeposit') {
        throw new BusinessError('Gunakan endpoint Uang Muka Pelanggan untuk membatalkan deposit.');
      }
      if (payment.paymentType === 'VendorRefund' || payment.paymentType === 'CustomerRefund') {
        throw new BusinessError(
          'Refund belum mendukung cancel otomatis. Buat jurnal koreksi manual untuk membatalkan refund ini.',
        );
      }

      // Receive / Pay cancel branch
      // Reverse payment allocations
      const allocations = await tx.paymentAllocation.findMany({
        where: { paymentId: payment.id },
      });

      for (const alloc of allocations) {
        const allocAmt = new Decimal(alloc.allocatedAmount.toString());
        if (alloc.invoiceType === 'SalesInvoice') {
          const inv = await tx.salesInvoice.findUnique({ where: { id: alloc.invoiceId } });
          if (inv) {
            const newOutstanding = new Decimal(inv.outstanding.toString()).plus(allocAmt);
            const newOutstandingNum = newOutstanding.toNumber();
            await tx.salesInvoice.update({
              where: { id: inv.id },
              data: { outstanding: newOutstandingNum, status: newOutstanding.gte(new Decimal(inv.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid' },
            });
          }
        } else if (alloc.invoiceType === 'PurchaseInvoice') {
          const inv = await tx.purchaseInvoice.findUnique({ where: { id: alloc.invoiceId } });
          if (inv) {
            const newOutstanding = new Decimal(inv.outstanding.toString()).plus(allocAmt);
            const newOutstandingNum = newOutstanding.toNumber();
            await tx.purchaseInvoice.update({
              where: { id: inv.id },
              data: { outstanding: newOutstandingNum, status: newOutstanding.gte(new Decimal(inv.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid' },
            });
          }
        }
      }

      // Delete allocations
      await tx.paymentAllocation.deleteMany({ where: { paymentId: payment.id } });

      // Cancel related ledger entries — match the JV number format used on creation
      const jvNumber = `JV-${payment.paymentNumber}`;
      const journal = await tx.journalEntry.findUnique({
        where: { entryNumber: jvNumber },
      });
      if (journal) {
        await tx.journalEntry.update({
          where: { id: journal.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: journal.id },
          data: { isCancelled: true },
        });
      }

      // Reverse account balances — load splits if any, else fall back to single accountId
      const arAccount = await systemAccounts.getAccount('AR');
      const apAccount = await systemAccounts.getAccount('AP');
      const numAmountVal = numAmount.toNumber();

      const paymentSplits = await tx.paymentSplit.findMany({ where: { paymentId: payment.id } });
      const reverseSplits = paymentSplits.length > 0
        ? paymentSplits.map((s) => ({ accountId: s.accountId, amount: Number(s.amount) }))
        : [{ accountId: payment.accountId, amount: numAmountVal }];

      if (payment.paymentType === 'Receive') {
        // Original: each split DR; AR CR. Reverse: each split CR; AR DR.
        for (const sp of reverseSplits) {
          await updateAccountBalance(tx, sp.accountId, 0, sp.amount);
        }
        await updateAccountBalance(tx, arAccount.id, numAmountVal, 0);
      } else {
        // Original: each split CR; AP DR. Reverse: each split DR; AP CR.
        for (const sp of reverseSplits) {
          await updateAccountBalance(tx, sp.accountId, sp.amount, 0);
        }
        await updateAccountBalance(tx, apAccount.id, 0, numAmountVal);
      }

      // Recalc party outstanding from invoice data (source of truth)
      await recalcPartyOutstanding(tx, payment.partyId);

      // Mark payment as cancelled
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });

      return { id: payment.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /payments/:id/cancel', 'Gagal membatalkan pembayaran.');
  }
});

export default router;
