import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { validateBody } from '../utils/validate';
import { CreateAccountSchema, UpdateAccountSchema, SetBalanceSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';
import { compareAccountNumber } from '../utils/accountSort';
import { systemAccountRenumberError } from '../utils/systemAccountGuard';

const router = Router();

/** Derive rootType from account number prefix. Overrides user-supplied value to prevent mismatch. */
function deriveRootType(accountNumber: string, fallback: string) {
  const prefix = accountNumber.split('.')[0];
  switch (prefix) {
    case '1': return 'ASSET' as const;
    case '2': return 'LIABILITY' as const;
    case '3': return 'EQUITY' as const;
    case '4': return 'REVENUE' as const;
    case '5': case '6': case '7': case '8': return 'EXPENSE' as const;
    default: return fallback as any;
  }
}

// GET /api/coa — hierarchical account tree
router.get('/', async (req, res) => {
  try {
    const allAccounts = await prisma.account.findMany();
    allAccounts.sort((a, b) => compareAccountNumber(a.accountNumber, b.accountNumber));

    const buildTree = (accounts: typeof allAccounts, parentId: string | null = null): any[] =>
      accounts
        .filter((acc) => acc.parentId === parentId)
        .map((acc) => ({ ...acc, children: buildTree(accounts, acc.id) }));

    return res.json(buildTree(allAccounts));
  } catch (error) {
    logger.error({ error }, 'GET /coa error');
    return res.status(500).json({ error: 'Gagal mengambil daftar akun.' });
  }
});

// GET /api/coa/flat — flat list (for dropdowns)
router.get('/flat', async (req, res) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { isActive: true },
      select: {
        id: true,
        accountNumber: true,
        name: true,
        accountType: true,
        rootType: true,
        isGroup: true,
        isActive: true,
        balance: true,
      },
    });
    accounts.sort((a, b) => compareAccountNumber(a.accountNumber, b.accountNumber));
    return res.json(accounts);
  } catch (error) {
    logger.error({ error }, 'GET /coa/flat error');
    return res.status(500).json({ error: 'Gagal mengambil daftar akun.' });
  }
});

// POST /api/coa: create account (requires coa edit permission)
router.post('/', async (req, res) => {
  const body = validateBody(CreateAccountSchema, req.body, res);
  if (!body) return;

  try {
    // Auto-detect rootType from account number prefix to prevent mismatch
    const rootType = deriveRootType(body.accountNumber, body.rootType);

    const account = await prisma.account.create({
      data: {
        accountNumber: body.accountNumber,
        name: body.name,
        accountType: body.accountType,
        rootType,
        isGroup: body.isGroup ?? false,
        parentId: body.parentId || null,
      },
    });
    return res.status(201).json(account);
  } catch (error: any) {
    logger.error({ error }, 'POST /coa error');
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Nomor akun sudah digunakan.' });
    }
    return res.status(500).json({ error: 'Gagal membuat akun.' });
  }
});

