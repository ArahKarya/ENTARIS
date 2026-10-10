import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { updateBalancesForItems, recalcPartyOutstanding } from '../utils/accountBalance';
import { BusinessError } from '../utils/errors';

/**
 * GA/EAM bill posting (vehicle tax, EAM service logs, spare-part MRs). Two paths:
 *   Journal (paid now):          DR expense / CR cash-bank
 *   Purchase invoice (billed):   DR expense / CR 2.1.1 Hutang Usaha, settled via Payments
 * Each GA document has at most one journal (unique journal_entry_id); cancel before re-posting.
 */

type Tx = Prisma.TransactionClient;

export const ACC_VEHICLE_TAX = '6.41'; // Vehicle tax & licensing expense. 6.17 is income tax expense, not vehicle tax; entries before Aug 2026 sit in 6.7.
export const ACC_VEHICLE_MAINTENANCE = '6.7'; // Beban Pemeliharaan Kendaraan
export const ACC_AP = '2.1.1'; // Hutang Usaha
export const ACC_CASH_FALLBACK = '1.1.1';

export type GaBillKind = 'VEHICLE_TAX' | 'SERVICE_LOG' | 'MATERIAL_REQUEST';
export type GaPayMethod = 'JOURNAL' | 'PURCHASE_INVOICE';

export interface PayGaBillArgs {
  kind: GaBillKind;
  id: string;
  method: GaPayMethod;
  /** Akun beban (debit). Kalau kosong dipakai default per jenis tagihan. */
  accountId?: string | null;
  /** Akun kas/bank (kredit) — hanya untuk method JOURNAL. */
  creditAccountId?: string | null;
  /** Vendor — wajib untuk method PURCHASE_INVOICE. */
  partyId?: string | null;
  /** Override nominal (default ambil dari dokumen GA). */
  amount?: number | null;
  /** Tanggal transaksi (default tanggal dokumen GA). */
  date?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  userId: string;
}

async function accountByNumber(tx: Tx, accountNumber: string) {
  const acc = await tx.account.findFirst({
    where: { accountNumber, isGroup: false },
    select: { id: true, accountNumber: true, name: true },
  });
  if (!acc) {
    throw new BusinessError(`Akun ${accountNumber} tidak ditemukan di COA. Pilih akun secara manual.`);
  }
  return acc;
}

async function assertDetailAccount(tx: Tx, accountId: string, label: string) {
  const acc = await tx.account.findUnique({
    where: { id: accountId },
    select: { id: true, isGroup: true, accountNumber: true, name: true },
  });
  if (!acc || acc.isGroup) throw new BusinessError(`${label} tidak valid (harus akun detail, bukan grup).`);
  return acc;
}

async function resolveCashAccount(tx: Tx, creditAccountId?: string | null) {
  if (creditAccountId) return assertDetailAccount(tx, creditAccountId, 'Akun sumber dana');
  const mapping = await tx.systemAccountMapping.findFirst({
    where: { role: 'CASH' },
    orderBy: { sortOrder: 'asc' },
    select: { accountId: true },
  });
  if (mapping?.accountId) return assertDetailAccount(tx, mapping.accountId, 'Akun sumber dana');
  return accountByNumber(tx, ACC_CASH_FALLBACK);
}

/** Bikin JE 2 baris + ledger + update saldo. Dipakai jalur JOURNAL. */
async function createSimpleJournal(
  tx: Tx,
  opts: {
    date: Date;
    narration: string;
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    partyId?: string | null;
    userId: string;
  },
) {
  if (opts.debitAccountId === opts.creditAccountId) {
    throw new BusinessError('Akun beban dan akun sumber dana tidak boleh sama.');
  }
  const fiscalYear = await getOpenFiscalYear(tx, opts.date);
  const entryNumber = await generateDocumentNumber(tx, 'JV', opts.date, fiscalYear.id);

  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber,
      date: opts.date,
      narration: opts.narration,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: opts.userId,
      submittedAt: new Date(),
      items: {
        create: [
          { accountId: opts.debitAccountId, debit: opts.amount, credit: 0, description: opts.narration },
          {
            accountId: opts.creditAccountId,
            partyId: opts.partyId ?? null,
            debit: 0,
            credit: opts.amount,
            description: opts.narration,
          },
        ],
      },
    },
    include: { items: true },
  });

  await tx.accountingLedgerEntry.createMany({
    data: journalEntry.items.map((item) => ({
      date: opts.date,
      accountId: item.accountId,
      partyId: item.partyId ?? null,
      debit: item.debit,
      credit: item.credit,
      referenceType: 'JournalEntry',
      referenceId: journalEntry.id,
      description: opts.narration,
      fiscalYearId: fiscalYear.id,
    })),
  });

  await updateBalancesForItems(
    tx,
    journalEntry.items.map((i) => ({
      accountId: i.accountId,
      debit: Number(i.debit),
      credit: Number(i.credit),
    })),
  );

  if (opts.partyId) await recalcPartyOutstanding(tx, opts.partyId);

  return journalEntry;
}

