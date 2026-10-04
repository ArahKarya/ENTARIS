import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { systemAccounts } from '../services/systemAccounts';
import {
  CreateReconciliationSchema,
  AddStatementItemsSchema,
  MatchItemSchema,
  UnmatchItemSchema,
} from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildReconciliationWhere,
  DEFAULT_RECONCILIATION_SORT,
  RECONCILIATION_SORT_FIELDS,
  reconciliationOrderBy,
} from '../services/reconciliationList';

const router = Router();

// GET /api/reconciliation — paged list of reconciliation sessions.
// Query (all optional): page, limit (default 50, max 200), accountId,
// status (Draft | Completed), startDate/endDate (statement date, YYYY-MM-DD),
// search (account name / number / notes), sort (statementDate | account |
// bookBalance | statementBalance | createdAt, "-" = desc; default -statementDate).
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const filter = buildReconciliationWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { page, limit, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const sort = parseSort(query.sort, RECONCILIATION_SORT_FIELDS, DEFAULT_RECONCILIATION_SORT);

    const [data, total] = await Promise.all([
      prisma.bankReconciliation.findMany({
        where: filter.where,
        include: {
          account: { select: { id: true, name: true, accountNumber: true, balance: true } },
          _count: { select: { items: true } },
        },
        orderBy: reconciliationOrderBy(sort),
        skip,
        take: limit,
      }),
      prisma.bankReconciliation.count({ where: filter.where }),
    ]);

    // Additive per-row figure for the list: statement items already matched.
    const matched = data.length
      ? await prisma.bankReconciliationItem.groupBy({
          by: ['reconciliationId'],
          where: { reconciliationId: { in: data.map((r) => r.id) }, isMatched: true },
          _count: { _all: true },
        })
      : [];
    const matchedById = new Map(matched.map((m) => [m.reconciliationId, m._count._all]));
    const rows = data.map((r) => ({ ...r, matchedCount: matchedById.get(r.id) ?? 0 }));

    return res.json({ data: rows, total, page, limit });
  } catch (error) {
    return handleRouteError(res, error, 'GET /reconciliation', 'Gagal mengambil data rekonsiliasi.');
  }
});

// POST /api/reconciliation — create new reconciliation
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateReconciliationSchema, req.body, res);
  if (!body) return;

  try {
    const account = await prisma.account.findUnique({ where: { id: body.accountId } });
    if (!account) throw new BusinessError('Akun tidak ditemukan.');

    // Check account is cash/bank
    if (!(await systemAccounts.isCashAccount(account.accountNumber))) {
      throw new BusinessError('Akun yang dipilih bukan akun kas/bank.');
    }

    const reconciliation = await prisma.bankReconciliation.create({
      data: {
        accountId: body.accountId,
        statementDate: new Date(body.statementDate),
        statementBalance: body.statementBalance,
        bookBalance: account.balance,
        notes: body.notes || null,
        createdBy: req.user!.userId,
      },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, balance: true } },
      },
    });

    return res.status(201).json(reconciliation);
  } catch (error) {
    return handleRouteError(res, error, 'POST /reconciliation', 'Gagal membuat rekonsiliasi.');
  }
});

// GET /api/reconciliation/:id — detail with items + unmatched ledger entries
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, accountNumber: true, balance: true } },
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!reconciliation) {
      return res.status(404).json({ error: 'Rekonsiliasi tidak ditemukan.' });
    }

    // Get matched ledger entry IDs from this reconciliation
    const matchedLedgerIds = reconciliation.items
      .filter((i: { isMatched: boolean; ledgerEntryId: string | null }) => i.isMatched && i.ledgerEntryId)
      .map((i: { ledgerEntryId: string | null }) => i.ledgerEntryId!);

    // Get unmatched ledger entries for this account
    const unmatchedLedgerEntries = await prisma.accountingLedgerEntry.findMany({
      where: {
        accountId: reconciliation.accountId,
        isCancelled: false,
        id: { notIn: matchedLedgerIds },
      },
      orderBy: { date: 'asc' },
      take: 200,
    });

    return res.json({ ...reconciliation, unmatchedLedgerEntries });
  } catch (error) {
    return handleRouteError(res, error, 'GET /reconciliation/:id', 'Gagal mengambil detail rekonsiliasi.');
  }
});

