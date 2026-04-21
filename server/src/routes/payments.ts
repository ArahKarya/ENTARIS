import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreatePaymentSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

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
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreatePaymentSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) {
        throw new BusinessError('Format tanggal tidak valid.');
      }

      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      // Verify account exists and is a cash/bank account (skip for opening balance deposits)
      const isOpeningDeposit = body.isOpeningBalance === true &&
        (body.paymentType === 'VendorDeposit' || body.paymentType === 'CustomerDeposit');
      if (!isOpeningDeposit) {
        const bankAccount = await tx.account.findUnique({ where: { id: body.accountId } });
        if (!bankAccount) throw new BusinessError('Akun kas/bank tidak ditemukan.');
        const isCashAccount = await systemAccounts.isCashAccount(bankAccount.accountNumber);
        if (!isCashAccount) {
          throw new BusinessError('Akun yang dipilih bukan akun kas/bank.');
        }
      }

      // Verify party exists and is active
      const party = await tx.party.findUnique({ where: { id: body.partyId } });
      if (!party) throw new BusinessError('Data mitra tidak ditemukan.');
      if (!party.isActive) throw new BusinessError('Mitra sudah tidak aktif.');

      const paymentNumber = await generateDocumentNumber(tx, 'PAY', parsedDate, fiscalYear.id);
      const numAmount = body.amount;

      // For opening balance deposits, resolve accountId to the real Ekuitas Saldo Awal account
      const resolvedAccountId = isOpeningDeposit
        ? (await systemAccounts.getAccount('OPENING_EQUITY')).id
        : body.accountId;

      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          date: parsedDate,
          partyId: body.partyId,
          paymentType: body.paymentType,
          accountId: resolvedAccountId,
          amount: numAmount,
          status: 'Submitted',
          referenceNo: body.referenceNo || null,
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
        },
      });

      // ── VendorDeposit branch: DR Uang Muka Vendor / CR Kas ──────────────
      // If isOpeningBalance: DR Uang Muka Vendor / CR Ekuitas Saldo Awal (3.1)
      // Normal:              DR Uang Muka Vendor / CR Kas/Bank
      if (body.paymentType === 'VendorDeposit') {
        if (party.partyType !== 'Supplier' && party.partyType !== 'Both') {
          throw new BusinessError('Uang muka hanya dapat dibuat untuk Supplier.');
        }
        const depositAccount = await systemAccounts.getAccount('VENDOR_DEPOSIT');

        const isOpening = body.isOpeningBalance === true;
        const creditAccountId = isOpening
          ? (await systemAccounts.getAccount('OPENING_EQUITY')).id
          : body.accountId;
        const narrationPrefix = isOpening ? 'Saldo Awal Uang Muka Vendor' : 'Uang Muka Vendor';

        const jvNumber = `JV-${paymentNumber}`;
        const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
        if (existingJV) throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: parsedDate,
            narration: `${narrationPrefix}: ${paymentNumber} - ${party.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId: depositAccount.id, partyId: body.partyId, debit: numAmount, credit: 0, description: `${narrationPrefix}: ${paymentNumber}` },
                { accountId: creditAccountId, debit: 0, credit: numAmount, description: `${narrationPrefix}: ${paymentNumber}` },
              ],
            },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { date: parsedDate, accountId: depositAccount.id, partyId: body.partyId, debit: numAmount, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `${narrationPrefix}: ${paymentNumber}`, fiscalYearId: fiscalYear.id },
            { date: parsedDate, accountId: creditAccountId, debit: 0, credit: numAmount, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `${narrationPrefix}: ${paymentNumber}`, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, depositAccount.id, numAmount, 0);
        await updateAccountBalance(tx, creditAccountId, 0, numAmount);

        await tx.party.update({
          where: { id: body.partyId },
          data: { depositBalance: { increment: numAmount } },
        });

        await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalEntry.id } });

        return { ...payment, party, unallocatedAmount: 0 };
      }

      // ── CustomerDeposit branch: DR Kas / CR Uang Muka Pelanggan ───────
      // If isOpeningBalance: DR Ekuitas Saldo Awal (3.1) / CR Uang Muka Pelanggan
      // Normal:              DR Kas/Bank             / CR Uang Muka Pelanggan
      if (body.paymentType === 'CustomerDeposit') {
        if (party.partyType !== 'Customer' && party.partyType !== 'Both') {
          throw new BusinessError('Uang muka pelanggan hanya dapat dibuat untuk Customer.');
        }
        const depositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');

        // Determine debit account: Kas/Bank or Ekuitas Saldo Awal
        const isOpening = body.isOpeningBalance === true;
        const debitAccountId = isOpening
          ? (await systemAccounts.getAccount('OPENING_EQUITY')).id
          : body.accountId;
        const narrationPrefix = isOpening ? 'Saldo Awal Uang Muka Pelanggan' : 'Uang Muka Pelanggan';

        const jvNumber = `JV-${paymentNumber}`;
        const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
        if (existingJV) throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: parsedDate,
            narration: `${narrationPrefix}: ${paymentNumber} - ${party.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: {
              create: [
                { accountId: debitAccountId, debit: numAmount, credit: 0, description: `${narrationPrefix}: ${paymentNumber}` },
                { accountId: depositAccount.id, partyId: body.partyId, debit: 0, credit: numAmount, description: `${narrationPrefix}: ${paymentNumber}` },
              ],
            },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { date: parsedDate, accountId: debitAccountId, debit: numAmount, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `${narrationPrefix}: ${paymentNumber}`, fiscalYearId: fiscalYear.id },
            { date: parsedDate, accountId: depositAccount.id, partyId: body.partyId, debit: 0, credit: numAmount, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `${narrationPrefix}: ${paymentNumber}`, fiscalYearId: fiscalYear.id },
          ],
        });

        await updateAccountBalance(tx, debitAccountId, numAmount, 0);      // DR Kas/Bank or Ekuitas
        await updateAccountBalance(tx, depositAccount.id, 0, numAmount);   // CR Liability

        await tx.party.update({
          where: { id: body.partyId },
          data: { customerDepositBalance: { increment: numAmount } },
        });

        await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalEntry.id } });

        return { ...payment, party, unallocatedAmount: 0 };
      }

      // ── VendorRefund / CustomerRefund branch ────────────────────────────
      // Supplier sends money back to us (VendorRefund) → DR Bank / CR Hutang Usaha
      // We send money back to customer (CustomerRefund) → DR Piutang Usaha / CR Bank
      // Optionally linked to a source payment — when provided, reduces source allocation
      // and restores the linked invoice outstanding.
      if (body.paymentType === 'VendorRefund' || body.paymentType === 'CustomerRefund') {
        const isVendorRefund = body.paymentType === 'VendorRefund';
        if (isVendorRefund && party.partyType !== 'Supplier' && party.partyType !== 'Both') {
          throw new BusinessError('Refund vendor hanya berlaku untuk Supplier.');
        }
        if (!isVendorRefund && party.partyType !== 'Customer' && party.partyType !== 'Both') {
          throw new BusinessError('Refund pelanggan hanya berlaku untuk Customer.');
        }

        const liabAssetAccount = isVendorRefund
          ? await systemAccounts.getAccount('AP')
          : await systemAccounts.getAccount('AR');

        // For VendorRefund: DR Bank, CR Hutang   → bank.amount stays, hutang goes up
        // For CustomerRefund: CR Bank, DR Piutang → bank.amount stays, piutang goes up
        const bankItem = {
          accountId: body.accountId,
          partyId: null as string | null,
          debit: isVendorRefund ? numAmount : 0,
          credit: isVendorRefund ? 0 : numAmount,
          description: `Refund ${isVendorRefund ? 'Vendor' : 'Pelanggan'}: ${paymentNumber}`,
        };
        const liabAssetItem = {
          accountId: liabAssetAccount.id,
          partyId: body.partyId,
          debit: isVendorRefund ? 0 : numAmount,
          credit: isVendorRefund ? numAmount : 0,
          description: `Refund ${isVendorRefund ? 'Vendor' : 'Pelanggan'}: ${paymentNumber} — restore ${isVendorRefund ? 'hutang' : 'piutang'}`,
        };

        const jvNumber = `JV-${paymentNumber}`;
        const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
        if (existingJV) throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);

        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: parsedDate,
            narration: `Refund ${isVendorRefund ? 'Vendor' : 'Pelanggan'}: ${paymentNumber} - ${party.name}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: { create: [bankItem, liabAssetItem] },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [bankItem, liabAssetItem].map((it) => ({
            date: parsedDate,
            accountId: it.accountId,
            partyId: it.partyId,
            debit: Number(it.debit),
            credit: Number(it.credit),
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: it.description,
            fiscalYearId: fiscalYear.id,
          })),
        });

        await updateAccountBalance(tx, bankItem.accountId, Number(bankItem.debit), Number(bankItem.credit));
        await updateAccountBalance(tx, liabAssetItem.accountId, Number(liabAssetItem.debit), Number(liabAssetItem.credit));

        // If linked to source payment: reduce source allocation and restore invoice
        if (body.refundSourcePaymentId) {
          const expectedType = isVendorRefund ? 'Pay' : 'Receive';
          const source = await tx.payment.findUnique({
            where: { id: body.refundSourcePaymentId },
            include: { allocations: true },
          });
          if (!source) throw new BusinessError('Pembayaran asal tidak ditemukan.');
          if (source.partyId !== body.partyId) throw new BusinessError('Pembayaran asal bukan dari pihak yang sama.');
          if (source.paymentType !== expectedType) {
            throw new BusinessError(`Pembayaran asal harus bertipe ${expectedType}.`);
          }
          if (source.status !== 'Submitted') throw new BusinessError('Pembayaran asal sudah dibatalkan.');

          // Reduce allocations starting from latest (newest invoice first) — restore that invoice's outstanding
          let remaining = new Decimal(numAmount);
          const expectedInvoiceType = isVendorRefund ? 'PurchaseInvoice' : 'SalesInvoice';
          const sortedAllocs = [...source.allocations]
            .filter((a) => a.invoiceType === expectedInvoiceType)
            .sort((a, b) => Number(b.allocatedAmount) - Number(a.allocatedAmount));

          for (const alloc of sortedAllocs) {
            if (remaining.lte(0)) break;
            const allocAmount = new Decimal(alloc.allocatedAmount.toString());
            const reverseAmt = Decimal.min(remaining, allocAmount);
            remaining = remaining.minus(reverseAmt);
            const newAlloc = allocAmount.minus(reverseAmt);

            if (newAlloc.lte(new Decimal('0.01'))) {
              await tx.paymentAllocation.delete({ where: { id: alloc.id } });
            } else {
              await tx.paymentAllocation.update({
                where: { id: alloc.id },
                data: { allocatedAmount: newAlloc.toNumber() },
              });
            }

            // Restore invoice outstanding + status
            if (isVendorRefund) {
              const inv = await tx.purchaseInvoice.findUnique({ where: { id: alloc.invoiceId } });
              if (inv) {
                const newOutstanding = new Decimal(inv.outstanding.toString()).plus(reverseAmt);
                const newStatus = newOutstanding.gte(new Decimal(inv.grandTotal.toString()))
                  ? 'Submitted'
                  : 'PartiallyPaid';
                await tx.purchaseInvoice.update({
                  where: { id: inv.id },
                  data: { outstanding: newOutstanding.toNumber(), status: newStatus },
                });
              }
            } else {
              const inv = await tx.salesInvoice.findUnique({ where: { id: alloc.invoiceId } });
              if (inv) {
                const newOutstanding = new Decimal(inv.outstanding.toString()).plus(reverseAmt);
                const newStatus = newOutstanding.gte(new Decimal(inv.grandTotal.toString()))
                  ? 'Submitted'
                  : 'PartiallyPaid';
                await tx.salesInvoice.update({
                  where: { id: inv.id },
                  data: { outstanding: newOutstanding.toNumber(), status: newStatus },
                });
              }
            }
          }

          if (remaining.gt(new Decimal('0.01'))) {
            throw new BusinessError(
              `Nilai refund (${numAmount}) melebihi total alokasi pembayaran asal yang tersedia.`,
            );
          }
        }

        await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalEntry.id } });
        await recalcPartyOutstanding(tx, body.partyId);

        return { ...payment, party, unallocatedAmount: 0 };
      }

      // ── Receive / Pay branch ────────────────────────────────────────────
      const arAccount = await systemAccounts.getAccount('AR');
      const apAccount = await systemAccounts.getAccount('AP');

      // Build split list:
      // - If body.splits provided & non-empty → multi-account distribution
      //   (e.g. invoice 280jt → BCA 270jt + Petty 7.5jt + Beban Komisi 2.5jt)
      // - Otherwise fall back to single accountId for backward compat
      const useSplits = Array.isArray(body.splits) && body.splits.length > 0;
      const splits = useSplits
        ? body.splits!
        : [{ accountId: body.accountId, amount: numAmount, notes: null as string | null }];

      // Validate sum equals payment amount (within rounding tolerance)
      const splitsSum = splits.reduce((s, sp) => s.plus(new Decimal(sp.amount)), new Decimal(0));
      if (splitsSum.minus(new Decimal(numAmount)).abs().gt(new Decimal('0.01'))) {
        throw new BusinessError(
          `Total split (${splitsSum.toFixed(2)}) tidak sama dengan jumlah pembayaran (${numAmount.toFixed(2)}).`,
        );
      }

      // Persist split records (always — even single-account paths get 1 row, simplifies cancel)
      if (useSplits) {
        await tx.paymentSplit.createMany({
          data: splits.map((sp) => ({
            paymentId: payment.id,
            accountId: sp.accountId,
            amount: sp.amount,
            notes: sp.notes ?? null,
          })),
        });
      }

      // Check journal entry number uniqueness before creating
      const jvNumber = `JV-${paymentNumber}`;
      const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
      if (existingJV) {
        throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);
      }

      // Build journal items:
      //   Receive: each split → DR (account); single CR AR for total
      //   Pay:     each split → CR (account); single DR AP for total
      const splitItems = splits.map((sp) => ({
        accountId: sp.accountId,
        partyId: body.paymentType === 'Pay' ? body.partyId : null,
        debit: body.paymentType === 'Receive' ? sp.amount : 0,
        credit: body.paymentType === 'Receive' ? 0 : sp.amount,
        description: `Pembayaran: ${paymentNumber}${sp.notes ? ` — ${sp.notes}` : ''}`,
      }));
      const arApItem = body.paymentType === 'Receive'
        ? {
            accountId: arAccount.id,
            partyId: body.partyId,
            debit: 0,
            credit: numAmount,
            description: `Pembayaran: ${paymentNumber}`,
          }
        : {
            accountId: apAccount.id,
            partyId: body.partyId,
            debit: numAmount,
            credit: 0,
            description: `Pembayaran: ${paymentNumber}`,
          };

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration: `Pembayaran ${body.paymentType}: ${paymentNumber} - ${party.name}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [...splitItems, arApItem],
          },
        },
      });

      // Ledger entries — mirror journal items
      await tx.accountingLedgerEntry.createMany({
        data: [
          ...splitItems.map((it) => ({
            date: parsedDate,
            accountId: it.accountId,
            partyId: it.partyId,
            debit: Number(it.debit),
            credit: Number(it.credit),
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: it.description,
            fiscalYearId: fiscalYear.id,
          })),
          {
            date: parsedDate,
            accountId: arApItem.accountId,
            partyId: arApItem.partyId,
            debit: Number(arApItem.debit),
            credit: Number(arApItem.credit),
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: arApItem.description,
            fiscalYearId: fiscalYear.id,
          },
        ],
      });

      // Update balances per split
      for (const it of splitItems) {
        await updateAccountBalance(tx, it.accountId, Number(it.debit), Number(it.credit));
      }
      await updateAccountBalance(tx, arApItem.accountId, Number(arApItem.debit), Number(arApItem.credit));

      // Link payment → journal entry so cancel-from-GL guard can detect it
      await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalEntry.id } });

      // Auto-allocate payment to oldest outstanding invoices
      const unallocatedAmount = await autoAllocatePayment(tx, payment.id, body.partyId, body.paymentType, numAmount);

      // Reduce opening balance with unallocated remainder (pre-app receivables/payables)
      if (unallocatedAmount > 0.01) {
        const currentParty = await tx.party.findUnique({
          where: { id: body.partyId },
          select: { openingOutstanding: true },
        });
        const openingBal = new Decimal(currentParty?.openingOutstanding?.toString() ?? '0');
        if (openingBal.gt(0)) {
          const reduction = Decimal.min(new Decimal(unallocatedAmount), openingBal).toNumber();
          await tx.party.update({
            where: { id: body.partyId },
            data: { openingOutstanding: { decrement: reduction } },
          });
          const finalUnallocated = new Decimal(unallocatedAmount).minus(new Decimal(reduction)).toNumber();
          if (finalUnallocated > 0.01) {
            logger.warn({ paymentId: payment.id, unallocatedAmount: finalUnallocated }, 'Overpayment: sisa pembayaran tidak teralokasi');
          }
        } else {
          logger.warn({ paymentId: payment.id, unallocatedAmount }, 'Overpayment: sisa pembayaran tidak teralokasi');
        }
      }

      // Recalc party outstanding from invoice data + opening balance (source of truth)
      await recalcPartyOutstanding(tx, body.partyId);

      return { ...payment, party, unallocatedAmount };
    }, { timeout: 15000 }); // 15s timeout for advisory lock safety

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /payments', 'Gagal menyimpan pembayaran.');
  }
});