// PUT /api/coa/:id: update account (requires coa edit permission)
router.put('/:id', async (req, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateAccountSchema, req.body, res);
  if (!body) return;

  try {
    // If accountNumber is changing, check uniqueness
    if (body.accountNumber) {
      const existing = await prisma.account.findFirst({
        where: { accountNumber: body.accountNumber, id: { not: id } },
      });
      if (existing) return res.status(409).json({ error: 'Nomor akun sudah digunakan oleh akun lain.' });

      // Akun yang dipetakan sebagai akun sistem tidak boleh diganti nomornya.
      const current = await prisma.account.findUnique({ where: { id }, select: { accountNumber: true } });
      if (current && current.accountNumber !== body.accountNumber) {
        const mappings = await prisma.systemAccountMapping.findMany({ where: { accountId: id }, select: { role: true } });
        const err = systemAccountRenumberError(current.accountNumber, body.accountNumber, mappings.map((m) => m.role));
        if (err) return res.status(400).json({ error: err });
      }
    }

    // If trying to un-group (isGroup: false), check no children exist
    if (body.isGroup === false) {
      const childCount = await prisma.account.count({ where: { parentId: id } });
      if (childCount > 0) return res.status(400).json({ error: 'Tidak dapat mengubah akun grup yang masih memiliki sub-akun.' });
    }

    // Auto-fix rootType if accountNumber changes
    const newRootType = body.accountNumber ? deriveRootType(body.accountNumber, '') : null;

    const account = await prisma.account.update({
      where: { id },
      data: {
        ...(body.accountNumber && { accountNumber: body.accountNumber }),
        ...(body.name && { name: body.name }),
        ...(body.isGroup !== undefined && { isGroup: body.isGroup }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(newRootType && { rootType: newRootType, accountType: newRootType }),
      },
    });
    return res.json(account);
  } catch (error: any) {
    logger.error({ error }, 'PUT /coa/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (error.code === 'P2002') return res.status(409).json({ error: 'Nomor akun sudah digunakan.' });
    return res.status(500).json({ error: 'Gagal mengupdate akun.' });
  }
});

// PATCH /api/coa/:id/balance: set opening balance (requires coa edit permission)
router.patch('/:id/balance', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(SetBalanceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.account.findUnique({ where: { id } });
      if (!account) throw new BusinessError('Akun tidak ditemukan.');
      if (account.isGroup) throw new BusinessError('Tidak bisa set saldo untuk akun grup.');

      const currentBalance = Number(account.balance);
      const newBalance = body.balance;
      const delta = newBalance - currentBalance;

      if (Math.abs(delta) < 0.01) return account; // No change

      // Counter-entry to Opening Equity
      const equityAccount = await systemAccounts.getAccount('OPENING_EQUITY');

      const now = new Date();
      const fiscalYear = await getOpenFiscalYear(tx, now);
      const entryNumber = await generateDocumentNumber(tx, 'OB', now, fiscalYear.id);

      // Determine debit/credit based on account type and delta direction
      let accountDebit = 0, accountCredit = 0;
      let equityDebit = 0, equityCredit = 0;

      if (account.rootType === 'ASSET' || account.rootType === 'EXPENSE') {
        if (delta > 0) { accountDebit = delta; equityCredit = delta; }
        else { accountCredit = Math.abs(delta); equityDebit = Math.abs(delta); }
      } else {
        if (delta > 0) { accountCredit = delta; equityDebit = delta; }
        else { accountDebit = Math.abs(delta); equityCredit = Math.abs(delta); }
      }

      const journalEntry = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: now,
          narration: `Saldo Awal: ${account.accountNumber} - ${account.name}`,
          status: 'Submitted',
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: now,
          items: {
            create: [
              { accountId: id, debit: accountDebit, credit: accountCredit, description: `Saldo Awal: ${account.name}` },
              { accountId: equityAccount.id, debit: equityDebit, credit: equityCredit, description: `Saldo Awal: ${account.name}` },
            ],
          },
        },
      });

      await tx.accountingLedgerEntry.createMany({
        data: [
          { date: now, accountId: id, debit: accountDebit, credit: accountCredit, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Saldo Awal: ${account.name}`, fiscalYearId: fiscalYear.id },
          { date: now, accountId: equityAccount.id, debit: equityDebit, credit: equityCredit, referenceType: 'JournalEntry', referenceId: journalEntry.id, description: `Saldo Awal: ${account.name}`, fiscalYearId: fiscalYear.id },
        ],
      });

      await updateAccountBalance(tx, id, accountDebit, accountCredit);
      await updateAccountBalance(tx, equityAccount.id, equityDebit, equityCredit);

      return tx.account.findUnique({ where: { id } });
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'PATCH /coa/:id/balance', 'Gagal mengatur saldo awal.');
  }
});

// DELETE /api/coa/:id: requires coa edit permission and the doc.cancel capability
router.delete('/:id', requireCap('doc.cancel'), async (req, res) => {
  const id = req.params.id as string;

  try {
    const childCount = await prisma.account.count({ where: { parentId: id } });
    if (childCount > 0) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun yang masih memiliki sub-akun. Hapus sub-akun terlebih dahulu.' });
    }

    // Accounts mapped as system accounts cannot be deleted.
    const sysMappings = await prisma.systemAccountMapping.findMany({ where: { accountId: id }, select: { role: true } });
    if (sysMappings.length > 0) {
      const roles = sysMappings.map((m) => m.role).join(', ');
      return res.status(400).json({
        error: `Tidak dapat menghapus akun ini karena dipakai sebagai Akun Sistem (${roles}). Lepaskan dulu pemetaannya di Pengaturan → Akun Sistem.`,
      });
    }

    const [itemCount, serviceCount] = await Promise.all([
      prisma.inventoryItem.count({ where: { accountId: id } }),
      prisma.serviceItem.count({ where: { accountId: id } }),
    ]);
    if (itemCount > 0 || serviceCount > 0) {
      const parts: string[] = [];
      if (itemCount > 0) parts.push(`${itemCount} item persediaan`);
      if (serviceCount > 0) parts.push(`${serviceCount} item jasa`);
      return res.status(400).json({
        error: `Tidak dapat menghapus akun ini karena masih ditautkan ke ${parts.join(' & ')}. Ubah akun pada item tersebut terlebih dahulu.`,
      });
    }

    const ledgerCount = await prisma.accountingLedgerEntry.count({ where: { accountId: id, isCancelled: false } });
    if (ledgerCount > 0) {
      return res.status(400).json({ error: 'Tidak dapat menghapus akun yang sudah memiliki transaksi.' });
    }

    const account = await prisma.account.findUnique({ where: { id }, select: { balance: true, name: true } });
    if (!account) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    if (Number(account.balance) !== 0) {
      return res.status(400).json({ error: `Tidak dapat menghapus akun dengan saldo tidak nol (${Number(account.balance).toLocaleString('id-ID')}).` });
    }

    await prisma.account.delete({ where: { id } });
    return res.json({ message: 'Akun dihapus.' });
  } catch (error: any) {
    logger.error({ error }, 'DELETE /coa/:id error');
    if (error.code === 'P2025') return res.status(404).json({ error: 'Akun tidak ditemukan.' });
    // Foreign-key violation: account still referenced by other data
    // (jurnal manual, pembayaran, dokumen, aset tetap, biaya produksi, dll.)
    if (error.code === 'P2003') {
      return res.status(400).json({
        error: 'Tidak dapat menghapus akun ini karena masih dipakai oleh data lain (transaksi, dokumen, aset tetap, atau biaya produksi). Batalkan atau alihkan data terkait terlebih dahulu.',
      });
    }
    return res.status(500).json({ error: 'Gagal menghapus akun.' });
  }
});

export default router;