// POST /api/reconciliation/:id/items — add statement line items
router.post('/:id/items', async (req, res) => {
  const body = validateBody(AddStatementItemsSchema, req.body, res);
  if (!body) return;

  try {
    const id = req.params.id as string;
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
    });
    if (!reconciliation) throw new BusinessError('Rekonsiliasi tidak ditemukan.');
    if (reconciliation.status !== 'Draft') throw new BusinessError('Rekonsiliasi sudah selesai.');

    const items = await prisma.bankReconciliationItem.createManyAndReturn({
      data: body.items.map((item) => ({
        reconciliationId: reconciliation.id,
        statementAmount: item.statementAmount,
        statementDesc: item.statementDesc || null,
        statementDate: item.statementDate ? new Date(item.statementDate) : null,
      })),
    });

    return res.status(201).json(items);
  } catch (error) {
    return handleRouteError(res, error, 'POST /reconciliation/:id/items', 'Gagal menambah item statement.');
  }
});

// PATCH /api/reconciliation/:id/match — match a statement item to a ledger entry
router.patch('/:id/match', async (req, res) => {
  const body = validateBody(MatchItemSchema, req.body, res);
  if (!body) return;

  try {
    const id = req.params.id as string;
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
    });
    if (!reconciliation) throw new BusinessError('Rekonsiliasi tidak ditemukan.');
    if (reconciliation.status !== 'Draft') throw new BusinessError('Rekonsiliasi sudah selesai.');

    const item = await prisma.bankReconciliationItem.findFirst({
      where: { id: body.itemId, reconciliationId: reconciliation.id },
    });
    if (!item) throw new BusinessError('Item tidak ditemukan.');
    if (item.isMatched) throw new BusinessError('Item sudah dicocokkan.');

    // Verify ledger entry belongs to the same account
    const ledgerEntry = await prisma.accountingLedgerEntry.findFirst({
      where: { id: body.ledgerEntryId, accountId: reconciliation.accountId, isCancelled: false },
    });
    if (!ledgerEntry) throw new BusinessError('Ledger entry tidak ditemukan atau bukan milik akun ini.');

    const updated = await prisma.bankReconciliationItem.update({
      where: { id: body.itemId },
      data: {
        ledgerEntryId: body.ledgerEntryId,
        isMatched: true,
      },
    });

    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /reconciliation/:id/match', 'Gagal mencocokkan item.');
  }
});

// PATCH /api/reconciliation/:id/unmatch — unmatch an item
router.patch('/:id/unmatch', async (req, res) => {
  const body = validateBody(UnmatchItemSchema, req.body, res);
  if (!body) return;

  try {
    const id = req.params.id as string;
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
    });
    if (!reconciliation) throw new BusinessError('Rekonsiliasi tidak ditemukan.');
    if (reconciliation.status !== 'Draft') throw new BusinessError('Rekonsiliasi sudah selesai.');

    const item = await prisma.bankReconciliationItem.findFirst({
      where: { id: body.itemId, reconciliationId: reconciliation.id },
    });
    if (!item) throw new BusinessError('Item tidak ditemukan.');

    const updated = await prisma.bankReconciliationItem.update({
      where: { id: body.itemId },
      data: {
        ledgerEntryId: null,
        isMatched: false,
      },
    });

    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /reconciliation/:id/unmatch', 'Gagal membatalkan pencocokan.');
  }
});

// POST /api/reconciliation/:id/complete — mark as Completed
router.post('/:id/complete', async (req, res) => {
  try {
    const id = req.params.id as string;
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!reconciliation) throw new BusinessError('Rekonsiliasi tidak ditemukan.');
    if (reconciliation.status !== 'Draft') throw new BusinessError('Rekonsiliasi sudah selesai.');

    // Check if there are items
    if (reconciliation.items.length === 0) {
      throw new BusinessError('Tidak ada item statement. Tambahkan item terlebih dahulu.');
    }

    const updated = await prisma.bankReconciliation.update({
      where: { id },
      data: { status: 'Completed' },
      include: {
        account: { select: { id: true, name: true, accountNumber: true } },
        items: true,
      },
    });

    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'POST /reconciliation/:id/complete', 'Gagal menyelesaikan rekonsiliasi.');
  }
});

// DELETE /api/reconciliation/:id — delete (only if Draft)
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const reconciliation = await prisma.bankReconciliation.findUnique({
      where: { id },
    });
    if (!reconciliation) throw new BusinessError('Rekonsiliasi tidak ditemukan.');
    if (reconciliation.status !== 'Draft') {
      throw new BusinessError('Hanya rekonsiliasi berstatus Draft yang dapat dihapus.');
    }

    await prisma.bankReconciliation.delete({ where: { id } });
    return res.json({ message: 'Rekonsiliasi berhasil dihapus.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /reconciliation/:id', 'Gagal menghapus rekonsiliasi.');
  }
});

export default router;
