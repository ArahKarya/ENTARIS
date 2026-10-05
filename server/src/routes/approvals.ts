import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireCap, AuthRequest } from '../middleware/auth';
import { hasCap } from '../services/permissionService';
import { logger } from '../lib/logger';
import { CreatePurchaseInvoiceSchema, CreateProductionRunSchema } from '../utils/schemas';
import { decideApproval } from '../services/approvalDecision';
import { buildApprovalComparison, isEditDocumentType, findPendingForTarget } from '../services/approvalEditRequests';

const router = Router();

// ── Rules Management (Admin only) ────────────────────────────────────────────

// GET /rules — list all approval rules
router.get('/rules', requireCap('approval.decide'), async (_req, res) => {
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
router.post('/rules', requireCap('approval.decide'), async (req, res) => {
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
router.put('/rules/:id', requireCap('approval.decide'), async (req, res) => {
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
router.delete('/rules/:id', requireCap('approval.decide'), async (req, res) => {
  try {
    await prisma.approvalRule.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Gagal menghapus aturan.' });
  }
});

// ── Approval Requests ────────────────────────────────────────────────────────

// GET /requests — list approval requests (pending first)
router.get('/requests', async (req: AuthRequest, res) => {
  try {
    const { status } = req.query;
    const where: any = {};
    if (status) where.status = status;
    // Non-Admin hanya lihat request yang mereka ajukan sendiri (transparansi
    // status); Admin lihat semua antrian untuk di-review.
    if (!(await hasCap(req.user!.role, 'approval.view_all'))) where.requestedBy = req.user!.userId;

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

// GET /requests/:id — satu pengajuan (utk deep-link dari notifikasi). Admin lihat
// semua; non-Admin hanya pengajuannya sendiri.
router.get('/requests/:id', async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id as string },
      include: {
        requester: { select: { fullName: true, role: true } },
        approver: { select: { fullName: true } },
        rejecter: { select: { fullName: true } },
      },
    });
    if (!request) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (!(await hasCap(req.user!.role, 'approval.view_all')) && request.requestedBy !== req.user!.userId) {
      return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    }
    res.json({ ...request, comparison: buildApprovalComparison(request) });
  } catch (error) {
    logger.error(error, 'GET /approvals/requests/:id error');
    res.status(500).json({ error: 'Gagal mengambil pengajuan.' });
  }
});

// GET /requests/:id/context — info pendukung dialog approval:
// STT sumber per baris (Invoice Pembelian) + lampiran pengajuan & lampiran STT.
router.get('/requests/:id/context', async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (!(await hasCap(req.user!.role, 'approval.view_all')) && request.requestedBy !== req.user!.userId) {
      return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    }
    const payload: any = request.payload ?? {};
    const griIds: string[] = Array.from(new Set(
      ((payload.items ?? []) as any[]).map((it) => it?.goodsReceiptItemId).filter((x: any) => typeof x === 'string' && x),
    ));
    const gris = griIds.length === 0 ? [] : await prisma.goodsReceiptItem.findMany({
      where: { id: { in: griIds } },
      select: {
        id: true, description: true, quantity: true, unit: true, lockedUnitCost: true, itemName: true,
        goodsReceipt: { select: { id: true, sttNumber: true, date: true, nomorMobil: true, driverName: true, status: true } },
        invoiceItem: { select: { purchaseInvoice: { select: { invoiceNumber: true, status: true } } } },
      },
    });
    const sttLines: Record<string, any> = {};
    const sttMap = new Map<string, any>();
    for (const g of gris) {
      const gr: any = g.goodsReceipt;
      const inv: any = (g as any).invoiceItem?.purchaseInvoice;
      sttLines[g.id] = {
        sttNumber: gr?.sttNumber, goodsReceiptId: gr?.id, description: g.description,
        sttDate: gr?.date, sttStatus: gr?.status,
        quantity: Number(g.quantity), unit: g.unit, lockedUnitCost: Number(g.lockedUnitCost),
        // Baris STT ini sudah dipakai invoice lain (non-cancel) → potensi dobel tagih.
        alreadyInvoiced: inv && inv.status !== 'Cancelled' ? inv.invoiceNumber : null,
      };
      if (gr && !sttMap.has(gr.id)) sttMap.set(gr.id, gr);
    }
    const sttIds = Array.from(sttMap.keys());
    const attSelect = { id: true, fileName: true, mimeType: true, fileSize: true, referenceType: true, referenceId: true, createdAt: true, user: { select: { fullName: true } } };
    const [requestAtt, sttAtt] = await Promise.all([
      prisma.transactionAttachment.findMany({ where: { referenceType: 'approval_request', referenceId: request.id }, orderBy: { createdAt: 'asc' }, select: attSelect }),
      sttIds.length === 0 ? Promise.resolve([] as any[]) : prisma.transactionAttachment.findMany({ where: { referenceType: 'goods_receipt', referenceId: { in: sttIds } }, orderBy: { createdAt: 'asc' }, select: attSelect }),
    ]);
    const stts = sttIds.map((id) => {
      const gr = sttMap.get(id);
      return { ...gr, attachments: sttAtt.filter((a: any) => a.referenceId === id) };
    }).sort((a, b) => String(a.sttNumber).localeCompare(String(b.sttNumber)));
    // Posisi supplier: hutang berjalan & deposit (uang muka) tersisa.
    let supplier: any = null;
    if (payload.partyId) {
      const [party, openInv] = await Promise.all([
        prisma.party.findUnique({ where: { id: payload.partyId }, select: { id: true, name: true, depositBalance: true } }),
        prisma.purchaseInvoice.aggregate({
          where: { partyId: payload.partyId, status: { in: ['Submitted', 'PartiallyPaid', 'Overdue'] as any }, outstanding: { gt: 0 } },
          _sum: { outstanding: true }, _count: { _all: true },
        }),
      ]);
      if (party) supplier = {
        name: party.name,
        depositBalance: Number(party.depositBalance ?? 0),
        openInvoiceCount: openInv._count._all,
        openOutstanding: Number(openInv._sum.outstanding ?? 0),
      };
    }
    // Riwayat harga beli per item (5 transaksi terakhir, semua supplier) utk pembanding.
    const itemIds: string[] = Array.from(new Set(
      ((payload.items ?? []) as any[]).map((it) => it?.inventoryItemId).filter((x: any) => typeof x === 'string' && x),
    ));
    const priceHistory: Record<string, any[]> = {};
    await Promise.all(itemIds.map(async (iid) => {
      const rows = await prisma.purchaseInvoiceItem.findMany({
        where: { inventoryItemId: iid, purchaseInvoice: { status: { not: 'Cancelled' as any } } },
        orderBy: [{ purchaseInvoice: { date: 'desc' } }],
        take: 5,
        select: { rate: true, quantity: true, purchaseInvoice: { select: { invoiceNumber: true, date: true, partyId: true, supplier: { select: { name: true } } } } },
      });
      priceHistory[iid] = rows.map((r: any) => ({
        rate: Number(r.rate), quantity: Number(r.quantity),
        invoiceNumber: r.purchaseInvoice?.invoiceNumber, date: r.purchaseInvoice?.date,
        supplier: r.purchaseInvoice?.supplier?.name,
        sameSupplier: r.purchaseInvoice?.partyId === payload.partyId,
      }));
    }));
    res.json({ sttLines, stts, requestAttachments: requestAtt, supplier, priceHistory, comparison: buildApprovalComparison(request) });
  } catch (error) {
    logger.error(error, 'GET /approvals/requests/:id/context error');
    res.status(500).json({ error: 'Gagal mengambil detail pendukung.' });
  }
});

// GET /pending?documentType=&documentId= — apakah ada pengajuan Pending utk dokumen ini
// (utk badge "Menunggu persetujuan" + disable tombol edit/revisi). Murah: 1 query terindeks.
router.get('/pending', async (req, res) => {
  try {
    const { documentType, documentId } = req.query;
    if (!isEditDocumentType(documentType) || typeof documentId !== 'string' || !documentId) {
      return res.status(400).json({ error: 'documentType/documentId tidak valid.' });
    }
    const pending = await findPendingForTarget(prisma, documentType, documentId);
    res.json({ pending: pending ? { id: pending.id, createdAt: pending.createdAt } : null });
  } catch (error) {
    logger.error(error, 'GET /approvals/pending error');
    res.status(500).json({ error: 'Gagal memeriksa pengajuan.' });
  }
});

// POST /requests — submit approval request
router.post('/requests', async (req: AuthRequest, res) => {
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
router.post('/requests/:id/approve', requireCap('approval.decide'), async (req: AuthRequest, res) => {
  const result = await decideApproval({
    requestId: req.params.id as string,
    action: 'approve',
    actorUserId: req.user!.userId,
    note: req.body?.notes,
  });
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

// POST /requests/:id/reject
router.post('/requests/:id/reject', requireCap('approval.decide'), async (req: AuthRequest, res) => {
  const result = await decideApproval({
    requestId: req.params.id as string,
    action: 'reject',
    actorUserId: req.user!.userId,
    note: req.body?.notes,
  });
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

// POST /requests/:id/request-revision — Admin minta staff perbaiki pengajuan.
// Status → NeedsRevision (reversible), wajib alasan. Dokumen TIDAK dibuat.
router.post('/requests/:id/request-revision', requireCap('approval.decide'), async (req: AuthRequest, res) => {
  const result = await decideApproval({
    requestId: req.params.id as string,
    action: 'revise',
    actorUserId: req.user!.userId,
    note: req.body?.notes,
  });
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json(result);
});

// PUT /requests/:id/resubmit — staff perbaiki payload & ajukan ulang.
// Hanya pemilik pengajuan + status NeedsRevision. Status → Pending (lewat gate
// lagi). Dokumen TETAP dibuat saat approve, bukan di sini.
router.put('/requests/:id/resubmit', async (req: AuthRequest, res) => {
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request) return res.status(404).json({ error: 'Request tidak ditemukan.' });
    if (request.requestedBy !== req.user!.userId && !(await hasCap(req.user!.role, 'approval.view_all'))) {
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
router.get('/check', async (req, res) => {
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
  } catch {
    res.status(500).json({ error: 'Gagal cek approval.' });
  }
});

export default router;
