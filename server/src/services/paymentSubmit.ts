import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { systemAccounts } from './systemAccounts';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export type PaymentType =
  | 'Receive'
  | 'Pay'
  | 'VendorDeposit'
  | 'CustomerDeposit'
  | 'VendorRefund'
  | 'CustomerRefund';

export interface PaymentSplit {
  accountId: string;
  amount: number;
  notes?: string | null;
}

export interface SubmitPaymentInput {
  date: string;
  partyId: string;
  paymentType: PaymentType;
  accountId: string;
  amount: number;
  splits?: PaymentSplit[] | null;
  referenceNo?: string | null;
  notes?: string | null;
  isOpeningBalance?: boolean;
  refundSourcePaymentId?: string | null;
  salesOrderId?: string | null;
  proformaInvoiceId?: string | null;
}

/**
 * Submit a payment. Journal by paymentType:
 *   - VendorDeposit:   DR Uang Muka Vendor / CR Kas (or Ekuitas if opening)
 *   - CustomerDeposit: DR Kas / CR Uang Muka Pelanggan (or Ekuitas if opening)
 *   - VendorRefund:    DR Bank / CR Hutang Usaha — supplier returns money;
 *                      optionally reduces a source Pay payment's allocations
 *   - CustomerRefund:  DR Piutang Usaha / CR Bank — we return money to customer
 *   - Receive:         DR Kas (multi-split) / CR Piutang Usaha — auto-allocate
 *                      to oldest open sales invoices
 *   - Pay:             DR Hutang Usaha / CR Kas (multi-split) — auto-allocate
 *                      to oldest open purchase invoices
 * Receive/Pay return the unallocated remainder (overpayment is logged and reduces opening balance).
 */
