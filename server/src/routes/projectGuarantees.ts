// Uang Jaminan Proyek (Project Guarantee).
// Setoran jaminan (tender/pelaksanaan/pemeliharaan) ke pemberi proyek;
// dikembalikan / dipotong penalti / hangus via settlements (bisa parsial,
// berulang sampai sisa habis).
//
// GL:
//   Setor      : DR Uang Jaminan (PROJECT_GUARANTEE, 1.8) / CR Kas-Bank
//   Settlement : DR Kas-Bank (kembali) + DR Beban (hangus) / CR Uang Jaminan
//   Cancel     : soft-cancel (JE Cancelled + ALE isCancelled + reverse saldo)
//
// PENTING: semua baris JE/ALE modul ini TANPA partyId — applyPartyImpact
// menaikkan party.outstandingAmount utk baris ASSET ber-party (tidak ada
// special-case akun 1.8 seperti akun UM) sehingga piutang pihak terdistorsi.
// Link pihak cukup di row ProjectGuarantee. Mount dgn requirePerm('project_guarantee').

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateProjectGuaranteeSchema, SettleProjectGuaranteeSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';

const router = Router();

type SettlementRow = { returnAmount: Prisma.Decimal; forfeitAmount: Prisma.Decimal };

function sumSettled(settlements: SettlementRow[]): Decimal {
  return settlements.reduce(
    (sum, s) =>
      sum.plus(new Decimal(s.returnAmount.toString())).plus(new Decimal(s.forfeitAmount.toString())),
    new Decimal(0),
  );
}

// GET /api/project-guarantees — list + summary untuk cards
router.get('/', async (req, res) => {
  try {
    const { partyId, status, guaranteeType } = req.query;

    const where: Prisma.ProjectGuaranteeWhereInput = {};
    if (partyId) where.partyId = partyId as string;
    if (status) where.status = status as string;
    if (guaranteeType) where.guaranteeType = guaranteeType as string;

    const guarantees = await prisma.projectGuarantee.findMany({
      where,
      include: {
        party: { select: { id: true, name: true } },
        settlements: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { date: 'desc' },
    });

    // Nama akun via satu query (plain-scalar FK).
    const accountIds = [
      ...new Set(
        guarantees.flatMap((g) => [
          g.accountId,
          ...g.settlements.flatMap((s) => [s.returnAccountId, s.forfeitAccountId]),
        ]).filter((id): id is string => !!id),
      ),
    ];
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, accountNumber: true, name: true },
    });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    let totalActive = new Decimal(0);
    let totalReturnedAll = new Decimal(0);
    let totalForfeitedAll = new Decimal(0);
    let totalOutstanding = new Decimal(0);

    const data = guarantees.map((g) => {
      const active = g.settlements.filter((s) => !s.isCancelled);
      const totalReturned = active.reduce(
        (sum, s) => sum.plus(new Decimal(s.returnAmount.toString())),
        new Decimal(0),
      );
      const totalForfeited = active.reduce(
        (sum, s) => sum.plus(new Decimal(s.forfeitAmount.toString())),
        new Decimal(0),
      );
      const outstanding =
        g.status === 'Dibatalkan'
          ? new Decimal(0)
          : new Decimal(g.amount.toString()).minus(totalReturned).minus(totalForfeited);

      if (g.status !== 'Dibatalkan') {
        totalActive = totalActive.plus(new Decimal(g.amount.toString()));
        totalReturnedAll = totalReturnedAll.plus(totalReturned);
        totalForfeitedAll = totalForfeitedAll.plus(totalForfeited);
        totalOutstanding = totalOutstanding.plus(outstanding);
      }

      return {
        ...g,
        account: accountMap.get(g.accountId) ?? null,
        settlements: g.settlements.map((s) => ({
          ...s,
          returnAccount: s.returnAccountId ? accountMap.get(s.returnAccountId) ?? null : null,
          forfeitAccount: s.forfeitAccountId ? accountMap.get(s.forfeitAccountId) ?? null : null,
        })),
        totalReturned: totalReturned.toNumber(),
        totalForfeited: totalForfeited.toNumber(),
        outstanding: outstanding.toNumber(),
      };
    });

    return res.json({
      data,
      summary: {
        totalDeposited: totalActive.toNumber(),
        totalReturned: totalReturnedAll.toNumber(),
        totalForfeited: totalForfeitedAll.toNumber(),
        totalOutstanding: totalOutstanding.toNumber(),
        activeCount: guarantees.filter((g) => g.status === 'Disetor').length,
      },
    });
  } catch (error) {
    logger.error({ error }, 'GET /project-guarantees error');
    return res.status(500).json({ error: 'Gagal mengambil data uang jaminan.' });
  }
});