// POST /api/payments/:id/cancel — cancel payment and reverse allocations
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const payment = await tx.payment.findUnique({
        where: { id: req.params.id as string },
        include: { party: true },
      });
      if (!payment) throw new BusinessError('Pembayaran tidak ditemukan.');
      if (payment.status === 'Cancelled') throw new BusinessError('Pembayaran sudah dibatalkan.');

      const numAmount = new Decimal(payment.amount.toString());

      // VendorDeposit / CustomerDeposit harus dibatalkan via endpoint khusus
      // (PATCH /vendor-deposits/:id/cancel atau PATCH /customer-deposits/:id/cancel).
      // Branch ini sebelumnya menyebabkan double-cancel & GL drift bila dipanggil
      // bersamaan dengan endpoint khusus.
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

      // ── Receive / Pay cancel branch ─────────────────────────────────────
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

/**
 * Auto-allocate the payment amount to outstanding invoices (oldest-first).
 */
async function autoAllocatePayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  partyId: string,
  paymentType: string,
  amount: number
): Promise<number> {
  let remaining = new Decimal(amount);

  // Lock invoice rows to prevent concurrent allocation
  if (paymentType === 'Receive') {
    await tx.$queryRaw`SELECT id FROM sales_invoices WHERE party_id = ${partyId} AND status IN ('Submitted', 'PartiallyPaid', 'Overdue') FOR UPDATE`;
  } else {
    await tx.$queryRaw`SELECT id FROM purchase_invoices WHERE party_id = ${partyId} AND status IN ('Submitted', 'PartiallyPaid', 'Overdue') FOR UPDATE`;
  }

  if (paymentType === 'Receive') {
    const invoices = await tx.salesInvoice.findMany({
      where: { partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
      orderBy: { date: 'asc' },
    });

    for (const inv of invoices) {
      if (remaining.lte(0)) break;
      const outstanding = new Decimal(inv.outstanding.toString());
      const allocate = Decimal.min(remaining, outstanding);
      remaining = remaining.minus(allocate);

      const newOutstanding = outstanding.minus(allocate);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';

      await tx.salesInvoice.update({
        where: { id: inv.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceType: 'SalesInvoice',
          invoiceId: inv.id,
          allocatedAmount: allocate.toNumber(),
        },
      });
    }
  } else {
    const invoices = await tx.purchaseInvoice.findMany({
      where: { partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] } },
      orderBy: { date: 'asc' },
    });

    for (const inv of invoices) {
      if (remaining.lte(0)) break;
      const outstanding = new Decimal(inv.outstanding.toString());
      const allocate = Decimal.min(remaining, outstanding);
      remaining = remaining.minus(allocate);

      const newOutstanding = outstanding.minus(allocate);
      const newStatus = newOutstanding.lte(new Decimal('0.01')) ? 'Paid' : 'PartiallyPaid';

      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { outstanding: newOutstanding.toNumber(), status: newStatus },
      });

      await tx.paymentAllocation.create({
        data: {
          paymentId,
          invoiceType: 'PurchaseInvoice',
          invoiceId: inv.id,
          allocatedAmount: allocate.toNumber(),
        },
      });
    }
  }

  return remaining.gt(0) ? remaining.toNumber() : 0;
}

export default router;