/**
 * Non-inventory expense purchase invoice + JE. Deliberately not submitPurchaseInvoiceInTx,
 * which forces DR Persediaan; GA bills are direct expenses, not warehouse stock.
 */
async function createExpensePurchaseInvoice(
  tx: Tx,
  opts: {
    date: Date;
    dueDate?: Date | null;
    partyId: string;
    expenseAccountId: string;
    amount: number;
    itemName: string;
    /** 'service' for tax / vehicle service bills, 'product' for spare parts. */
    itemType: 'product' | 'service';
    narration: string;
    notes?: string | null;
    userId: string;
  },
) {
  const party = await tx.party.findUnique({ where: { id: opts.partyId } });
  if (!party) throw new BusinessError('Data supplier tidak ditemukan.');
  if (!party.isActive) throw new BusinessError('Supplier sudah tidak aktif.');

  const fiscalYear = await getOpenFiscalYear(tx, opts.date);
  const apAccount = await accountByNumber(tx, ACC_AP);
  const invoiceNumber = await generateDocumentNumber(tx, 'PI', opts.date, fiscalYear.id);
  const total = new Decimal(opts.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  const invoice = await tx.purchaseInvoice.create({
    data: {
      invoiceNumber,
      date: opts.date,
      dueDate: opts.dueDate ?? null,
      partyId: opts.partyId,
      grandTotal: total,
      outstanding: total,
      taxPct: 0,
      potongan: 0,
      biayaLain: 0,
      status: 'Submitted',
      notes: opts.notes || null,
      fiscalYearId: fiscalYear.id,
      createdBy: opts.userId,
      submittedAt: new Date(),
      items: {
        create: [
          {
            itemName: opts.itemName,
            itemType: opts.itemType,
            quantity: 1,
            unit: 'ls',
            rate: total,
            discount: 0,
            amount: total,
            taxPct: 0,
            pphPct: 0,
            potonganItem: 0,
            accountId: opts.expenseAccountId,
            description: opts.narration,
          },
        ],
      },
    },
    include: { supplier: true, items: true },
  });

  const jvNumber = `JV-${invoice.invoiceNumber}`;
  const jeItems = [
    {
      accountId: opts.expenseAccountId,
      partyId: null as string | null,
      debit: total,
      credit: 0,
      description: `${opts.narration}: ${invoice.invoiceNumber}`,
    },
    {
      accountId: apAccount.id,
      partyId: opts.partyId,
      debit: 0,
      credit: total,
      description: `Hutang: ${invoice.invoiceNumber}`,
    },
  ];

  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber: jvNumber,
      date: opts.date,
      narration: `${opts.narration} - ${invoice.supplier.name}`,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: opts.userId,
      submittedAt: new Date(),
      items: { create: jeItems },
    },
  });

  await tx.accountingLedgerEntry.createMany({
    data: jeItems.map((it) => ({
      date: opts.date,
      accountId: it.accountId,
      partyId: it.partyId ?? null,
      debit: it.debit,
      credit: it.credit,
      referenceType: 'JournalEntry',
      referenceId: journalEntry.id,
      description: it.description,
      fiscalYearId: fiscalYear.id,
    })),
  });

  await updateBalancesForItems(
    tx,
    jeItems.map((i) => ({ accountId: i.accountId, debit: i.debit, credit: i.credit })),
  );
  await recalcPartyOutstanding(tx, opts.partyId);

  return { invoice, journalEntry };
}

