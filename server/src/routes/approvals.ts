import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { roleMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { submitPurchaseInvoiceInTx } from '../services/purchaseInvoiceSubmit';
import { submitProductionRunInTx } from '../services/productionRunSubmit';
import { submitSalesReturnInTx } from '../services/salesReturnSubmit';
import { CreatePurchaseInvoiceSchema, CreateProductionRunSchema, CreateSalesReturnSchema } from '../utils/schemas';
import { notifyUsers } from '../services/notificationService';

const router = Router();

// ── Rules Management (Admin only) ────────────────────────────────────────────

// GET /rules — list all approval rules
router.get('/rules', roleMiddleware(['Admin']), async (_req, res) => {
  try {
    const rules = await prisma.approvalRule.findMany({
      orderBy: [{ documentType: 'asc' }, { minAmount: 'asc' }],
    });
    res.json(rules);
  } catch (error) {
    logger.error(error, 'GET /approvals/rules error');
    res.status(500).json({ error: 'Gagal mengambil aturan approval.' });
  }
});

// POST /rules — create approval rule
router.post('/rules', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const { documentType, minAmount, requiredRole } = req.body;
    const rule = await prisma.approvalRule.create({
      data: { documentType, minAmount: Number(minAmount), requiredRole },
    });
    res.status(201).json(rule);
  } catch (error) {
    logger.error(error, 'POST /approvals/rules error');
    res.status(500).json({ error: 'Gagal membuat aturan approval.' });
  }
});

// PUT /rules/:id — update rule
router.put('/rules/:id', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const { documentType, minAmount, requiredRole, isActive } = req.body;
    const rule = await prisma.approvalRule.update({
      where: { id: req.params.id as string },
      data: { documentType, minAmount: Number(minAmount), requiredRole, isActive },
    });
    res.json(rule);
  } catch (error) {
    logger.error(error, 'PUT /approvals/rules error');
    res.status(500).json({ error: 'Gagal memperbarui aturan.' });
  }
});

// DELETE /rules/:id
router.delete('/rules/:id', roleMiddleware(['Admin']), async (req, res) => {
  try {
    await prisma.approvalRule.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Gagal menghapus aturan.' });
  }
});

// ── Approval Requests ────────────────────────────────────────────────────────