// GET /api/project-guarantees/:id — detail + settlements
router.get('/:id', async (req, res) => {
  try {
    const guarantee = await prisma.projectGuarantee.findUnique({
      where: { id: req.params.id as string },
      include: {
        party: { select: { id: true, name: true } },
        settlements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!guarantee) return res.status(404).json({ error: 'Uang jaminan tidak ditemukan.' });

    const active = guarantee.settlements.filter((s) => !s.isCancelled);
    const outstanding = new Decimal(guarantee.amount.toString()).minus(sumSettled(active));
    return res.json({ ...guarantee, outstanding: outstanding.toNumber() });
  } catch (error) {
    logger.error({ error }, 'GET /project-guarantees/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail uang jaminan.' });
  }
});

// POST /api/project-guarantees — setor jaminan + JV
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateProjectGuaranteeSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const bankAccount = await tx.account.findUnique({ where: { id: body.accountId } });
      if (!bankAccount) throw new BusinessError('Akun kas/bank tidak ditemukan.');
      if (!(await systemAccounts.isCashAccount(bankAccount.accountNumber))) {
        throw new BusinessError('Akun yang dipilih bukan akun kas/bank.');
      }

      const party = await tx.party.findUnique({ where: { id: body.partyId } });
      if (!party) throw new BusinessError('Data pihak tidak ditemukan.');
      if (!party.isActive) throw new BusinessError('Pihak sudah tidak aktif.');

      const guaranteeAccount = await systemAccounts.getAccount('PROJECT_GUARANTEE');
      const guaranteeNumber = await generateDocumentNumber(tx, 'UJ', parsedDate, fiscalYear.id);
      const numAmount = body.amount;

      const jvNumber = `JV-${guaranteeNumber}`;
      const existingJV = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
      if (existingJV) throw new BusinessError(`Nomor jurnal ${jvNumber} sudah ada. Silakan coba lagi.`);

      const narration = `Setor Uang Jaminan: ${guaranteeNumber} - ${body.projectName} (${party.name})`;

      // Baris JE/ALE tanpa partyId — lihat catatan header file.
      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: guaranteeAccount.id, debit: numAmount, credit: 0, description: narration },
              { accountId: body.accountId, debit: 0, credit: numAmount, description: narration },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: parsedDate, accountId: guaranteeAccount.id, debit: numAmount, credit: 0, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: narration, fiscalYearId: fiscalYear.id },
          { date: parsedDate, accountId: body.accountId, debit: 0, credit: numAmount, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: narration, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, guaranteeAccount.id, numAmount, 0);
      await updateAccountBalance(tx, body.accountId, 0, numAmount);

      return tx.projectGuarantee.create({
        data: {
          guaranteeNumber,
          date: parsedDate,
          partyId: body.partyId,
          guaranteeType: body.guaranteeType,
          projectName: body.projectName,
          referenceNo: body.referenceNo || null,
          amount: numAmount,
          accountId: body.accountId,
          expectedReturnDate: body.expectedReturnDate ? new Date(body.expectedReturnDate) : null,
          notes: body.notes || null,
          status: 'Disetor',
          journalEntryId: journalEntry.id,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
        },
        include: { party: { select: { id: true, name: true } } },
      });
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /project-guarantees', 'Gagal menyimpan uang jaminan.');
  }
});