/** Soft-cancel JE + balikkan saldo. Dipakai semua jalur pembatalan GA. */
export async function cancelJournalInTx(tx: Tx, journalEntryId: string) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { items: true },
  });
  if (!entry) throw new BusinessError('Jurnal tidak ditemukan.');
  if (entry.status === 'Cancelled') return entry;

  await updateBalancesForItems(
    tx,
    entry.items.map((i) => ({
      accountId: i.accountId,
      debit: Number(i.credit),
      credit: Number(i.debit),
    })),
  );
  await tx.journalEntry.update({
    where: { id: entry.id },
    data: { status: 'Cancelled', cancelledAt: new Date() },
  });
  await tx.accountingLedgerEntry.updateMany({
    where: { referenceId: entry.id, isCancelled: false },
    data: { isCancelled: true },
  });
  const partyIds = Array.from(
    new Set(entry.items.map((i) => i.partyId).filter((p): p is string => !!p)),
  );
  for (const pid of partyIds) await recalcPartyOutstanding(tx, pid);
  return entry;
}

// Vehicle tax / STNK / KIR

export async function payVehicleTaxInTx(tx: Tx, args: PayGaBillArgs) {
  const tax = await tx.gaVehicleTax.findUnique({
    where: { id: args.id },
    include: { asset: { select: { code: true, name: true } } },
  });
  if (!tax) throw new BusinessError('Data pajak kendaraan tidak ditemukan.');
  if (tax.journalEntryId) {
    throw new BusinessError('Pajak ini sudah dibayar/terjurnal. Batalkan dulu sebelum posting ulang.');
  }

  const amount = Number(args.amount ?? tax.amount ?? 0);
  if (!(amount > 0)) throw new BusinessError('Nominal pajak harus lebih besar dari 0.');

  const date = args.date ? new Date(args.date) : new Date(tax.dueDate);
  if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');

  const debitAcc = args.accountId
    ? await assertDetailAccount(tx, args.accountId, 'Akun beban')
    : await accountByNumber(tx, ACC_VEHICLE_TAX);

  const plat = tax.asset?.name ?? tax.asset?.code ?? '-';
  const label = `${tax.type.replace(/_/g, ' ')} ${plat} TA ${tax.periodYear}`;
  const narration = `Pembayaran ${label}`;

  let journalEntryId: string;
  let purchaseInvoiceId: string | null = null;
  let creditAccountId: string | null = null;

  if (args.method === 'PURCHASE_INVOICE') {
    if (!args.partyId) throw new BusinessError('Supplier wajib dipilih untuk jalur Invoice Pembelian.');
    const { invoice, journalEntry } = await createExpensePurchaseInvoice(tx, {
      date,
      dueDate: args.dueDate ? new Date(args.dueDate) : null,
      partyId: args.partyId,
      expenseAccountId: debitAcc.id,
      amount,
      itemName: label,
      itemType: 'service',
      narration,
      notes: args.notes ?? tax.notes,
      userId: args.userId,
    });
    journalEntryId = journalEntry.id;
    purchaseInvoiceId = invoice.id;
    creditAccountId = (await accountByNumber(tx, ACC_AP)).id;
  } else {
    const cashAcc = await resolveCashAccount(tx, args.creditAccountId);
    const je = await createSimpleJournal(tx, {
      date,
      narration,
      debitAccountId: debitAcc.id,
      creditAccountId: cashAcc.id,
      amount,
      userId: args.userId,
    });
    journalEntryId = je.id;
    creditAccountId = cashAcc.id;
  }

  return tx.gaVehicleTax.update({
    where: { id: tax.id },
    data: {
      status: 'PAID',
      paidAt: date,
      paidAmount: amount,
      paidById: args.userId,
      journalEntryId,
      purchaseInvoiceId,
      accountId: debitAcc.id,
      creditAccountId,
    },
  });
}

export async function cancelVehicleTaxPaymentInTx(tx: Tx, id: string) {
  const tax = await tx.gaVehicleTax.findUnique({ where: { id } });
  if (!tax) throw new BusinessError('Data pajak kendaraan tidak ditemukan.');
  if (!tax.journalEntryId) throw new BusinessError('Pajak ini belum memiliki jurnal.');

  if (tax.purchaseInvoiceId) {
    const inv = await tx.purchaseInvoice.findUnique({
      where: { id: tax.purchaseInvoiceId },
      select: { id: true, grandTotal: true, outstanding: true, status: true, invoiceNumber: true },
    });
    if (inv && inv.status !== 'Cancelled') {
      if (Number(inv.outstanding) !== Number(inv.grandTotal)) {
        throw new BusinessError(
          `Invoice ${inv.invoiceNumber} sudah dibayar sebagian/lunas. Batalkan pembayarannya dulu di modul Pembayaran.`,
        );
      }
      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { status: 'Cancelled', cancelledAt: new Date(), outstanding: 0 },
      });
    }
  }

  await cancelJournalInTx(tx, tax.journalEntryId);

  return tx.gaVehicleTax.update({
    where: { id },
    data: {
      status: 'IN_PROCESS',
      paidAt: null,
      paidAmount: null,
      paidById: null,
      journalEntryId: null,
      purchaseInvoiceId: null,
    },
  });
}