// GET /requests — list approval requests (pending first)
router.get('/requests', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = status;
    // Non-Admin hanya lihat request yang mereka ajukan sendiri (transparansi
    // status); Admin lihat semua antrian untuk di-review.
    if (req.user!.role !== 'Admin') where.requestedBy = req.user!.userId;

    const requests = await prisma.approvalRequest.findMany({
      where,
      include: {
        requester: { select: { fullName: true, role: true } },
        approver: { select: { fullName: true } },
        rejecter: { select: { fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    res.json(requests);
  } catch (error) {
    logger.error(error, 'GET /approvals/requests error');
    res.status(500).json({ error: 'Gagal mengambil daftar approval.' });
  }
});

// POST /requests — submit approval request
router.post('/requests', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const { documentType, documentId, documentNumber, amount } = req.body;

    // Check if approval rule matches
    const rule = await prisma.approvalRule.findFirst({
      where: {
        documentType,
        minAmount: { lte: Number(amount) },
        isActive: true,
      },
      orderBy: { minAmount: 'desc' },
    });

    if (!rule) {
      return res.json({ required: false, message: 'Tidak perlu approval.' });
    }

    // Check existing pending request
    const existing = await prisma.approvalRequest.findFirst({
      where: { documentType, documentId, status: 'Pending' },
    });
    if (existing) {
      return res.status(400).json({ error: 'Sudah ada request approval yang pending.' });
    }

    const request = await prisma.approvalRequest.create({
      data: {
        documentType,
        documentId,
        documentNumber,
        amount: Number(amount),
        requestedBy: req.user!.userId,
      },
    });

    res.status(201).json({ required: true, request });
  } catch (error) {
    logger.error(error, 'POST /approvals/requests error');
    res.status(500).json({ error: 'Gagal membuat request approval.' });
  }
});

// POST /requests/:id/approve — eksekusi dokumen dari payload, lalu tandai Approved.
// Dokumen baru DIBUAT di sini (gate "approve-before-effect"). Submit asli
// dijalankan dgn requester sbg pembuat dokumen (audit menunjuk si penginput).
router.post('/requests/:id/approve', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request) return res.status(404).json({ error: 'Request tidak ditemukan.' });
    if (request.status !== 'Pending') return res.status(400).json({ error: 'Request sudah diproses.' });

    let createdDoc: { id: string; number: string } | null = null;

    // Kalau ada payload (gate approve-before-effect) → eksekusi submit asli.
    if (request.payload != null) {
      const creator = request.requestedBy;
      createdDoc = await prisma.$transaction(async (tx) => {
        if (request.documentType === 'PurchaseInvoice') {
          const parsed = CreatePurchaseInvoiceSchema.safeParse(request.payload);
          if (!parsed.success) throw new Error('Payload invoice tidak valid: ' + parsed.error.issues[0]?.message);
          const inv = await submitPurchaseInvoiceInTx(tx, parsed.data as any, creator);
          return { id: inv.id, number: inv.invoiceNumber };
        }
        if (request.documentType === 'ProductionRun') {
          const parsed = CreateProductionRunSchema.safeParse(request.payload);
          if (!parsed.success) throw new Error('Payload produksi tidak valid: ' + parsed.error.issues[0]?.message);
          const run = await submitProductionRunInTx(tx, parsed.data as any, creator);
          if (!run) throw new Error('Gagal membuat data produksi.');
          return { id: run.id, number: run.runNumber };
        }
        if (request.documentType === 'SalesReturn') {
          const parsed = CreateSalesReturnSchema.safeParse(request.payload);
          if (!parsed.success) throw new Error('Payload retur tidak valid: ' + parsed.error.issues[0]?.message);
          const ret = await submitSalesReturnInTx(tx, parsed.data as any, creator);
          if (!ret) throw new Error('Gagal membuat retur penjualan.');
          return { id: ret.id, number: ret.returnNumber };
        }
        throw new Error('Tipe dokumen tidak didukung untuk eksekusi: ' + request.documentType);
      }, { timeout: 30000 });
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: 'Approved',
        approvedBy: req.user!.userId,
        notes: req.body.notes,
        decidedAt: new Date(),
        ...(createdDoc ? { documentId: createdDoc.id, documentNumber: createdDoc.number } : {}),
      },
    });

    await notifyUsers(prisma, {
      userIds: [request.requestedBy],
      type: 'approval_approved',
      title: 'Pengajuan Anda disetujui',
      message: createdDoc
        ? `Pengajuan disetujui — dokumen ${createdDoc.number} telah dibuat.`
        : 'Pengajuan Anda telah disetujui.',
      metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType, documentId: createdDoc?.id },
    });
    logger.info({ requestId: request.id, documentType: request.documentType, createdDoc, approvedBy: req.user!.userId }, 'Approval approved + document executed');
    res.json({ ...updated, createdDocument: createdDoc });
  } catch (error: any) {
    logger.error(error, 'POST /approvals/requests/:id/approve error');
    res.status(400).json({ error: error?.message || 'Gagal approve request.' });
  }
});

// POST /requests/:id/reject
router.post('/requests/:id/reject', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request) return res.status(404).json({ error: 'Request tidak ditemukan.' });
    if (request.status !== 'Pending') return res.status(400).json({ error: 'Request sudah diproses.' });

    const updated = await prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: 'Rejected',
        rejectedBy: req.user!.userId,
        notes: req.body.notes,
        decidedAt: new Date(),
      },
    });

    await notifyUsers(prisma, {
      userIds: [request.requestedBy],
      type: 'approval_rejected',
      title: 'Pengajuan ditolak',
      message: `Pengajuan ditolak: ${req.body.notes ?? '-'}`,
      metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType },
    });
    res.json(updated);
  } catch (error) {
    logger.error(error, 'POST /approvals/requests/:id/reject error');
    res.status(500).json({ error: 'Gagal reject request.' });
  }
});