// POST /api/project-guarantees/:id/settle — kembalikan dan/atau hangus (parsial OK)
router.post('/:id/settle', async (req: AuthRequest, res) => {
  const body = validateBody(SettleProjectGuaranteeSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const guaranteeId = req.params.id as string;
      await tx.$queryRaw`SELECT id FROM project_guarantees WHERE id = ${guaranteeId} FOR UPDATE`;

      const guarantee = await tx.projectGuarantee.findUnique({
        where: { id: guaranteeId },
        include: { party: { select: { name: true } }, settlements: { where: { isCancelled: false } } },
      });
      if (!guarantee) throw new BusinessError('Uang jaminan tidak ditemukan.');
      if (guarantee.status !== 'Disetor') {
        throw new BusinessError(`Uang jaminan berstatus ${guarantee.status}, tidak bisa di-settle.`);
      }

      const parsedDate = new Date(body.date);
      if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
      const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

      const returnAmount = new Decimal(body.returnAmount);
      const forfeitAmount = new Decimal(body.forfeitAmount);
      const total = returnAmount.plus(forfeitAmount);

      const outstanding = new Decimal(guarantee.amount.toString()).minus(sumSettled(guarantee.settlements));
      if (total.gt(outstanding.plus(0.01))) {
        throw new BusinessError(
          `Jumlah settlement (${total.toFixed(2)}) melebihi sisa jaminan (${outstanding.toFixed(2)}).`,
        );
      }

      // Akun pengembalian: wajib kas/bank.
      let returnAccountId: string | null = null;
      if (returnAmount.gt(0)) {
        const acc = await tx.account.findUnique({ where: { id: body.returnAccountId! } });
        if (!acc) throw new BusinessError('Akun kas/bank tujuan tidak ditemukan.');
        if (!(await systemAccounts.isCashAccount(acc.accountNumber))) {
          throw new BusinessError('Akun tujuan pengembalian bukan akun kas/bank.');
        }
        returnAccountId = acc.id;
      }

      // Akun hangus: pilihan user (harus EXPENSE) atau default Beban Lain-lain.
      let forfeitAccountId: string | null = null;
      if (forfeitAmount.gt(0)) {
        if (body.expenseAccountId) {
          const acc = await tx.account.findUnique({ where: { id: body.expenseAccountId } });
          if (!acc) throw new BusinessError('Akun beban tidak ditemukan.');
          if (acc.rootType !== 'EXPENSE') throw new BusinessError('Akun hangus harus akun beban (EXPENSE).');
          if (acc.isGroup) throw new BusinessError('Akun beban tidak boleh akun grup.');
          forfeitAccountId = acc.id;
        } else {
          forfeitAccountId = (await systemAccounts.getAccount('OTHER_EXPENSE')).id;
        }
      }

      const guaranteeAccount = await systemAccounts.getAccount('PROJECT_GUARANTEE');
      // Multi-settlement per jaminan → nomor JV generated (bukan JV-<UJ-no>),
      // pola yang sama dgn refund uang muka vendor.
      const jvNumber = await generateDocumentNumber(tx, 'JV', parsedDate, fiscalYear.id);
      const narration = `Settlement Uang Jaminan: ${guarantee.guaranteeNumber} - ${guarantee.projectName} (${guarantee.party.name})`;

      const items: Prisma.JournalItemCreateWithoutJournalEntryInput[] = [];
      if (returnAmount.gt(0) && returnAccountId) {
        items.push({ account: { connect: { id: returnAccountId } }, debit: returnAmount.toNumber(), credit: 0, description: `${narration} (dikembalikan)` });
      }
      if (forfeitAmount.gt(0) && forfeitAccountId) {
        items.push({ account: { connect: { id: forfeitAccountId } }, debit: forfeitAmount.toNumber(), credit: 0, description: `${narration} (hangus)` });
      }
      items.push({ account: { connect: { id: guaranteeAccount.id } }, debit: 0, credit: total.toNumber(), description: narration });

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber: jvNumber,
          date: parsedDate,
          narration,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: { create: items },
        },
        include: { items: true },
      });

      await tx.accountingLedgerEntry.createMany({
        data: journalEntry.items.map((item) => ({
          date: parsedDate,
          accountId: item.accountId,
          debit: item.debit,
          credit: item.credit,
          referenceType: 'JournalEntry',
          referenceId: journalEntry.id,
          description: item.description || narration,
          fiscalYearId: fiscalYear.id,
        })),
      });

      for (const item of journalEntry.items) {
        await updateAccountBalance(tx, item.accountId, Number(item.debit), Number(item.credit));
      }

      const settlement = await tx.projectGuaranteeSettlement.create({
        data: {
          guaranteeId,
          date: parsedDate,
          returnAmount: returnAmount.toNumber(),
          forfeitAmount: forfeitAmount.toNumber(),
          returnAccountId,
          forfeitAccountId,
          journalEntryId: journalEntry.id,
          notes: body.notes || null,
          createdBy: req.user!.userId,
        },
      });

      const newOutstanding = outstanding.minus(total);
      if (newOutstanding.lte(0.01)) {
        await tx.projectGuarantee.update({ where: { id: guaranteeId }, data: { status: 'Selesai' } });
      }

      return { settlement, outstanding: newOutstanding.toNumber() };
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /project-guarantees/:id/settle', 'Gagal menyimpan settlement uang jaminan.');
  }
});

