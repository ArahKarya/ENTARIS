import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { BusinessError, handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import {
  CreateInquirySchema,
  UpdateInquirySchema,
  InquiryStatusUpdateSchema,
} from '../utils/schemas';
import { logger } from '../lib/logger';

const router = Router();

// ─── GET / list ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, channel, partyId, page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.InquiryWhereInput = {};
    if (status) where.status = status as any;
    if (channel) where.channel = channel as any;
    if (partyId) where.partyId = partyId as string;

    const [data, total] = await Promise.all([
      prisma.inquiry.findMany({
        where,
        include: {
          party: { select: { id: true, name: true, phone: true, email: true } },
          items: true,
          quotation: { select: { id: true, quotationNumber: true, status: true } },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.inquiry.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /inquiries', 'Gagal mengambil data inquiry.');
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where: Prisma.InquiryWhereInput = {};
    if (from || to) {
      where.date = {};
      if (from) (where.date as any).gte = new Date(String(from));
      if (to) (where.date as any).lte = new Date(String(to) + 'T23:59:59.999Z');
    }
    const grouped = await prisma.inquiry.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts: Record<string, number> = { Baru: 0, Diproses: 0, Dikonversi: 0, Hilang: 0, Ditutup: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const conversionRate = total > 0 ? Math.round((counts.Dikonversi / total) * 100) : 0;
    return res.json({ counts, total, conversionRate });
  } catch (error) {
    return handleRouteError(res, error, 'GET /inquiries/stats', 'Gagal mengambil statistik inquiry.');
  }
});

// ─── GET /:id detail ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const inquiry = await prisma.inquiry.findUnique({
      where: { id: req.params.id as string },
      include: {
        party: true,
        items: true,
        quotation: { select: { id: true, quotationNumber: true, status: true, grandTotal: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!inquiry) return res.status(404).json({ error: 'Inquiry tidak ditemukan.' });
    return res.json(inquiry);
  } catch (error) {
    return handleRouteError(res, error, 'GET /inquiries/:id', 'Gagal mengambil detail inquiry.');
  }
});

// ─── POST / create ────────────────────────────────────────────────────────
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateInquirySchema, req.body, res);
  if (!body) return;

  try {
    const date = new Date(body.date);
    if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');

    const result = await prisma.$transaction(async (tx) => {
      const fy = await getOpenFiscalYear(tx, date);
      const inquiryNumber = await generateDocumentNumber(tx, 'INQ', date, fy.id);
      return tx.inquiry.create({
        data: {
          inquiryNumber,
          date,
          status: 'Baru',
          channel: body.channel,
          partyId: body.partyId || null,
          prospectName: body.prospectName,
          prospectPhone: body.prospectPhone || null,
          prospectEmail: body.prospectEmail || null,
          itemsMode: body.itemsMode,
          itemsText: body.itemsText || null,
          notes: body.notes || null,
          followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
          fiscalYearId: fy.id,
          createdBy: req.user!.userId,
          items: body.items && body.items.length > 0
            ? {
                create: body.items.map((it) => ({
                  itemName: it.itemName,
                  quantity: it.quantity ?? null,
                  unit: it.unit || null,
                  estimatedPrice: it.estimatedPrice ?? null,
                  description: it.description || null,
                })),
              }
            : undefined,
        },
        include: { items: true, party: true },
      });
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /inquiries', 'Gagal membuat inquiry.');
  }
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(UpdateInquirySchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.inquiry.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new BusinessError('Inquiry tidak ditemukan.');
      if (existing.status === 'Dikonversi') {
        throw new BusinessError('Inquiry yang sudah dikonversi tidak dapat diedit.');
      }

      // Replace items
      await tx.inquiryItem.deleteMany({ where: { inquiryId: existing.id } });

      return tx.inquiry.update({
        where: { id: existing.id },
        data: {
          date: new Date(body.date),
          channel: body.channel,
          partyId: body.partyId || null,
          prospectName: body.prospectName,
          prospectPhone: body.prospectPhone || null,
          prospectEmail: body.prospectEmail || null,
          itemsMode: body.itemsMode,
          itemsText: body.itemsText || null,
          notes: body.notes || null,
          followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
          items: body.items && body.items.length > 0
            ? {
                create: body.items.map((it) => ({
                  itemName: it.itemName,
                  quantity: it.quantity ?? null,
                  unit: it.unit || null,
                  estimatedPrice: it.estimatedPrice ?? null,
                  description: it.description || null,
                })),
              }
            : undefined,
        },
        include: { items: true, party: true },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /inquiries/:id', 'Gagal memperbarui inquiry.');
  }
});

// ─── DELETE /:id (only Baru/Diproses, NOT after conversion) ───────────────
router.delete('/:id', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  try {
    const existing = await prisma.inquiry.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Inquiry tidak ditemukan.' });
    if (existing.status === 'Dikonversi') {
      return res.status(400).json({ error: 'Inquiry yang sudah dikonversi tidak dapat dihapus.' });
    }
    await prisma.inquiry.delete({ where: { id: existing.id } });
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /inquiries/:id', 'Gagal menghapus inquiry.');
  }
});

// ─── PATCH /:id/status ────────────────────────────────────────────────────
// Allowed: Baru ↔ Diproses, Diproses → Hilang/Ditutup. Dikonversi only via convert flow.
router.patch('/:id/status', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  const body = validateBody(InquiryStatusUpdateSchema, req.body, res);
  if (!body) return;
  try {
    const existing = await prisma.inquiry.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Inquiry tidak ditemukan.' });
    if (existing.status === 'Dikonversi') {
      return res.status(400).json({ error: 'Inquiry sudah dikonversi, status terkunci.' });
    }
    if (body.status === 'Dikonversi') {
      return res.status(400).json({ error: 'Gunakan endpoint konversi untuk menjadikan Penawaran.' });
    }
    if (body.status === 'Hilang' && (!body.lossReason || body.lossReason.length < 5)) {
      return res.status(400).json({ error: 'Alasan hilang minimal 5 karakter.' });
    }

    const updated = await prisma.inquiry.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        lossReason: body.status === 'Hilang' ? body.lossReason : null,
      },
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /inquiries/:id/status', 'Gagal mengubah status inquiry.');
  }
});

// ─── GET /:id/convert-payload ────────────────────────────────────────────
// Returns prefilled data for QuotationModal. Auto-creates a Customer Party
// if the inquiry was logged for a prospect (no partyId yet) so the modal
// can submit immediately.
router.get('/:id/convert-payload', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const inquiry = await tx.inquiry.findUnique({
        where: { id: req.params.id as string },
        include: { items: true, party: true },
      });
      if (!inquiry) throw new BusinessError('Inquiry tidak ditemukan.');
      if (inquiry.status === 'Dikonversi') {
        throw new BusinessError('Inquiry sudah dikonversi.');
      }
      if (inquiry.status === 'Hilang' || inquiry.status === 'Ditutup') {
        throw new BusinessError(`Inquiry ${inquiry.status} tidak bisa dikonversi.`);
      }

      // Resolve party — auto-create if prospect-only
      let partyId = inquiry.partyId;
      let partyName = inquiry.party?.name ?? inquiry.prospectName;
      if (!partyId) {
        const newParty = await tx.party.create({
          data: {
            name: inquiry.prospectName,
            partyType: 'Customer',
            phone: inquiry.prospectPhone,
            email: inquiry.prospectEmail,
          },
        });
        partyId = newParty.id;
        partyName = newParty.name;
        await tx.inquiry.update({ where: { id: inquiry.id }, data: { partyId } });
      }

      return {
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.inquiryNumber,
        partyId,
        partyName,
        // Pass through items if user used structured mode. Otherwise leave
        // empty — sales rep types items in QuotationModal.
        items: inquiry.itemsMode === 'structured'
          ? inquiry.items.map((it) => ({
              itemName: it.itemName,
              quantity: it.quantity != null ? Number(it.quantity) : 1,
              unit: it.unit ?? 'Kg',
              rate: it.estimatedPrice != null ? Number(it.estimatedPrice) : 0,
              description: it.description,
            }))
          : [],
        itemsText: inquiry.itemsText,
        notes: inquiry.notes,
      };
    });

    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'GET /inquiries/:id/convert-payload', 'Gagal menyiapkan konversi.');
  }
});

// ─── POST /:id/link — attach Quotation after frontend creates it ──────────
router.post('/:id/link', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  const { quotationId } = req.body ?? {};
  if (!quotationId || typeof quotationId !== 'string') {
    return res.status(400).json({ error: 'quotationId wajib diisi.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const inq = await tx.inquiry.findUnique({ where: { id: req.params.id as string } });
      if (!inq) throw new BusinessError('Inquiry tidak ditemukan.');
      if (inq.quotationId) throw new BusinessError('Inquiry sudah ter-link ke Penawaran lain.');
      const q = await tx.quotation.findUnique({ where: { id: quotationId } });
      if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
      return tx.inquiry.update({
        where: { id: inq.id },
        data: { quotationId, status: 'Dikonversi', convertedAt: new Date() },
        include: { quotation: { select: { id: true, quotationNumber: true } } },
      });
    });
    logger.info({ inquiryId: req.params.id, quotationId }, 'Inquiry linked to quotation');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /inquiries/:id/link', 'Gagal menghubungkan inquiry ke penawaran.');
  }
});

export default router;
