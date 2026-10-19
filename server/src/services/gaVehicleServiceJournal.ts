import { Prisma } from '@prisma/client';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { updateBalancesForItems } from '../utils/accountBalance';
import { BusinessError } from '../utils/errors';

/**
 * Post EAM vehicle service cost: DR expense (default 6.7) / CR cash-bank (default 1.1.1) or 2.1.1.
 * One journal per service log (unique journal_entry_id); imported logs (source != 'EAM') are
 * never posted because they are already in the GL.
 */

export const DEFAULT_VEHICLE_EXPENSE_ACCOUNT = '6.7'; // Beban Pemeliharaan Kendaraan
export const FUEL_EXPENSE_ACCOUNT = '6.3'; // Beban Bensin, Parkir, Tol Kendaraan

export interface PostVehicleServiceJournalArgs {
  serviceLogId: string;
  accountId?: string | null; // akun beban (debit)
  creditAccountId?: string | null; // akun kas/bank/hutang (kredit)
  userId: string;
}

async function resolveAccountByNumber(tx: Prisma.TransactionClient, accountNumber: string) {
  const acc = await tx.account.findFirst({
    where: { accountNumber, isGroup: false },
    select: { id: true, accountNumber: true, name: true },
  });
  if (!acc) {
    throw new BusinessError(
      `Akun ${accountNumber} tidak ditemukan di COA. Pilih akun secara manual.`,
    );
  }
  return acc;
}

/**
 * Membuat jurnal untuk sebuah service log. Dipanggil di dalam transaksi.
 * Mengembalikan JournalEntry yang dibuat.
 */
export async function postVehicleServiceJournalInTx(
  tx: Prisma.TransactionClient,
  args: PostVehicleServiceJournalArgs,
) {
  const log = await tx.gaVehicleServiceLog.findUnique({
    where: { id: args.serviceLogId },
    include: {
      asset: { select: { code: true, name: true } },
    },
  });
  if (!log) throw new BusinessError('Service log tidak ditemukan.');

  if (log.journalEntryId) {
    throw new BusinessError(
      'Service log ini sudah memiliki jurnal. Batalkan jurnal lama sebelum posting ulang.',
    );
  }
  if (log.source !== 'EAM') {
    throw new BusinessError(
      `Service log bersumber "${log.source}" (data historis) tidak dapat diposting ke jurnal karena nilainya sudah tercatat di GL lewat input manual.`,
    );
  }

  const biaya = log.biaya != null ? Number(log.biaya) : 0;
  if (!(biaya > 0)) {
    throw new BusinessError('Biaya service harus lebih besar dari 0 untuk diposting ke jurnal.');
  }

  // Akun beban (debit)
  let debitAccountId = args.accountId ?? null;
  if (!debitAccountId) {
    const fallbackNumber =
      log.jenisService === 'LAINNYA' ? DEFAULT_VEHICLE_EXPENSE_ACCOUNT : DEFAULT_VEHICLE_EXPENSE_ACCOUNT;
    debitAccountId = (await resolveAccountByNumber(tx, fallbackNumber)).id;
  }

  // Akun kredit (sumber dana)
  let creditAccountId = args.creditAccountId ?? null;
  if (!creditAccountId) {
    const cashMapping = await tx.systemAccountMapping.findFirst({
      where: { role: 'CASH' },
      orderBy: { sortOrder: 'asc' },
      select: { accountId: true },
    });
    creditAccountId = cashMapping?.accountId ?? (await resolveAccountByNumber(tx, '1.1.1')).id;
  }

  if (debitAccountId === creditAccountId) {
    throw new BusinessError('Akun beban dan akun sumber dana tidak boleh sama.');
  }

  const [debitAcc, creditAcc] = await Promise.all([
    tx.account.findUnique({
      where: { id: debitAccountId },
      select: { id: true, isGroup: true, accountNumber: true, name: true, rootType: true },
    }),
    tx.account.findUnique({
      where: { id: creditAccountId },
      select: { id: true, isGroup: true, accountNumber: true, name: true, rootType: true },
    }),
  ]);
  if (!debitAcc || debitAcc.isGroup) throw new BusinessError('Akun beban tidak valid (harus akun detail).');
  if (!creditAcc || creditAcc.isGroup) throw new BusinessError('Akun sumber dana tidak valid (harus akun detail).');

  const parsedDate = new Date(log.tanggal);
  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);
  const entryNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);

  const plat = log.asset?.name ?? log.asset?.code ?? '-';
  const narration = `Biaya service kendaraan ${plat}: ${log.deskripsi}${log.bengkel ? ` (${log.bengkel})` : ''}`;

  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber,
      date: parsedDate,
      narration,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: args.userId,
      submittedAt: new Date(),
      items: {
        create: [
          { accountId: debitAcc.id, debit: biaya, credit: 0, description: narration },
          { accountId: creditAcc.id, debit: 0, credit: biaya, description: narration },
        ],
      },
    },
    include: { items: true },
  });

  await tx.accountingLedgerEntry.createMany({
    data: journalEntry.items.map((item) => ({
      date: parsedDate,
      accountId: item.accountId,
      partyId: null,
      debit: item.debit,
      credit: item.credit,
      referenceType: 'JournalEntry',
      referenceId: journalEntry.id,
      description: narration,
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

  await tx.gaVehicleServiceLog.update({
    where: { id: log.id },
    data: {
      journalEntryId: journalEntry.id,
      accountId: debitAcc.id,
      creditAccountId: creditAcc.id,
    },
  });

  return journalEntry;
}

/**
 * Membatalkan jurnal sebuah service log (soft-cancel, konsisten dgn jalur ERP lain)
 * lalu melepas tautan di service log agar bisa diposting ulang.
 */
export async function cancelVehicleServiceJournalInTx(
  tx: Prisma.TransactionClient,
  serviceLogId: string,
) {
  const log = await tx.gaVehicleServiceLog.findUnique({
    where: { id: serviceLogId },
    select: { id: true, journalEntryId: true },
  });
  if (!log) throw new BusinessError('Service log tidak ditemukan.');
  if (!log.journalEntryId) throw new BusinessError('Service log ini belum memiliki jurnal.');

  const entry = await tx.journalEntry.findUnique({
    where: { id: log.journalEntryId },
    include: { items: true },
  });
  if (!entry) throw new BusinessError('Jurnal tidak ditemukan.');

  if (entry.status !== 'Cancelled') {
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
  }

  await tx.gaVehicleServiceLog.update({
    where: { id: log.id },
    data: { journalEntryId: null },
  });

  return entry;
}
