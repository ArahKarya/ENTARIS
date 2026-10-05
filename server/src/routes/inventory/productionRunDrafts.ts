/**
 * Draft Data Produksi — /api/inventory/production-runs/drafts (modul 'production').
 * Draft tidak berefek ke stok/GL/HPP/OEE/laporan; posting = POST /:id/post.
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { hasCap } from '../../services/permissionService';
import { validateBody } from '../../utils/validate';
import { CreateProductionRunSchema } from '../../utils/schemas';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { firstString, localDayRange, parseDateParam, parseListPaging } from '../../utils/listQuery';
import { needsApproval, approvalsLink } from '../../services/approvalGate';
import { notifyAdmins } from '../../services/notificationService';
import {
  DRAFT_STATUSES, updateDraft, discardDraft, postDraftDirect,
  postDraftForApproval, recordDraftError,
} from '../../services/productionRunDraft';

const router = Router();

const NEG_STOCK_FORBIDDEN = 'Anda tidak berwenang bypass validasi stok.';

/** Edit / hapus / posting: pembuat draft atau pemegang approval.bypass (Admin). */
async function canManage(req: AuthRequest, createdById: string) {
  return createdById === req.user!.userId || (await hasCap(req.user!.role, 'approval.bypass'));
}

async function withCreators<T extends { createdById: string }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.createdById))];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
    : [];
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return rows.map((r) => ({ ...r, createdBy: { id: r.createdById, fullName: names.get(r.createdById) ?? null } }));
}

// GET / — { data, total, page, limit, counts }. Discarded tidak ditampilkan.
// Query: page, limit, status (Draft|PendingApproval|Posted), search, startDate, endDate.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const status = firstString(query.status);
    if (status && !(DRAFT_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: 'Status draft tidak dikenal.' });
    }
    const startDate = parseDateParam(query.startDate);
    const endDate = parseDateParam(query.endDate);
    if (startDate === null || endDate === null) return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' });

    const where: Prisma.ProductionRunDraftWhereInput = { status: status ?? { not: 'Discarded' } };
    if (startDate || endDate) where.date = { ...localDayRange(startDate, endDate) };
    const search = firstString(query.search);
    if (search) {
      const contains = { contains: search, mode: 'insensitive' as const };
      where.OR = [{ draftNumber: contains }, { notes: contains }, { postedRunNumber: contains }];
    }

    const [rows, total, grouped] = await Promise.all([
      prisma.productionRunDraft.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip, take }),
      prisma.productionRunDraft.count({ where }),
      prisma.productionRunDraft.groupBy({ by: ['status'], where: { status: { not: 'Discarded' } }, _count: { _all: true } }),
    ]);
    const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
    // Daftar tidak membawa payload penuh (besar); ambil via GET /:id.
    const data = await withCreators(rows.map(({ payload: _p, ...rest }) => rest));
    return res.json({ data, total, page, limit: take, counts });
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/production-runs/drafts', 'Gagal mengambil draft produksi.');
  }
});

// GET /:id — draft lengkap (payload utk mengisi modal).
router.get('/:id', async (req, res) => {
  try {
    const draft = await prisma.productionRunDraft.findUnique({ where: { id: req.params.id as string } });
    if (!draft) return res.status(404).json({ error: 'Draft produksi tidak ditemukan.' });
    const [withCreator] = await withCreators([draft]);
    return res.json(withCreator);
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/production-runs/drafts/:id', 'Gagal mengambil draft produksi.');
  }
});

// PUT /:id — ubah draft (hanya selagi status Draft).
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(CreateProductionRunSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
    return res.status(403).json({ error: NEG_STOCK_FORBIDDEN });
  }
  try {
    const id = req.params.id as string;
    const existing = await prisma.productionRunDraft.findUnique({ where: { id }, select: { createdById: true } });
    if (!existing) return res.status(404).json({ error: 'Draft produksi tidak ditemukan.' });
    if (!(await canManage(req, existing.createdById))) return res.status(403).json({ error: 'Hanya pembuat draft yang boleh mengubahnya.' });
    const result = await prisma.$transaction((tx) => updateDraft(tx, id, body, req.body, req.user!.userId));
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /inventory/production-runs/drafts/:id', 'Gagal menyimpan draft produksi.');
  }
});

// DELETE /:id — buang draft (soft: status Discarded; hanya selagi Draft).
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.productionRunDraft.findUnique({ where: { id }, select: { createdById: true } });
    if (!existing) return res.status(404).json({ error: 'Draft produksi tidak ditemukan.' });
    if (!(await canManage(req, existing.createdById))) return res.status(403).json({ error: 'Hanya pembuat draft yang boleh menghapusnya.' });
    await prisma.$transaction((tx) => discardDraft(tx, id, req.user!.userId));
    return res.json({ message: 'Draft produksi dihapus.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /inventory/production-runs/drafts/:id', 'Gagal menghapus draft produksi.');
  }
});

// POST /:id/post — posting draft. Bypass: langsung jadi Data Produksi (201).
// Non-bypass: antrian approval (202), efek terjadi setelah disetujui.
router.post('/:id/post', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  try {
    const existing = await prisma.productionRunDraft.findUnique({ where: { id }, select: { createdById: true, payload: true } });
    if (!existing) return res.status(404).json({ error: 'Draft produksi tidak ditemukan.' });
    if (!(await canManage(req, existing.createdById))) return res.status(403).json({ error: 'Hanya pembuat draft yang boleh memostingnya.' });
    const negStock = (existing.payload as { allowNegativeStock?: boolean } | null)?.allowNegativeStock;
    if (negStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
      return res.status(403).json({ error: NEG_STOCK_FORBIDDEN });
    }

    if (await needsApproval(req.user!.role)) {
      const { request, amount } = await prisma.$transaction((tx) => postDraftForApproval(tx, id, req.user!.userId));
      const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { fullName: true } });
      const link = approvalsLink(request.id);
      await notifyAdmins({
        type: 'approval_pending',
        title: '🔔 Persetujuan: Data Produksi',
        message: `Data Produksi (${amount.toLocaleString('id-ID')} kg input) dari ${requester?.fullName ?? 'staf'} menunggu persetujuan Anda.${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: 'ProductionRun' },
        excludeUserId: req.user!.userId,
      });
      return res.status(202).json({ pendingApproval: true, request, message: 'Data produksi menunggu persetujuan manajer sebelum diproses.' });
    }

    const run = await prisma.$transaction((tx) => postDraftDirect(tx, id, req.user!.userId), { timeout: 30000 });
    return res.status(201).json(run);
  } catch (error) {
    if (error instanceof BusinessError) {
      // Posting gagal (mis. stok kurang): draft tetap Draft, simpan alasannya.
      await recordDraftError(prisma, id, error.message).catch(() => undefined);
    }
    return handleRouteError(res, error, 'POST /inventory/production-runs/drafts/:id/post', 'Gagal memposting draft produksi.');
  }
});

export default router;
