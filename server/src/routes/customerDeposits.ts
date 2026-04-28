import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { ApplyCustomerDepositSchema, RefundCustomerDepositSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/customer-deposits — list all customer deposits
router.get('/', async (req, res) => {
  try {
    const { partyId, status } = req.query;

    const where: Prisma.PaymentWhereInput = { paymentType: 'CustomerDeposit' };
    if (partyId) where.partyId = partyId as string;
    if (status) where.status = status as any;

    const deposits = await prisma.payment.findMany({
      where,
      include: {
        party: true,
        account: { select: { id: true, name: true, accountNumber: true } },
        customerDepositApplications: {
          where: { isCancelled: false },
          select: { id: true, appliedAmount: true, salesInvoiceId: true, appliedAt: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const data = deposits.map((d) => {
      const totalApplied = d.customerDepositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const refunded = new Decimal((d as any).refundedAmount?.toString() ?? '0');
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied).minus(refunded);
      return {
        ...d,
        totalApplied: totalApplied.toNumber(),
        totalRefunded: refunded.toNumber(),
        remaining: remaining.toNumber(),
      };
    });

    return res.json({ data });
  } catch (error) {
    logger.error({ error }, 'GET /customer-deposits error');
    return res.status(500).json({ error: 'Gagal mengambil data uang muka pelanggan.' });
  }
});

// GET /api/customer-deposits/balance/:partyId — deposit balance per customer
router.get('/balance/:partyId', async (req, res) => {
  try {
    const { partyId } = req.params;

    const deposits = await prisma.payment.findMany({
      where: { partyId, paymentType: 'CustomerDeposit', status: 'Submitted' },
      include: {
        account: { select: { id: true, name: true, accountNumber: true } },
        customerDepositApplications: {
          where: { isCancelled: false },
          select: { id: true, appliedAmount: true, salesInvoiceId: true, appliedAt: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    const items = deposits.map((d) => {
      const totalApplied = d.customerDepositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const refunded = new Decimal((d as any).refundedAmount?.toString() ?? '0');
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied).minus(refunded);
      return {
        id: d.id,
        paymentNumber: d.paymentNumber,
        date: d.date,
        amount: Number(d.amount),
        totalApplied: totalApplied.toNumber(),
        remaining: remaining.toNumber(),
        referenceNo: d.referenceNo,
        account: d.account,
      };
    }).filter((d) => d.remaining > 0.01);

    const totalBalance = items.reduce((sum, d) => sum + d.remaining, 0);

    return res.json({ data: items, totalBalance });
  } catch (error) {
    logger.error({ error }, 'GET /customer-deposits/balance error');
    return res.status(500).json({ error: 'Gagal mengambil saldo uang muka pelanggan.' });
  }
});

// PATCH /api/customer-deposits/:id/cancel — cancel a customer deposit payment
router.patch('/:id/cancel', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const deposit = await tx.payment.findUnique({
        where: { id },
        include: {
          customerDepositApplications: { where: { isCancelled: false } },
          journalEntry: { include: { items: true } },
        },
      });
      if (!deposit) throw new BusinessError('Deposit tidak ditemukan.');
      if (deposit.paymentType !== 'CustomerDeposit') throw new BusinessError('Bukan tipe uang muka pelanggan.');
      if (deposit.status === 'Cancelled') throw new BusinessError('Deposit sudah dibatalkan.');

      // Check if any applications exist
      if (deposit.customerDepositApplications.length > 0) {
        throw new BusinessError('Deposit sudah digunakan untuk faktur. Batalkan penggunaan terlebih dahulu.');
      }

      const depositAmount = Number(deposit.amount);

      // Reverse journal entry balances
      if (deposit.journalEntry) {
        for (const item of deposit.journalEntry.items) {
          await updateAccountBalance(tx, item.accountId, Number(item.credit), Number(item.debit));
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
        const customerDepositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');
        const openingEquityAccount = await systemAccounts.getAccount('OPENING_EQUITY');

        {
          // Reverse: DR Customer Deposit / CR Ekuitas Saldo Awal
          await updateAccountBalance(tx, customerDepositAccount.id, depositAmount, 0);
          await updateAccountBalance(tx, openingEquityAccount.id, 0, depositAmount);

          // Create reversal journal
          const jvNumber = await generateDocumentNumber(tx, 'JV', new Date(), deposit.fiscalYearId);
          const journal = await tx.journalEntry.create({
            data: {
              entryNumber: jvNumber,
              date: new Date(),
              narration: `[BATAL] Pembatalan uang muka pelanggan: ${deposit.paymentNumber}`,
              status: 'Submitted',
              fiscalYearId: deposit.fiscalYearId,
              createdBy: req.user!.userId,
              submittedAt: new Date(),
              items: {
                create: [
                  { accountId: customerDepositAccount.id, partyId: deposit.partyId, debit: depositAmount, credit: 0, description: `[BATAL] UM Pelanggan: ${deposit.paymentNumber}` },
                  { accountId: openingEquityAccount.id, partyId: deposit.partyId, debit: 0, credit: depositAmount, description: `[BATAL] UM Pelanggan: ${deposit.paymentNumber}` },
                ],
              },
            },
            include: { items: true },
          });

          await tx.accountingLedgerEntry.createMany({
            data: journal.items.map((item) => ({
              date: new Date(),
              accountId: item.accountId,
              partyId: item.partyId,
              debit: item.debit,
              credit: item.credit,
              referenceType: 'JournalEntry' as const,
              referenceId: journal.id,
              description: item.description || `[BATAL] UM Pelanggan: ${deposit.paymentNumber}`,
              fiscalYearId: deposit.fiscalYearId,
            })),
          });
        }
      }

      // Restore party deposit balance
      await tx.party.update({
        where: { id: deposit.partyId },
        data: { customerDepositBalance: { decrement: depositAmount } },
      });

      // Mark deposit as cancelled
      await tx.payment.update({
        where: { id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Uang muka pelanggan berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PATCH /customer-deposits/:id/cancel', 'Gagal membatalkan uang muka pelanggan.');
  }
});

// POST /api/customer-deposits/apply — apply deposit to sales invoice
router.post('/apply', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(ApplyCustomerDepositSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock rows to prevent concurrent application
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${body.depositPaymentId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${body.salesInvoiceId} FOR UPDATE`;

      const deposit = await tx.payment.findUnique({
        where: { id: body.depositPaymentId },
        include: { customerDepositApplications: { where: { isCancelled: false } } },
      });
      if (!deposit) throw new BusinessError('Deposit tidak ditemukan.');
      if (deposit.paymentType !== 'CustomerDeposit') throw new BusinessError('Pembayaran bukan tipe Uang Muka Pelanggan.');
      if (deposit.status !== 'Submitted') throw new BusinessError('Deposit sudah dibatalkan.');

      const invoice = await tx.salesInvoice.findUnique({
        where: { id: body.salesInvoiceId },
        include: { customer: true },
      });
      if (!invoice) throw new BusinessError('Invoice penjualan tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
      if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas.');

      if (deposit.partyId !== invoice.partyId) {
        throw new BusinessError('Deposit dan invoice harus dari pelanggan yang sama.');
      }

      const totalApplied = deposit.customerDepositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const depositRemaining = new Decimal(deposit.amount.toString()).minus(totalApplied);
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

      const arAccount = await systemAccounts.getAccount('AR');
      const depositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');

      const applyAmountNum = applyAmount.toNumber();

      // Create journal: DR Uang Muka Pelanggan / CR Piutang Usaha
      const jvNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Aplikasi Uang Muka Pelanggan: ${deposit.paymentNumber} → ${invoice.invoiceNumber}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: depositAccount.id, partyId: invoice.partyId, debit: applyAmountNum, credit: 0, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}` },
              { accountId: arAccount.id, partyId: invoice.partyId, debit: 0, credit: applyAmountNum, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}` },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: parsedDate, accountId: depositAccount.id, partyId: invoice.partyId, debit: applyAmountNum, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
          { date: parsedDate, accountId: arAccount.id, partyId: invoice.partyId, debit: 0, credit: applyAmountNum, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Aplikasi UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, depositAccount.id, applyAmountNum, 0);  // DR liability (reduce)
      await updateAccountBalance(tx, arAccount.id, 0, applyAmountNum);       // CR AR (reduce)

      // Update invoice outstanding
      const newOutstanding = invoiceOutstanding.minus(applyAmount);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      // Update party balances
      await tx.party.update({
        where: { id: invoice.partyId },
        data: { customerDepositBalance: { decrement: applyAmountNum } },
      });
      await recalcPartyOutstanding(tx, invoice.partyId);

      // Create application record
      const application = await tx.customerDepositApplication.create({
        data: {
          depositPaymentId: deposit.id,
          salesInvoiceId: invoice.id,
          appliedAmount: applyAmountNum,
          journalEntryId: journalEntry.id,
          createdBy: req.user!.userId,
        },
      });

      return application;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /customer-deposits/apply', 'Gagal mengaplikasikan uang muka pelanggan.');
  }
});

// POST /api/customer-deposits/apply/:id/cancel — cancel deposit application
router.post('/apply/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const application = await tx.customerDepositApplication.findUnique({
        where: { id: req.params.id as string },
        include: {
          depositPayment: true,
          salesInvoice: { include: { customer: true } },
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
          await updateAccountBalance(tx, item.accountId, Number(item.credit), Number(item.debit));
        }
      }

      // Restore invoice outstanding
      const invoice = application.salesInvoice;
      const newOutstanding = new Decimal(invoice.outstanding.toString()).plus(applyAmount);
      const newStatus = newOutstanding.gte(new Decimal(invoice.grandTotal.toString())) ? 'Submitted' : 'PartiallyPaid';
      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      // Restore party balances
      await tx.party.update({
        where: { id: invoice.partyId },
        data: { customerDepositBalance: { increment: applyAmountNum } },
      });
      await recalcPartyOutstanding(tx, invoice.partyId);

      // Mark application as cancelled
      await tx.customerDepositApplication.update({
        where: { id: application.id },
        data: { isCancelled: true, cancelledAt: new Date() },
      });

      return { id: application.id, status: 'Cancelled' };
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /customer-deposits/apply/:id/cancel', 'Gagal membatalkan aplikasi uang muka pelanggan.');
  }
});

// POST /api/customer-deposits/:id/refund — selesaikan sisa uang muka via
// offset piutang (FIFO ke faktur terlama) dan/atau refund kas ke bank.
router.post('/:id/refund', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(RefundCustomerDepositSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const depositId = req.params.id as string;
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${depositId} FOR UPDATE`;

      const deposit = await tx.payment.findUnique({
        where: { id: depositId },
        include: {
          party: true,
          customerDepositApplications: { where: { isCancelled: false } },
        },
      });
      if (!deposit) throw new BusinessError('Uang muka tidak ditemukan.');
      if (deposit.paymentType !== 'CustomerDeposit') throw new BusinessError('Bukan tipe uang muka pelanggan.');
      if (deposit.status !== 'Submitted') throw new BusinessError('Uang muka sudah dibatalkan.');

      const totalApplied = deposit.customerDepositApplications.reduce(
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

      const depositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');
      const arAccount = await systemAccounts.getAccount('AR');

      const createdApplications: string[] = [];
      let cashJournalId: string | null = null;

      // ── 1. Offset ke piutang (FIFO oldest-first) ─────────────────────────
      if (offsetReq.gt(0)) {
        await tx.$queryRaw`SELECT id FROM sales_invoices WHERE party_id = ${deposit.partyId} AND status IN ('Submitted','PartiallyPaid','Overdue') FOR UPDATE`;

        const invoices = await tx.salesInvoice.findMany({
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
              narration: `Offset UM Pelanggan: ${deposit.paymentNumber} → ${inv.invoiceNumber}`,
              status: 'Submitted',
              fiscalYearId: fiscalYear.id,
              createdBy: req.user!.userId,
              submittedAt: new Date(),
              items: {
                create: [
                  { accountId: depositAccount.id, partyId: deposit.partyId, debit: applyNum, credit: 0, description: `Offset UM Pelanggan: ${deposit.paymentNumber}` },
                  { accountId: arAccount.id, partyId: deposit.partyId, debit: 0, credit: applyNum, description: `Offset piutang: ${inv.invoiceNumber}` },
                ],
              },
            },
          });

          await tx.accountingLedgerEntry.createMany({
            data: [
              { date: parsedDate, accountId: depositAccount.id, partyId: deposit.partyId, debit: applyNum, credit: 0, referenceType: 'JournalEntry', referenceId: je.id, description: `Offset UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
              { date: parsedDate, accountId: arAccount.id, partyId: deposit.partyId, debit: 0, credit: applyNum, referenceType: 'JournalEntry', referenceId: je.id, description: `Offset piutang: ${inv.invoiceNumber}`, fiscalYearId: fiscalYear.id },
            ],
          });

          await updateAccountBalance(tx, depositAccount.id, applyNum, 0);
          await updateAccountBalance(tx, arAccount.id, 0, applyNum);

          const newOut = invOut.minus(apply);
          await tx.salesInvoice.update({
            where: { id: inv.id },
            data: {
              outstanding: newOut.toNumber(),
              status: newOut.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid',
            },
          });

          const app = await tx.customerDepositApplication.create({
            data: {
              depositPaymentId: deposit.id,
              salesInvoiceId: inv.id,
              appliedAmount: applyNum,
              journalEntryId: je.id,
              createdBy: req.user!.userId,
            },
          });
          createdApplications.push(app.id);

          await tx.party.update({
            where: { id: deposit.partyId },
            data: { customerDepositBalance: { decrement: applyNum } },
          });

          remainingOffset = remainingOffset.minus(apply);
        }

        if (remainingOffset.gt(new Decimal('0.01'))) {
          throw new BusinessError(
            `Piutang pelanggan tidak cukup untuk offset. Sisa offset yang tidak teralokasi: Rp ${remainingOffset.toFixed(2)}.`,
          );
        }
        await recalcPartyOutstanding(tx, deposit.partyId);
      }

      // ── 2. Refund kas ke bank ────────────────────────────────────────────
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
            narration: `Refund UM Pelanggan: ${deposit.paymentNumber} - ${deposit.party.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId: depositAccount.id, partyId: deposit.partyId, debit: cashNum, credit: 0, description: `Refund UM Pelanggan: ${deposit.paymentNumber}` },
                { accountId: cashAccount.id, debit: 0, credit: cashNum, description: `Refund UM Pelanggan: ${deposit.paymentNumber}` },
              ],
            },
          },
        });
        cashJournalId = je.id;

        await tx.accountingLedgerEntry.createMany({
          data: [
            { date: parsedDate, accountId: depositAccount.id, partyId: deposit.partyId, debit: cashNum, credit: 0, referenceType: 'JournalEntry', referenceId: je.id, description: `Refund UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
            { date: parsedDate, accountId: cashAccount.id, debit: 0, credit: cashNum, referenceType: 'JournalEntry', referenceId: je.id, description: `Refund UM Pelanggan: ${deposit.paymentNumber}`, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, depositAccount.id, cashNum, 0);
        await updateAccountBalance(tx, cashAccount.id, 0, cashNum);

        await tx.party.update({
          where: { id: deposit.partyId },
          data: { customerDepositBalance: { decrement: cashNum } },
        });

        await tx.payment.update({
          where: { id: deposit.id },
          data: { refundedAmount: { increment: cashNum } },
        });
      }

      return {
        message: 'Uang muka berhasil diselesaikan.',
        offsetApplied: offsetReq.toNumber(),
        cashRefunded: cashReq.toNumber(),
        applications: createdApplications,
        cashJournalId,
      };
    }, { timeout: 20000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /customer-deposits/:id/refund', 'Gagal memproses refund/offset uang muka.');
  }
});

export default router;
