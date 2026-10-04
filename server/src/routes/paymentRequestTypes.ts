// Jenis Pengajuan Pembayaran (master data) — /api/payment-request-types.
// Mounted with requireWrite('settings'): GET is open to every logged-in user
// (the request form needs it), writes need settings edit.
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { BusinessError, handleRouteError } from '../utils/errors';
import { PaymentRequestTypeSchema } from '../utils/schemas';

const router = Router();

const INCLUDE = { defaultExpenseAccount: { select: { id: true, accountNumber: true, name: true } } } as const;

async function assertExpenseAccount(accountId: string | null | undefined) {
  if (!accountId) return;
  const acc = await prisma.account.findUnique({ where: { id: accountId }, select: { isGroup: true, isActive: true } });
  if (!acc || acc.isGroup || !acc.isActive) throw new BusinessError('Akun biaya default harus akun detail yang aktif.');
}

// GET / — active types (form); ?all=1 also returns inactive ones (settings).
router.get('/', async (req, res) => {
  try {
    const all = req.query.all === '1' || req.query.all === 'true';
    const types = await prisma.paymentRequestType.findMany({
      where: all ? {} : { isActive: true },
      include: { ...INCLUDE, _count: { select: { requests: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return res.json(types);
  } catch (error) {
    return handleRouteError(res, error, 'GET /payment-request-types', 'Gagal mengambil jenis pengajuan.');
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestTypeSchema, req.body, res);
  if (!body) return;
  try {
    await assertExpenseAccount(body.defaultExpenseAccountId);
    const exists = await prisma.paymentRequestType.findUnique({ where: { code: body.code } });
    if (exists) return res.status(400).json({ error: 'Kode jenis pengajuan sudah dipakai.' });
    const type = await prisma.paymentRequestType.create({
      data: { ...body, description: body.description || null, defaultExpenseAccountId: body.defaultExpenseAccountId ?? null },
      include: INCLUDE,
    });
    return res.status(201).json(type);
  } catch (error) {
    return handleRouteError(res, error, 'POST /payment-request-types', 'Gagal menyimpan jenis pengajuan.');
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(PaymentRequestTypeSchema, req.body, res);
  if (!body) return;
  try {
    const id = req.params.id as string;
    await assertExpenseAccount(body.defaultExpenseAccountId);
    const dup = await prisma.paymentRequestType.findFirst({ where: { code: body.code, NOT: { id } } });
    if (dup) return res.status(400).json({ error: 'Kode jenis pengajuan sudah dipakai.' });
    const type = await prisma.paymentRequestType.update({
      where: { id },
      data: { ...body, description: body.description || null, defaultExpenseAccountId: body.defaultExpenseAccountId ?? null },
      include: INCLUDE,
    });
    return res.json(type);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /payment-request-types/:id', 'Gagal menyimpan jenis pengajuan.');
  }
});

// DELETE /:id — only unused types; used ones should be deactivated instead.
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const used = await prisma.paymentRequest.count({ where: { typeId: id } });
    if (used > 0) {
      return res.status(400).json({ error: `Jenis ini sudah dipakai ${used} pengajuan. Nonaktifkan saja agar riwayat tetap utuh.` });
    }
    await prisma.paymentRequestType.delete({ where: { id } });
    return res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /payment-request-types/:id', 'Gagal menghapus jenis pengajuan.');
  }
});

export default router;