export async function submitPaymentInTx(
  tx: Tx,
  body: SubmitPaymentInput,
  userId: string,
): Promise<{ payment: Awaited<ReturnType<Tx['payment']['create']>>; party: Awaited<ReturnType<Tx['party']['findUnique']>>; unallocatedAmount: number }> {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  // Skip cash-account validation for opening-balance deposits (they DR/CR
  // Ekuitas Saldo Awal instead).
  const isOpeningDeposit =
    body.isOpeningBalance === true &&
    (body.paymentType === 'VendorDeposit' || body.paymentType === 'CustomerDeposit');
  if (!isOpeningDeposit) {
    const bankAccount = await tx.account.findUnique({ where: { id: body.accountId } });
    if (!bankAccount) throw new BusinessError('Akun kas/bank tidak ditemukan.');
    const isCashAccount = await systemAccounts.isCashAccount(bankAccount.accountNumber);
    if (!isCashAccount) throw new BusinessError('Akun yang dipilih bukan akun kas/bank.');
  }

  const party = await tx.party.findUnique({ where: { id: body.partyId } });
  if (!party) throw new BusinessError('Data mitra tidak ditemukan.');
  if (!party.isActive) throw new BusinessError('Mitra sudah tidak aktif.');

  // Tag Proforma hanya untuk CustomerDeposit; proforma harus aktif dan milik customer yang sama.
  let proformaInvoiceId: string | null = null;
  if (body.paymentType === 'CustomerDeposit' && body.proformaInvoiceId) {
    const pf = await tx.proformaInvoice.findUnique({ where: { id: body.proformaInvoiceId } });
    if (!pf) throw new BusinessError('Proforma Invoice tidak ditemukan.');
    if (pf.status === 'Cancelled') throw new BusinessError('Proforma Invoice sudah dibatalkan.');
    if (pf.partyId !== body.partyId) throw new BusinessError('Customer pada uang muka tidak sama dengan Proforma Invoice.');
    proformaInvoiceId = pf.id;
  }

  const paymentNumber = await generateDocumentNumber(tx, 'PAY', parsedDate, fiscalYear.id);
  const numAmount = body.amount;

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
      // Tag SO hanya untuk CustomerDeposit (uang muka pesanan).
      salesOrderId: body.paymentType === 'CustomerDeposit' ? (body.salesOrderId ?? null) : null,
      proformaInvoiceId,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
    },
  });

  // VendorDeposit
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
        createdBy: userId,
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
    return { payment, party, unallocatedAmount: 0 };
  }

  // CustomerDeposit
  if (body.paymentType === 'CustomerDeposit') {
    if (party.partyType !== 'Customer' && party.partyType !== 'Both') {
      throw new BusinessError('Uang muka customer hanya dapat dibuat untuk Customer.');
    }
    const depositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');
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
        createdBy: userId,
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

    await updateAccountBalance(tx, debitAccountId, numAmount, 0);
    await updateAccountBalance(tx, depositAccount.id, 0, numAmount);

    await tx.party.update({
      where: { id: body.partyId },
      data: { customerDepositBalance: { increment: numAmount } },
    });

    await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalEntry.id } });
    return { payment, party, unallocatedAmount: 0 };
  }

  // VendorRefund / CustomerRefund
  if (body.paymentType === 'VendorRefund' || body.paymentType === 'CustomerRefund') {
    const isVendorRefund = body.paymentType === 'VendorRefund';
    if (isVendorRefund && party.partyType !== 'Supplier' && party.partyType !== 'Both') {
      throw new BusinessError('Refund supplier hanya berlaku untuk Supplier.');
    }
    if (!isVendorRefund && party.partyType !== 'Customer' && party.partyType !== 'Both') {
      throw new BusinessError('Refund customer hanya berlaku untuk Customer.');
    }

    const liabAssetAccount = isVendorRefund
      ? await systemAccounts.getAccount('AP')
      : await systemAccounts.getAccount('AR');

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
      description: `Refund ${isVendorRefund ? 'Vendor' : 'Pelanggan'}: ${paymentNumber} (restore ${isVendorRefund ? 'hutang' : 'piutang'})`,
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
        createdBy: userId,
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

    // Link to source payment: reduce its allocations and restore invoice
    // outstanding starting from newest invoice. Throws if refund exceeds
    // available allocations.
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
    return { payment, party, unallocatedAmount: 0 };
  }

  // Receive / Pay
  const arAccount = await systemAccounts.getAccount('AR');
  const apAccount = await systemAccounts.getAccount('AP');

  // Multi-account splits (e.g. invoice 280jt → BCA 270jt + Petty 7.5jt +
  // Beban Komisi 2.5jt) vs single account fallback.
  const useSplits = Array.isArray(body.splits) && body.splits.length > 0;
  const splits = useSplits
    ? body.splits!
    : [{ accountId: body.accountId, amount: numAmount, notes: null as string | null }];

  const splitsSum = splits.reduce((s, sp) => s.plus(new Decimal(sp.amount)), new Decimal(0));
  if (splitsSum.minus(new Decimal(numAmount)).abs().gt(new Decimal('0.01'))) {
    throw new BusinessError(
      `Total split (${splitsSum.toFixed(2)}) tidak sama dengan jumlah pembayaran (${numAmount.toFixed(2)}).`,
    );
  }

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

  const jvNumber = `JV-${paymentNumber}`;
  const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
  if (existingJV) throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);

  const splitItems = splits.map((sp) => ({
    accountId: sp.accountId,
    partyId: body.paymentType === 'Pay' ? body.partyId : null,
    debit: body.paymentType === 'Receive' ? sp.amount : 0,
    credit: body.paymentType === 'Receive' ? 0 : sp.amount,
    description: `Pembayaran: ${paymentNumber}${sp.notes ? ` (${sp.notes})` : ''}`,
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
      createdBy: userId,
      submittedAt: new Date(),
      items: { create: [...splitItems, arApItem] },
    },
  });

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

  for (const it of splitItems) {
    await updateAccountBalance(tx, it.accountId, Number(it.debit), Number(it.credit));
  }
  await updateAccountBalance(tx, arApItem.accountId, Number(arApItem.debit), Number(arApItem.credit));

  await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: journalEntry.id } });

  const unallocatedAmount = await autoAllocatePayment(
    tx,
    payment.id,
    body.partyId,
    body.paymentType,
    numAmount,
  );

  // Apply unallocated remainder to opening balance (covers pre-app
  // receivables/payables that aren't in the invoice table).
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

  await recalcPartyOutstanding(tx, body.partyId);
  return { payment, party, unallocatedAmount };
}

/**
 * Auto-allocate a Receive/Pay payment to outstanding invoices (oldest-first).
 * Locks invoice rows with FOR UPDATE to prevent concurrent allocation drift.
 * Returns the unallocated remainder.
 */
async function autoAllocatePayment(
  tx: Tx,
  paymentId: string,
  partyId: string,
  paymentType: string,
  amount: number,
): Promise<number> {
  let remaining = new Decimal(amount);

  if (paymentType === 'Receive') {
    await tx.$queryRaw`SELECT id FROM sales_invoices WHERE party_id = ${partyId} AND status IN ('Submitted', 'PartiallyPaid', 'Overdue') FOR UPDATE`;
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
    await tx.$queryRaw`SELECT id FROM purchase_invoices WHERE party_id = ${partyId} AND status IN ('Submitted', 'PartiallyPaid', 'Overdue') FOR UPDATE`;
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
