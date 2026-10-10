import { Router, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { saveAttachment, deleteAttachment, getFullPath, detectMimeFromMagicBytes, ATTACHMENT_MIME } from '../utils/fileStorage';
import { handleRouteError } from '../utils/errors';
import { ATTACHMENT_REF_TYPES, checkAttachmentAccess, isAttachmentRefType, type AccessResult } from '../services/attachmentAccess';

const router = Router();

// Multer config (memory storage, max 5MB per file)
const ALLOWED_MIME = ATTACHMENT_MIME;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;

const actorOf = (req: AuthRequest) => (req.user ? { userId: req.user.userId, role: req.user.role } : undefined);
const deny = (res: Response, access: Exclude<AccessResult, { ok: true }>) => res.status(access.status).json({ error: access.error });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipe file tidak didukung: ${file.mimetype}. Hanya JPG, PNG, WebP, dan PDF.`));
    }
  },
});


// POST /api/attachments/upload
router.post(
  '/upload',
  upload.array('files', MAX_FILES),
  async (req: AuthRequest, res: Response) => {
    try {
      const { referenceType, referenceId } = req.body;

      if (!referenceType || !referenceId) {
        return res.status(400).json({ error: 'referenceType dan referenceId wajib diisi.' });
      }

      if (!isAttachmentRefType(referenceType)) {
        return res.status(400).json({
          error: `referenceType harus salah satu dari: ${ATTACHMENT_REF_TYPES.join(', ')}.`,
        });
      }

      // Upload needs `edit` on the document's module (approval requests: the requester).
      const access = await checkAttachmentAccess(actorOf(req), referenceType, String(referenceId), 'edit');
      if (!access.ok) return deny(res, access);

      // Validate reference exists
      if (referenceType === 'payment') {
        const payment = await prisma.payment.findUnique({ where: { id: referenceId } });
        if (!payment) return res.status(404).json({ error: 'Transaksi pembayaran tidak ditemukan.' });
      } else if (referenceType === 'journal') {
        const journal = await prisma.journalEntry.findUnique({ where: { id: referenceId } });
        if (!journal) return res.status(404).json({ error: 'Jurnal tidak ditemukan.' });
      } else if (referenceType === 'purchase_invoice') {
        const pi = await prisma.purchaseInvoice.findUnique({ where: { id: referenceId } });
        if (!pi) return res.status(404).json({ error: 'Invoice pembelian tidak ditemukan.' });
      } else if (referenceType === 'sales_invoice') {
        const si = await prisma.salesInvoice.findUnique({ where: { id: referenceId } });
        if (!si) return res.status(404).json({ error: 'Invoice penjualan tidak ditemukan.' });
      } else if (referenceType === 'sales_order') {
        const so = await prisma.salesOrder.findUnique({ where: { id: referenceId } });
        if (!so) return res.status(404).json({ error: 'Pesanan (SO) tidak ditemukan.' });
      } else if (referenceType === 'delivery_order') {
        const dord = await prisma.deliveryOrder.findUnique({ where: { id: referenceId } });
        if (!dord) return res.status(404).json({ error: 'Surat Jalan tidak ditemukan.' });
      } else if (referenceType === 'goods_receipt') {
        const stt = await prisma.goodsReceipt.findUnique({ where: { id: referenceId } });
        if (!stt) return res.status(404).json({ error: 'STT/BPB tidak ditemukan.' });
      } else if (referenceType === 'approval_request') {
        // Lampiran pengajuan (dokumen belum dibuat). Hanya pengaju sendiri atau
        // pemegang approval.view_all; hanya selagi masih bisa diputuskan/direvisi.
        const ar = await prisma.approvalRequest.findUnique({ where: { id: referenceId } });
        if (!ar) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
        if (!['Pending', 'NeedsRevision'].includes(ar.status)) {
          return res.status(400).json({ error: 'Pengajuan sudah diproses; lampirkan ke dokumennya.' });
        }
      }

      // Check existing count
      const existingCount = await prisma.transactionAttachment.count({
        where: { referenceType, referenceId },
      });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
      }

      if (existingCount + files.length > MAX_FILES) {
        return res.status(400).json({
          error: `Maksimal ${MAX_FILES} file per transaksi. Saat ini sudah ada ${existingCount} file.`,
        });
      }

      // Verify magic bytes against claimed mimetype before saving.
      for (const file of files) {
        const detected = detectMimeFromMagicBytes(file.buffer);
        if (!detected || !ALLOWED_MIME.includes(detected)) {
          return res.status(400).json({
            error: `File "${file.originalname}" tidak dikenali sebagai JPG/PNG/WebP/PDF (magic-byte mismatch).`,
          });
        }
        if (detected !== file.mimetype) {
          return res.status(400).json({
            error: `File "${file.originalname}" Content-Type (${file.mimetype}) tidak cocok dengan isi file (${detected}).`,
          });
        }
      }

      const results = [];
      for (const file of files) {
        const saved = await saveAttachment(file.buffer, file.originalname, file.mimetype);
        const record = await prisma.transactionAttachment.create({
          data: {
            referenceType,
            referenceId,
            fileName: file.originalname,
            storedName: saved.storedName,
            mimeType: saved.mimeType,
            fileSize: saved.fileSize,
            filePath: saved.filePath,
            uploadedBy: req.user!.userId,
          },
        });
        results.push(record);
      }

      return res.status(201).json(results);
    } catch (error: any) {
      if (error.message?.includes('Tipe file tidak didukung')) {
        return res.status(400).json({ error: error.message });
      }
      return handleRouteError(res, error, 'POST /attachments/upload', 'Gagal mengupload file.');
    }
  },
);

// GET /api/attachments/file/:id: serve file (auth-gated)
// NOTE: Must be registered BEFORE the /:referenceType/:referenceId route below,
// otherwise Express matches /:referenceType/:referenceId first (with type='file').
router.get('/file/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const attachment = await prisma.transactionAttachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'File tidak ditemukan.' });
    }

    // Reading a file needs `view` on the module of its document.
    const access = await checkAttachmentAccess(actorOf(req), attachment.referenceType, attachment.referenceId, 'view');
    if (!access.ok) return deny(res, access);

    const fullPath = getFullPath(attachment.filePath);
    const isImage = attachment.mimeType.startsWith('image/');

    res.setHeader('Content-Type', attachment.mimeType);
    if (isImage) {
      res.setHeader('Content-Disposition', 'inline');
    } else {
      // RFC 5987: encode filename to prevent header injection from
      // user-controlled fileName field. ASCII fallback for legacy clients.
      const safeAscii = attachment.fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_');
      const encoded = encodeURIComponent(attachment.fileName);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeAscii}"; filename*=UTF-8''${encoded}`,
      );
    }
    return res.sendFile(fullPath);
  } catch (error) {
    return handleRouteError(res, error, 'GET /attachments/file/:id', 'Gagal mengambil file.');
  }
});