// Service log (purchase invoice path; the journal path is in gaVehicleServiceJournal)

export async function payServiceLogViaInvoiceInTx(tx: Tx, args: PayGaBillArgs) {
  const log = await tx.gaVehicleServiceLog.findUnique({
    where: { id: args.id },
    include: { asset: { select: { code: true, name: true } } },
  });
  if (!log) throw new BusinessError('Service log tidak ditemukan.');
  if (log.journalEntryId) {
    throw new BusinessError('Service log ini sudah terjurnal. Batalkan dulu sebelum posting ulang.');
  }
  if (log.source !== 'EAM') {
    throw new BusinessError(
      `Service log bersumber "${log.source}" (data historis) tidak dapat diposting karena nilainya sudah tercatat di GL lewat input manual.`,
    );
  }
  if (!args.partyId) throw new BusinessError('Supplier/bengkel wajib dipilih untuk jalur Invoice Pembelian.');

  const amount = Number(args.amount ?? log.biaya ?? 0);
  if (!(amount > 0)) throw new BusinessError('Biaya service harus lebih besar dari 0.');

  const date = args.date ? new Date(args.date) : new Date(log.tanggal);
  const debitAcc = args.accountId
    ? await assertDetailAccount(tx, args.accountId, 'Akun beban')
    : await accountByNumber(tx, ACC_VEHICLE_MAINTENANCE);

  const plat = log.asset?.name ?? log.asset?.code ?? '-';
  const narration = `Biaya service kendaraan ${plat}: ${log.deskripsi}`;

  const { invoice, journalEntry } = await createExpensePurchaseInvoice(tx, {
    date,
    dueDate: args.dueDate ? new Date(args.dueDate) : null,
    partyId: args.partyId,
    expenseAccountId: debitAcc.id,
    amount,
    itemName: `Service ${plat}: ${log.deskripsi}`.slice(0, 200),
    itemType: 'service',
    narration,
    notes: args.notes ?? null,
    userId: args.userId,
  });

  const apAccount = await accountByNumber(tx, ACC_AP);

  return tx.gaVehicleServiceLog.update({
    where: { id: log.id },
    data: {
      journalEntryId: journalEntry.id,
      purchaseInvoiceId: invoice.id,
      accountId: debitAcc.id,
      creditAccountId: apAccount.id,
    },
  });
}

export async function cancelServiceLogInvoiceInTx(tx: Tx, id: string) {
  const log = await tx.gaVehicleServiceLog.findUnique({ where: { id } });
  if (!log) throw new BusinessError('Service log tidak ditemukan.');
  if (!log.journalEntryId) throw new BusinessError('Service log ini belum memiliki jurnal.');

  if (log.purchaseInvoiceId) {
    const inv = await tx.purchaseInvoice.findUnique({
      where: { id: log.purchaseInvoiceId },
      select: { id: true, grandTotal: true, outstanding: true, status: true, invoiceNumber: true },
    });
    if (inv && inv.status !== 'Cancelled') {
      if (Number(inv.outstanding) !== Number(inv.grandTotal)) {
        throw new BusinessError(
          `Invoice ${inv.invoiceNumber} sudah dibayar sebagian/lunas. Batalkan pembayarannya dulu di modul Pembayaran.`,
        );
      }
      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { status: 'Cancelled', cancelledAt: new Date(), outstanding: 0 },
      });
    }
  }

  await cancelJournalInTx(tx, log.journalEntryId);

  return tx.gaVehicleServiceLog.update({
    where: { id },
    data: { journalEntryId: null, purchaseInvoiceId: null },
  });
}

// Material request (spare parts)

