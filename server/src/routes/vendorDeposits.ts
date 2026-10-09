import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { ApplyVendorDepositSchema, RefundVendorDepositSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildVendorDepositWhere,
  DEFAULT_VENDOR_DEPOSIT_SORT,
  depositFigures,
  filterVendorByUsage,
  pageVendorDeposits,
  summarizeVendorDeposits,
  toVendorLightRow,
  VENDOR_DEPOSIT_SORT_FIELDS,
} from '../services/vendorDepositList';

const router = Router();

const DEPOSIT_LIST_INCLUDE = {
  party: true,
  account: { select: { id: true, name: true, accountNumber: true } },
  depositApplications: {
    where: { isCancelled: false },
    select: { id: true, appliedAmount: true, purchaseInvoiceId: true, appliedAt: true },
  },
} satisfies Prisma.PaymentInclude;

type DepositWithApplications = Prisma.PaymentGetPayload<{ include: typeof DEPOSIT_LIST_INCLUDE }>;

/** Row shape returned by both list modes: the payment + computed figures. */
function enrichDeposit(d: DepositWithApplications) {
  return { ...d, ...depositFigures(d.amount, d.refundedAmount, d.depositApplications) };
}

/** Light projection for paging / summary (see services/vendorDepositList). */
async function loadDepositLightRows(where: Prisma.PaymentWhereInput) {
  const rows = await prisma.payment.findMany({
    where,
    select: {
      id: true,
      paymentNumber: true,
      date: true,
      status: true,
      amount: true,
      refundedAmount: true,
      party: { select: { name: true } },
      depositApplications: { where: { isCancelled: false }, select: { appliedAmount: true } },
    },
  });
  return rows.map(toVendorLightRow);
}

// GET /api/vendor-deposits — list vendor deposits.
//
// Two modes (backward compatible):
//  • without `page` (legacy — PaymentModal and other callers): every deposit,
//    filters `partyId` and raw `status` (DocumentStatus), ordered by date desc,
//    response `{ data }` exactly as before.
//  • with `page` (list page): `page`, `limit` (≤200), `status` (Active |
//    PartiallyUsed | FullyUsed | Draft | Submitted | Cancelled), `partyId`,
//    `startDate`/`endDate` (YYYY-MM-DD), `search`, `sort` (e.g. "-remaining")
//    → `{ data, total, page, limit }`; rows also carry `state`.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    if (query.page !== undefined) return await listDepositsPaged(query, res);

    const { partyId, status } = req.query;

    const where: Prisma.PaymentWhereInput = { paymentType: 'VendorDeposit' };
    if (partyId) where.partyId = partyId as string;
    if (status) where.status = status as any;

    const deposits = await prisma.payment.findMany({
      where,
      include: DEPOSIT_LIST_INCLUDE,
      orderBy: { date: 'desc' },
    });

    return res.json({ data: deposits.map(enrichDeposit) });
  } catch (error) {
    logger.error({ error }, 'GET /vendor-deposits error');
    return res.status(500).json({ error: 'Gagal mengambil data uang muka vendor.' });
  }
});

async function listDepositsPaged(query: Record<string, unknown>, res: Response) {
  const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 200 });
  const filter = buildVendorDepositWhere(query);
  if (!filter.ok) return res.status(400).json({ error: filter.error });
  const sort = parseSort(query.sort, VENDOR_DEPOSIT_SORT_FIELDS, DEFAULT_VENDOR_DEPOSIT_SORT);

  const light = await loadDepositLightRows(filter.where);
  const { ids, total } = pageVendorDeposits(light, { usage: filter.usage, sort, skip, limit });
  const stateById = new Map(light.map((r) => [r.id, r.state]));

  const rows = ids.length
    ? await prisma.payment.findMany({ where: { id: { in: ids } }, include: DEPOSIT_LIST_INCLUDE })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const data = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ ...enrichDeposit(row), state: stateById.get(id) }] : [];
  });

  return res.json({ data, total, page, limit });
}