// GET /api/attachments/invoice/:type/:id/related
// Returns all attachments related to an invoice:
// - the invoice's own attachments (source: 'invoice')
// - attachments from every payment that has an active allocation to this invoice
//   (source: 'payment', annotated with payment number/type/date so the UI can group them)
// Type is 'sales' or 'purchase'.
router.get('/invoice/:type/:id/related', async (req: AuthRequest, res: Response) => {
  try {
    const invoiceType = req.params.type as string;
    const invoiceId = req.params.id as string;
    if (!['sales', 'purchase'].includes(invoiceType)) {
      return res.status(400).json({ error: "type harus 'sales' atau 'purchase'." });
    }
    const refType = invoiceType === 'sales' ? 'sales_invoice' : 'purchase_invoice';
    const allocInvoiceType = invoiceType === 'sales' ? 'SalesInvoice' : 'PurchaseInvoice';

    // Payment proofs linked to the invoice are part of its detail: invoice `view` is enough.
    const access = await checkAttachmentAccess(actorOf(req), refType, invoiceId, 'view');
    if (!access.ok) return deny(res, access);

    // Invoice's own attachments
    const ownAttachments = await prisma.transactionAttachment.findMany({
      where: { referenceType: refType, referenceId: invoiceId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { fullName: true } } },
    });

    // Payments that have an active allocation to this invoice
    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: allocInvoiceType, invoiceId },
      select: { paymentId: true },
    });
    const paymentIds = [...new Set(allocations.map((a) => a.paymentId))];

    // Also include deposit applications — for sales, customer_deposit_applications
    // (VendorDeposit for purchase); they reference a deposit payment that may carry
    // the transfer proof.
    if (invoiceType === 'sales') {
      const cdaPayments = await prisma.customerDepositApplication.findMany({
        where: { salesInvoiceId: invoiceId, isCancelled: false },
        select: { depositPaymentId: true },
      });
      for (const a of cdaPayments) paymentIds.push(a.depositPaymentId);
    } else {
      const vdaPayments = await prisma.vendorDepositApplication.findMany({
        where: { purchaseInvoiceId: invoiceId, isCancelled: false },
        select: { depositPaymentId: true },
      });
      for (const a of vdaPayments) paymentIds.push(a.depositPaymentId);
    }

    const uniquePaymentIds = [...new Set(paymentIds)];
    const paymentAttachments = uniquePaymentIds.length === 0
      ? []
      : await prisma.transactionAttachment.findMany({
          where: { referenceType: 'payment', referenceId: { in: uniquePaymentIds } },
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { fullName: true } } },
        });

    // Fetch payment metadata for annotation (payment_number, date, type)
    const paymentMeta = uniquePaymentIds.length === 0
      ? []
      : await prisma.payment.findMany({
          where: { id: { in: uniquePaymentIds } },
          select: { id: true, paymentNumber: true, paymentType: true, date: true, status: true },
        });
    const metaMap = new Map(paymentMeta.map((p) => [p.id, p]));

    const invoiceAttachments = ownAttachments.map((a) => ({
      ...a,
      source: 'invoice' as const,
      payment: null as null,
    }));

    const paymentAttachmentsAnnotated = paymentAttachments.map((a) => {
      const m = metaMap.get(a.referenceId);
      return {
        ...a,
        source: 'payment' as const,
        payment: m
          ? { id: m.id, paymentNumber: m.paymentNumber, paymentType: m.paymentType, date: m.date, status: m.status }
          : null,
      };
    });

    return res.json({
      invoice: invoiceAttachments,
      payments: paymentAttachmentsAnnotated,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /attachments/invoice/:type/:id/related', 'Gagal mengambil lampiran terkait.');
  }
});