export async function payMaterialRequestInTx(tx: Tx, args: PayGaBillArgs) {
  const mr = await tx.gaMaterialRequest.findUnique({
    where: { id: args.id },
    include: {
      items: true,
      asset: { select: { code: true, name: true } },
    },
  });
  if (!mr) throw new BusinessError('Material Request tidak ditemukan.');
  if (mr.journalEntryId) {
    throw new BusinessError('MR ini sudah terjurnal. Batalkan dulu sebelum posting ulang.');
  }
  if (!['APPROVED', 'FULFILLED'].includes(mr.status)) {
    throw new BusinessError(
      `MR berstatus ${mr.status} belum bisa dibayar. Hanya MR APPROVED atau FULFILLED yang masuk antrian keuangan.`,
    );
  }

  const itemsTotal = mr.items.reduce(
    (s, it) => s.plus(new Decimal(it.unitPrice.toString()).times(it.quantity.toString())),
    new Decimal(0),
  );
  const amount = Number(args.amount ?? itemsTotal.toNumber());
  if (!(amount > 0)) {
    throw new BusinessError('Total nilai MR harus lebih besar dari 0. Lengkapi harga satuan di item MR dulu.');
  }

  const date = args.date ? new Date(args.date) : new Date(mr.approvedAt ?? mr.requestedAt);
  const debitAcc = args.accountId
    ? await assertDetailAccount(tx, args.accountId, 'Akun beban')
    : await accountByNumber(tx, ACC_VEHICLE_MAINTENANCE);

  const target = mr.asset?.name ?? mr.machineTarget ?? '-';
  const narration = `Pengadaan sparepart ${mr.code}: ${target}`;

  let journalEntryId: string;
  let purchaseInvoiceId: string | null = null;
  let creditAccountId: string | null = null;

  if (args.method === 'PURCHASE_INVOICE') {
    if (!args.partyId) throw new BusinessError('Supplier wajib dipilih untuk jalur Invoice Pembelian.');
    const { invoice, journalEntry } = await createExpensePurchaseInvoice(tx, {
      date,
      dueDate: args.dueDate ? new Date(args.dueDate) : null,
      partyId: args.partyId,
      expenseAccountId: debitAcc.id,
      amount,
      itemName: `Sparepart ${mr.code}`,
      itemType: 'product',
      narration,
      notes: args.notes ?? mr.notes,
      userId: args.userId,
    });
    journalEntryId = journalEntry.id;
    purchaseInvoiceId = invoice.id;
    creditAccountId = (await accountByNumber(tx, ACC_AP)).id;
  } else {
    const cashAcc = await resolveCashAccount(tx, args.creditAccountId);
    const je = await createSimpleJournal(tx, {
      date,
      narration,
      debitAccountId: debitAcc.id,
      creditAccountId: cashAcc.id,
      amount,
      userId: args.userId,
    });
    journalEntryId = je.id;
    creditAccountId = cashAcc.id;
  }

  return tx.gaMaterialRequest.update({
    where: { id: mr.id },
    data: {
      status: 'PAID',
      paidAt: date,
      paidAmount: amount,
      paidById: args.userId,
      journalEntryId,
      purchaseInvoiceId,
      glAccountId: debitAcc.id,
      creditAccountId,
    },
  });
}

export async function cancelMaterialRequestPaymentInTx(tx: Tx, id: string) {
  const mr = await tx.gaMaterialRequest.findUnique({ where: { id } });
  if (!mr) throw new BusinessError('Material Request tidak ditemukan.');
  if (!mr.journalEntryId) throw new BusinessError('MR ini belum memiliki jurnal.');

  if (mr.purchaseInvoiceId) {
    const inv = await tx.purchaseInvoice.findUnique({
      where: { id: mr.purchaseInvoiceId },
      select: { id: true, grandTotal: true, outstanding: true, status: true, invoiceNumber: true },
    });
    if (inv && inv.status !== 'Cancelled') {
      if (Number(inv.outstanding) !== Number(inv.grandTotal)) {
        throw new BusinessError(
          `Invoice ${inv.invoiceNumber} sudah dibayar sebagian/lunas. Batalkan pembayarannya dulu di modul Pembayaran.`,
        );
      }
      await tx.purchaseInvoice.update({
        where: { id: inv.id },
        data: { status: 'Cancelled', cancelledAt: new Date(), outstanding: 0 },
      });
    }
  }

  await cancelJournalInTx(tx, mr.journalEntryId);

  // Kembalikan ke status sebelum bayar. FULFILLED kalau semua item sudah diterima.
  const items = await tx.gaMaterialRequestItem.findMany({ where: { materialRequestId: id } });
  const allReceived =
    items.length > 0 && items.every((it) => Number(it.receivedQty) >= Number(it.quantity));

  return tx.gaMaterialRequest.update({
    where: { id },
    data: {
      status: allReceived ? 'FULFILLED' : 'APPROVED',
      paidAt: null,
      paidAmount: null,
      paidById: null,
      journalEntryId: null,
      purchaseInvoiceId: null,
    },
  });
}