// PATCH /api/project-guarantees/:id/cancel — batalkan setoran (belum ada settlement)
router.patch('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const guaranteeId = req.params.id as string;
      await tx.$queryRaw`SELECT id FROM project_guarantees WHERE id = ${guaranteeId} FOR UPDATE`;

      const guarantee = await tx.projectGuarantee.findUnique({
        where: { id: guaranteeId },
        include: { settlements: { where: { isCancelled: false } } },
      });
      if (!guarantee) throw new BusinessError('Uang jaminan tidak ditemukan.');
      if (guarantee.status === 'Dibatalkan') throw new BusinessError('Uang jaminan sudah dibatalkan.');
      if (guarantee.settlements.length > 0) {
        throw new BusinessError('Sudah ada settlement aktif. Batalkan settlement terlebih dahulu.');
      }

      if (guarantee.journalEntryId) {
        await softCancelJournal(tx, guarantee.journalEntryId);
      }

      await tx.projectGuarantee.update({
        where: { id: guaranteeId },
        data: { status: 'Dibatalkan', cancelledAt: new Date() },
      });
    });

    return res.json({ message: 'Uang jaminan dibatalkan.' });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /project-guarantees/:id/cancel', 'Gagal membatalkan uang jaminan.');
  }
});

// POST /api/project-guarantees/settlements/:id/cancel — batalkan satu settlement
router.post('/settlements/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const settlementId = req.params.id as string;
      const settlement = await tx.projectGuaranteeSettlement.findUnique({
        where: { id: settlementId },
      });
      if (!settlement) throw new BusinessError('Settlement tidak ditemukan.');
      if (settlement.isCancelled) throw new BusinessError('Settlement sudah dibatalkan.');

      await tx.$queryRaw`SELECT id FROM project_guarantees WHERE id = ${settlement.guaranteeId} FOR UPDATE`;
      const guarantee = await tx.projectGuarantee.findUnique({
        where: { id: settlement.guaranteeId },
        include: { settlements: { where: { isCancelled: false } } },
      });
      if (!guarantee) throw new BusinessError('Uang jaminan tidak ditemukan.');
      if (guarantee.status === 'Dibatalkan') throw new BusinessError('Uang jaminan induk sudah dibatalkan.');

      if (settlement.journalEntryId) {
        await softCancelJournal(tx, settlement.journalEntryId);
      }

      await tx.projectGuaranteeSettlement.update({
        where: { id: settlementId },
        data: { isCancelled: true, cancelledAt: new Date() },
      });

      // Bila jaminan sudah Selesai dan sisa kembali > 0 → buka lagi.
      const remainingActive = guarantee.settlements.filter((s) => s.id !== settlementId);
      const outstanding = new Decimal(guarantee.amount.toString()).minus(sumSettled(remainingActive));
      if (guarantee.status === 'Selesai' && outstanding.gt(0.01)) {
        await tx.projectGuarantee.update({
          where: { id: guarantee.id },
          data: { status: 'Disetor' },
        });
      }
    });

    return res.json({ message: 'Settlement dibatalkan.' });
  } catch (error) {
    return handleRouteError(res, error, 'POST /project-guarantees/settlements/:id/cancel', 'Gagal membatalkan settlement.');
  }
});

// Soft-cancel JE: status Cancelled + ALE isCancelled + reverse saldo akun.
// JANGAN buat JV balikan ([BATAL]) — menggandakan DR/CR mentah di ALE dan
// merusak health check sinkronisasi ALE↔JI (lihat vendorDeposits.ts).
async function softCancelJournal(tx: Prisma.TransactionClient, journalEntryId: string): Promise<void> {
  const journal = await tx.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { items: true },
  });
  if (!journal || journal.status === 'Cancelled') return;

  for (const item of journal.items) {
    await updateAccountBalance(tx, item.accountId, Number(item.credit), Number(item.debit));
  }
  await tx.journalEntry.update({
    where: { id: journal.id },
    data: { status: 'Cancelled', cancelledAt: new Date() },
  });
  await tx.accountingLedgerEntry.updateMany({
    where: { referenceId: journal.id, isCancelled: false },
    data: { isCancelled: true },
  });
}

export default router;