// GET /api/attachments/:referenceType/:referenceId
router.get('/:referenceType/:referenceId', async (req: AuthRequest, res: Response) => {
  try {
    const referenceType = req.params.referenceType as string;
    const referenceId = req.params.referenceId as string;
    if (!isAttachmentRefType(referenceType)) {
      return res.status(400).json({ error: 'referenceType tidak dikenal.' });
    }
    const access = await checkAttachmentAccess(actorOf(req), referenceType, referenceId, 'view');
    if (!access.ok) return deny(res, access);
    const attachments = await prisma.transactionAttachment.findMany({
      where: { referenceType, referenceId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { fullName: true } },
      },
    });

    return res.json(attachments);
  } catch (error) {
    return handleRouteError(res, error, 'GET /attachments/:type/:id', 'Gagal mengambil daftar lampiran.');
  }
});

// DELETE /api/attachments/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const attachment = await prisma.transactionAttachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Lampiran tidak ditemukan.' });
    }

    // Deleting needs `edit` on the module of the attachment's document.
    const access = await checkAttachmentAccess(actorOf(req), attachment.referenceType, attachment.referenceId, 'edit');
    if (!access.ok) return deny(res, access);

    // Delete file first, then DB record
    await deleteAttachment(attachment.filePath);
    await prisma.transactionAttachment.delete({ where: { id } });

    return res.json({ message: 'Lampiran dihapus.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /attachments/:id', 'Gagal menghapus lampiran.');
  }
});

// POST /api/attachments/counts: batch count for list indicators
router.post('/counts', async (req: AuthRequest, res: Response) => {
  try {
    const { referenceType, referenceIds } = req.body;
    if (!referenceType || !Array.isArray(referenceIds) || referenceIds.length === 0) {
      return res.json({});
    }
    if (!isAttachmentRefType(referenceType)) {
      return res.status(400).json({ error: 'referenceType tidak dikenal.' });
    }
    // Batch counts: module `view` without a per-document lookup.
    const access = await checkAttachmentAccess(actorOf(req), referenceType, null, 'view');
    if (!access.ok) return deny(res, access);

    const counts = await prisma.transactionAttachment.groupBy({
      by: ['referenceId'],
      where: { referenceType, referenceId: { in: referenceIds } },
      _count: { id: true },
    });

    const result: Record<string, number> = {};
    for (const c of counts) {
      result[c.referenceId] = c._count.id;
    }
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /attachments/counts', 'Gagal mengambil jumlah lampiran.');
  }
});

export default router;