// GET /api/vendor-deposits/summary — KPI totals for the same filters as the
// paged list (status, partyId, startDate, endDate, search). Declared before
// any '/:id' route; the module RBAC gate (requirePerm('vendor_deposit')) is
// applied where the router is mounted, so it covers this endpoint too.
router.get('/summary', async (req, res) => {
  try {
    const filter = buildVendorDepositWhere(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const light = await loadDepositLightRows(filter.where);
    return res.json(summarizeVendorDeposits(filterVendorByUsage(light, filter.usage)));
  } catch (error) {
    logger.error({ error }, 'GET /vendor-deposits/summary error');
    return res.status(500).json({ error: 'Gagal menghitung ringkasan uang muka vendor.' });
  }
});

// GET /api/vendor-deposits/balance/:partyId — deposit balance per vendor
router.get('/balance/:partyId', async (req, res) => {
  try {
    const { partyId } = req.params;

    const deposits = await prisma.payment.findMany({
      where: { partyId, paymentType: 'VendorDeposit', status: 'Submitted' },
      include: {
        account: { select: { id: true, name: true, accountNumber: true } },
        depositApplications: {
          where: { isCancelled: false },
          select: { id: true, appliedAmount: true, purchaseInvoiceId: true, appliedAt: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    const items = deposits.map((d) => {
      const totalApplied = d.depositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const refunded = new Decimal(d.refundedAmount.toString());
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied).minus(refunded);
      return {
        id: d.id,
        paymentNumber: d.paymentNumber,
        date: d.date,
        amount: Number(d.amount),
        totalApplied: totalApplied.toNumber(),
        totalRefunded: refunded.toNumber(),
        remaining: remaining.toNumber(),
        referenceNo: d.referenceNo,
        account: d.account,
      };
    }).filter((d) => d.remaining > 0.01);

    const totalBalance = items.reduce((sum, d) => sum + d.remaining, 0);

    return res.json({ data: items, totalBalance });
  } catch (error) {
    logger.error({ error }, 'GET /vendor-deposits/balance error');
    return res.status(500).json({ error: 'Gagal mengambil saldo uang muka.' });
  }
});

// PATCH /api/vendor-deposits/:id/cancel — cancel a vendor deposit payment
router.patch('/:id/cancel', async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deposit = await tx.payment.findUnique({
        where: { id },
        include: {
          depositApplications: { where: { isCancelled: false } },
          journalEntry: { include: { items: true } },
        },
      });
      if (!deposit) throw new BusinessError('Deposit tidak ditemukan.');
      if (deposit.paymentType !== 'VendorDeposit') throw new BusinessError('Bukan tipe uang muka vendor.');
      if (deposit.status === 'Cancelled') throw new BusinessError('Deposit sudah dibatalkan.');

      // Check if any applications exist
      if (deposit.depositApplications.length > 0) {
        throw new BusinessError('Deposit sudah digunakan untuk faktur. Batalkan penggunaan terlebih dahulu.');
      }

      const depositAmount = Number(deposit.amount);

      // Reverse journal entry balances
      if (deposit.journalEntry) {
        for (const item of deposit.journalEntry.items) {
          await updateAccountBalance(tx, item.accountId, item.credit, item.debit);
        }
        await tx.journalEntry.update({
          where: { id: deposit.journalEntry.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        // Soft-cancel original ALE rows. Avoid the legacy [BATAL] reversal
        // pattern — adding mirrored rows alongside live originals doubles
        // raw DR/CR totals on ALE while JI is implicitly excluded by the
        // parent JE's status, breaking the ALE↔JI sync health check.
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: deposit.journalEntry.id, isCancelled: false },
          data: { isCancelled: true },
        });
      } else {
        // No linked journal (legacy imports) — reverse account balances directly
        const vendorDepositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');
        const openingEquityAccount = await systemAccounts.getAccount('OPENING_EQUITY');

        {
          // Reverse: CR Vendor Deposit / DR Ekuitas Saldo Awal
          await updateAccountBalance(tx, vendorDepositAccount.id, 0, depositAmount);
          await updateAccountBalance(tx, openingEquityAccount.id, depositAmount, 0);

          // FIX(double-reversal): jangan buat JV pembalik [BATAL].
          // Pola lama membuat baris pembalik aktif SEKALIGUS soft-cancel
          // jurnal asli di jalur lain -> saldo dobel terbalik (kasus
          // pembayaran uang muka yang dibatalkan dan beberapa STT).
          // Cukup: reverse balance (sudah dilakukan di atas) + soft-cancel
          // defensif ALE asli hasil import legacy bila ada.
          await tx.accountingLedgerEntry.updateMany({
            where: { description: { contains: deposit.paymentNumber }, isCancelled: false },
            data: { isCancelled: true },
          });
        }
      }

      // Restore party deposit balance
      await tx.party.update({
        where: { id: deposit.partyId },
        data: { depositBalance: { decrement: depositAmount } },
      });

      // Mark deposit as cancelled
      await tx.payment.update({
        where: { id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Uang muka vendor berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PATCH /vendor-deposits/:id/cancel', 'Gagal membatalkan uang muka vendor.');
  }
});

// POST /api/vendor-deposits/apply — apply deposit to purchase invoice
router.post('/apply', async (req: AuthRequest, res) => {
  const body = validateBody(ApplyVendorDepositSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock rows to prevent concurrent application
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${body.depositPaymentId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM purchase_invoices WHERE id = ${body.purchaseInvoiceId} FOR UPDATE`;

      const deposit = await tx.payment.findUnique({
        where: { id: body.depositPaymentId },
        include: { depositApplications: { where: { isCancelled: false } } },
      });
      if (!deposit) throw new BusinessError('Deposit tidak ditemukan.');
      if (deposit.paymentType !== 'VendorDeposit') throw new BusinessError('Pembayaran bukan tipe Uang Muka Vendor.');
      if (deposit.status !== 'Submitted') throw new BusinessError('Deposit sudah dibatalkan.');

      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: body.purchaseInvoiceId },
        include: { supplier: true },
      });
      if (!invoice) throw new BusinessError('Invoice pembelian tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
      if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas.');

      if (deposit.partyId !== invoice.partyId) {
        throw new BusinessError('Deposit dan invoice harus dari supplier yang sama.');
      }

      const totalApplied = deposit.depositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const refunded = new Decimal(deposit.refundedAmount.toString());
      const depositRemaining = new Decimal(deposit.amount.toString()).minus(totalApplied).minus(refunded);
      const invoiceOutstanding = new Decimal(invoice.outstanding.toString());
      const applyAmount = new Decimal(body.amount);

      if (applyAmount.gt(depositRemaining)) {
        throw new BusinessError(`Sisa deposit hanya Rp ${depositRemaining.toFixed(2)}. Tidak cukup.`);
      }
      if (applyAmount.gt(invoiceOutstanding)) {
        throw new BusinessError(`Sisa outstanding invoice hanya Rp ${invoiceOutstanding.toFixed(2)}.`);
      }

      const parsedDate = new Date();
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const apAccount = await systemAccounts.getAccount('AP');
      const depositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');

      const applyAmountNum = applyAmount.toNumber();

      // Create journal: DR AP / CR Uang Muka Vendor
      const jvNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Aplikasi Uang Muka: ${deposit.paymentNumber} → ${invoice.invoiceNumber}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: apAccount.id, partyId: invoice.partyId, debit: applyAmountNum, credit: 0, description: `Aplikasi UM: ${deposit.paymentNumber}` },
              { accountId: depositAccount.id, partyId: invoice.partyId, debit: 0, credit: applyAmountNum, description: `Aplikasi UM: ${deposit.paymentNumber}` },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: parsedDate, accountId: apAccount.id, partyId: invoice.partyId, debit: applyAmountNum, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Aplikasi UM: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
          { date: parsedDate, accountId: depositAccount.id, partyId: invoice.partyId, debit: 0, credit: applyAmountNum, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Aplikasi UM: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, apAccount.id, applyAmountNum, 0);
      await updateAccountBalance(tx, depositAccount.id, 0, applyAmountNum);

      // Update invoice outstanding
      const newOutstanding = invoiceOutstanding.minus(applyAmount);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';
      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      // Update party balances
      await tx.party.update({
        where: { id: invoice.partyId },
        data: { depositBalance: { decrement: applyAmountNum } },
      });
      await recalcPartyOutstanding(tx, invoice.partyId);

      // Create application record
      const application = await tx.vendorDepositApplication.create({
        data: {
          depositPaymentId: deposit.id,
          purchaseInvoiceId: invoice.id,
          appliedAmount: applyAmountNum,
          journalEntryId: journalEntry.id,
          createdBy: req.user!.userId,
        },
      });

      return application;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /vendor-deposits/apply', 'Gagal mengaplikasikan uang muka.');
  }
});

// POST /api/vendor-deposits/apply/:id/cancel — cancel deposit application
router.post('/apply/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const application = await tx.vendorDepositApplication.findUnique({
        where: { id: req.params.id as string },
        include: {
          depositPayment: true,
          purchaseInvoice: { include: { supplier: true } },
          journalEntry: { include: { items: true } },
        },
      });
      if (!application) throw new BusinessError('Aplikasi uang muka tidak ditemukan.');
      if (application.isCancelled) throw new BusinessError('Aplikasi sudah dibatalkan.');

      const applyAmount = new Decimal(application.appliedAmount.toString());
      const applyAmountNum = applyAmount.toNumber();

      // Cancel journal entry
      if (application.journalEntry) {
        await tx.journalEntry.update({
          where: { id: application.journalEntry.id },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: application.journalEntry.id },
          data: { isCancelled: true },
        });

        // Reverse account balances from journal items
        for (const item of application.journalEntry.items) {
          await updateAccountBalance(tx, item.accountId, item.credit, item.debit);
        }
      }

      // Restore invoice outstanding
      const invoice = application.purchaseInvoice;
      const newOutstanding = new Decimal(invoice.outstanding.toString()).plus(applyAmount);
      const newStatus = newOutstanding.gte(new Decimal(invoice.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid';
      await tx.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      // Restore party balances
      await tx.party.update({
        where: { id: invoice.partyId },
        data: { depositBalance: { increment: applyAmountNum } },
      });
      await recalcPartyOutstanding(tx, invoice.partyId);

      // Mark application as cancelled
      await tx.vendorDepositApplication.update({
        where: { id: application.id },
        data: { isCancelled: true, cancelledAt: new Date() },
      });

      return { id: application.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /vendor-deposits/apply/:id/cancel', 'Gagal membatalkan aplikasi uang muka.');
  }
});

// POST /api/vendor-deposits/:id/refund — selesaikan sisa uang muka via
// offset hutang (FIFO ke purchase invoice terlama) dan/atau refund kas dari
// vendor (vendor mengembalikan DP ke rekening kita).
router.post('/:id/refund', async (req: AuthRequest, res) => {
  const body = validateBody(RefundVendorDepositSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const depositId = req.params.id as string;
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${depositId} FOR UPDATE`;

      const deposit = await tx.payment.findUnique({
        where: { id: depositId },
        include: {
          party: true,
          depositApplications: { where: { isCancelled: false } },
        },
      });
      if (!deposit) throw new BusinessError('Uang muka tidak ditemukan.');
      if (deposit.paymentType !== 'VendorDeposit') throw new BusinessError('Bukan tipe uang muka vendor.');
      if (deposit.status !== 'Submitted') throw new BusinessError('Uang muka sudah dibatalkan.');

      const totalApplied = deposit.depositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0),
      );
      const alreadyRefunded = new Decimal(deposit.refundedAmount.toString());
      const remaining = new Decimal(deposit.amount.toString()).minus(totalApplied).minus(alreadyRefunded);

      const offsetReq = new Decimal(body.offsetAmount);
      const cashReq = new Decimal(body.cashAmount);
      const totalReq = offsetReq.plus(cashReq);
      if (totalReq.gt(remaining.plus(new Decimal('0.01')))) {
        throw new BusinessError(`Total ${totalReq.toFixed(2)} melebihi sisa uang muka ${remaining.toFixed(2)}.`);
      }

      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const depositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');
      const apAccount = await systemAccounts.getAccount('AP');

      const createdApplications: string[] = [];
      let cashJournalId: string | null = null;

      // 1. Offset ke hutang (FIFO oldest-first)
      if (offsetReq.gt(0)) {
        await tx.$queryRaw`SELECT id FROM purchase_invoices WHERE party_id = ${deposit.partyId} AND status IN ('Submitted','PartiallyPaid','Overdue') FOR UPDATE`;

        const invoices = await tx.purchaseInvoice.findMany({
          where: {
            partyId: deposit.partyId,
            status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] },
          },
          orderBy: { date: 'asc' },
        });

        let remainingOffset = offsetReq;
        for (const inv of invoices) {
          if (remainingOffset.lte(0)) break;
          const invOut = new Decimal(inv.outstanding.toString());
          if (invOut.lte(0)) continue;
          const apply = Decimal.min(invOut, remainingOffset);
          const applyNum = apply.toNumber();

          const jvNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);
          const je = await tx.journalEntry.create({
            data: {
              entryNumber: jvNumber,
              date: parsedDate,
              narration: `Offset UM Vendor: ${deposit.paymentNumber} → ${inv.invoiceNumber}`,
              status: 'Submitted',
              fiscalYearId: fiscalYear.id,
              createdBy: req.user!.userId,
              submittedAt: new Date(),
              items: {
                create: [
                  { accountId: apAccount.id, partyId: deposit.partyId, debit: applyNum, credit: 0, description: `Offset hutang: ${inv.invoiceNumber}` },
                  { accountId: depositAccount.id, partyId: deposit.partyId, debit: 0, credit: applyNum, description: `Offset UM Vendor: ${deposit.paymentNumber}` },
                ],
              },
            },
          });

          await tx.accountingLedgerEntry.createMany({
            data: [
              { date: parsedDate, accountId: apAccount.id, partyId: deposit.partyId, debit: applyNum, credit: 0, referenceType: 'JournalEntry', referenceId: je.id, description: `Offset hutang: ${inv.invoiceNumber}`, fiscalYearId: fiscalYear.id },
              { date: parsedDate, accountId: depositAccount.id, partyId: deposit.partyId, debit: 0, credit: applyNum, referenceType: 'JournalEntry', referenceId: je.id, description: `Offset UM Vendor: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
            ],
          });

          await updateAccountBalance(tx, apAccount.id, applyNum, 0);
          await updateAccountBalance(tx, depositAccount.id, 0, applyNum);

          const newOut = invOut.minus(apply);
          await tx.purchaseInvoice.update({
            where: { id: inv.id },
            data: {
              outstanding: newOut.toNumber(),
              status: newOut.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid',
            },
          });

          const app = await tx.vendorDepositApplication.create({
            data: {
              depositPaymentId: deposit.id,
              purchaseInvoiceId: inv.id,
              appliedAmount: applyNum,
              journalEntryId: je.id,
              createdBy: req.user!.userId,
            },
          });
          createdApplications.push(app.id);

          await tx.party.update({
            where: { id: deposit.partyId },
            data: { depositBalance: { decrement: applyNum } },
          });

          remainingOffset = remainingOffset.minus(apply);
        }

        if (remainingOffset.gt(new Decimal('0.01'))) {
          throw new BusinessError(
            `Hutang vendor tidak cukup untuk offset. Sisa offset yang tidak teralokasi: Rp ${remainingOffset.toFixed(2)}.`,
          );
        }
        await recalcPartyOutstanding(tx, deposit.partyId);
      }

      // 2. Refund kas dari vendor
      // Vendor mengembalikan kas DP ke rekening kita: DR Bank/Kas / CR Uang Muka Pembelian.
      if (cashReq.gt(0)) {
        const cashAccount = await tx.account.findUnique({ where: { id: body.cashAccountId! } });
        if (!cashAccount) throw new BusinessError('Akun kas/bank tidak ditemukan.');
        const isCash = await systemAccounts.isCashAccount(cashAccount.accountNumber);
        if (!isCash) throw new BusinessError('Akun yang dipilih bukan kas/bank.');

        const cashNum = cashReq.toNumber();
        const jvNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);
        const je = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: parsedDate,
            narration: `Refund UM Vendor: ${deposit.paymentNumber} - ${deposit.party.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId: cashAccount.id, debit: cashNum, credit: 0, description: `Refund UM Vendor: ${deposit.paymentNumber}` },
                { accountId: depositAccount.id, partyId: deposit.partyId, debit: 0, credit: cashNum, description: `Refund UM Vendor: ${deposit.paymentNumber}` },
              ],
            },
          },
        });
        cashJournalId = je.id;

        await tx.accountingLedgerEntry.createMany({
          data: [
            { date: parsedDate, accountId: cashAccount.id, debit: cashNum, credit: 0, referenceType: 'JournalEntry', referenceId: je.id, description: `Refund UM Vendor: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
            { date: parsedDate, accountId: depositAccount.id, partyId: deposit.partyId, debit: 0, credit: cashNum, referenceType: 'JournalEntry', referenceId: je.id, description: `Refund UM Vendor: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, cashAccount.id, cashNum, 0);
        await updateAccountBalance(tx, depositAccount.id, 0, cashNum);

        await tx.party.update({
          where: { id: deposit.partyId },
          data: { depositBalance: { decrement: cashNum } },
        });

        await tx.payment.update({
          where: { id: deposit.id },
          data: { refundedAmount: { increment: cashNum } },
        });
      }

      return {
        message: 'Uang muka vendor berhasil diselesaikan.',
        offsetApplied: offsetReq.toNumber(),
        cashRefunded: cashReq.toNumber(),
        applications: createdApplications,
        cashJournalId,
      };
    }, { timeout: 20000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /vendor-deposits/:id/refund', 'Gagal memproses refund/offset uang muka.');
  }
});

export default router;
