import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { ApplyVendorDepositSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/vendor-deposits — list all vendor deposits
router.get('/', async (req, res) => {
  try {
    const { partyId, status } = req.query;

    const where: Prisma.PaymentWhereInput = { paymentType: 'VendorDeposit' };
    if (partyId) where.partyId = partyId as string;
    if (status) where.status = status as any;

    const deposits = await prisma.payment.findMany({
      where,
      include: {
        party: true,
        account: { select: { id: true, name: true, accountNumber: true } },
        depositApplications: {
          where: { isCancelled: false },
          select: { id: true, appliedAmount: true, purchaseInvoiceId: true, appliedAt: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const data = deposits.map((d) => {
      const totalApplied = d.depositApplications.reduce(
        (sum, app) => sum.plus(new Decimal(app.appliedAmount.toString())),
        new Decimal(0)
      );
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied);
      return {
        ...d,
        totalApplied: totalApplied.toNumber(),
        remaining: remaining.toNumber(),
      };
    });

    return res.json({ data });
  } catch (error) {
    logger.error({ error }, 'GET /vendor-deposits error');
    return res.status(500).json({ error: 'Gagal mengambil data uang muka vendor.' });
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
      const remaining = new Decimal(d.amount.toString()).minus(totalApplied);
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
    logger.error({ error }, 'GET /vendor-deposits/balance error');
    return res.status(500).json({ error: 'Gagal mengambil saldo uang muka.' });
  }
});

// PATCH /api/vendor-deposits/:id/cancel — cancel a vendor deposit payment
router.patch('/:id/cancel', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
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
        const vendorDepositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');
        const openingEquityAccount = await systemAccounts.getAccount('OPENING_EQUITY');

        {
          // Reverse: CR Vendor Deposit / DR Ekuitas Saldo Awal
          await updateAccountBalance(tx, vendorDepositAccount.id, 0, depositAmount);
          await updateAccountBalance(tx, openingEquityAccount.id, depositAmount, 0);

          // Create reversal journal
          const jvNumber = await generateDocumentNumber(tx, 'JV', new Date(), deposit.fiscalYearId);
          const journal = await tx.journalEntry.create({
            data: {
              entryNumber: jvNumber,
              date: new Date(),
              narration: `[BATAL] Pembatalan uang muka vendor: ${deposit.paymentNumber}`,
              status: 'Submitted',
              fiscalYearId: deposit.fiscalYearId,
              createdBy: req.user!.userId,
              submittedAt: new Date(),
              items: {
                create: [
                  { accountId: openingEquityAccount.id, partyId: deposit.partyId, debit: depositAmount, credit: 0, description: `[BATAL] UM Vendor: ${deposit.paymentNumber}` },
                  { accountId: vendorDepositAccount.id, partyId: deposit.partyId, debit: 0, credit: depositAmount, description: `[BATAL] UM Vendor: ${deposit.paymentNumber}` },
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
              description: item.description || `[BATAL] UM Vendor: ${deposit.paymentNumber}`,
              fiscalYearId: deposit.fiscalYearId,
            })),
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
router.post('/apply', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
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
router.post('/apply/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
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
          await updateAccountBalance(tx, item.accountId, Number(item.credit), Number(item.debit));
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

export default router;