// POST /requests/:id/request-revision — Admin minta staff perbaiki pengajuan.
// Status → NeedsRevision (reversible), wajib alasan. Dokumen TIDAK dibuat.
router.post('/requests/:id/request-revision', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request) return res.status(404).json({ error: 'Request tidak ditemukan.' });
    if (request.status !== 'Pending') return res.status(400).json({ error: 'Request sudah diproses.' });

    const notes = (req.body?.notes ?? '').trim();
    if (!notes) return res.status(400).json({ error: 'Alasan revisi wajib diisi.' });

    const updated = await prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: 'NeedsRevision',
        rejectedBy: req.user!.userId, // reuse kolom utk catat siapa minta revisi
        notes,
        decidedAt: new Date(),
      },
    });
    await notifyUsers(prisma, {
      userIds: [request.requestedBy],
      type: 'approval_revision',
      title: 'Pengajuan perlu revisi',
      message: `Pengajuan perlu revisi: ${notes}`,
      metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType },
    });
    logger.info({ requestId: request.id, by: req.user!.userId }, 'Approval request-revision');
    res.json(updated);
  } catch (error) {
    logger.error(error, 'POST /approvals/requests/:id/request-revision error');
    res.status(500).json({ error: 'Gagal meminta revisi.' });
  }
});

// PUT /requests/:id/resubmit — staff perbaiki payload & ajukan ulang.
// Hanya pemilik pengajuan + status NeedsRevision. Status → Pending (lewat gate
// lagi). Dokumen TETAP dibuat saat approve, bukan di sini.
router.put('/requests/:id/resubmit', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request) return res.status(404).json({ error: 'Request tidak ditemukan.' });
    if (request.requestedBy !== req.user!.userId && req.user!.role !== 'Admin') {
      return res.status(403).json({ error: 'Bukan pengajuan Anda.' });
    }
    if (request.status !== 'NeedsRevision') {
      return res.status(400).json({ error: 'Hanya pengajuan berstatus Perlu Revisi yang dapat diajukan ulang.' });
    }

    const rawPayload = req.body?.payload;
    if (!rawPayload || typeof rawPayload !== 'object') {
      return res.status(400).json({ error: 'Payload tidak valid.' });
    }

    let amount = 0;
    if (request.documentType === 'PurchaseInvoice') {
      const parsed = CreatePurchaseInvoiceSchema.safeParse(rawPayload);
      if (!parsed.success) return res.status(400).json({ error: 'Data invoice tidak valid: ' + parsed.error.issues[0]?.message });
      amount = (parsed.data.items ?? []).reduce((s: number, it: any) => s + Number(it.amount ?? 0), 0) + Number((parsed.data as any).biayaLain ?? 0);
    } else if (request.documentType === 'ProductionRun') {
      const parsed = CreateProductionRunSchema.safeParse(rawPayload);
      if (!parsed.success) return res.status(400).json({ error: 'Data produksi tidak valid: ' + parsed.error.issues[0]?.message });
      amount = (parsed.data.inputs ?? []).reduce((s: number, it: any) => s + Number(it.quantity ?? 0), 0);
    } else {
      return res.status(400).json({ error: 'Tipe dokumen tidak didukung.' });
    }

    const updated = await prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        payload: rawPayload,
        amount,
        status: 'Pending',
        rejectedBy: null,
        decidedAt: null,
      },
    });
    logger.info({ requestId: request.id, by: req.user!.userId }, 'Approval resubmitted');
    res.json(updated);
  } catch (error) {
    logger.error(error, 'PUT /approvals/requests/:id/resubmit error');
    res.status(500).json({ error: 'Gagal mengajukan ulang.' });
  }
});

// GET /check — check if a document needs approval
router.get('/check', roleMiddleware(['Admin', 'Accountant']), async (req, res) => {
  try {
    const { documentType, amount } = req.query;
    const rule = await prisma.approvalRule.findFirst({
      where: {
        documentType: documentType as string,
        minAmount: { lte: Number(amount) },
        isActive: true,
      },
      orderBy: { minAmount: 'desc' },
    });

    res.json({ required: !!rule, rule });
  } catch (error) {
    res.status(500).json({ error: 'Gagal cek approval.' });
  }
});

export default router;
