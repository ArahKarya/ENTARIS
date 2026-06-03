import { Router, Response } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { saveAttachment, deleteAttachment, getFullPath } from '../utils/fileStorage';
import { handleRouteError } from '../utils/errors';

const router = Router();

// ─── Multer config (memory storage, max 5MB per file) ────────────────────────
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 5;

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

// Verify file content matches claimed MIME by inspecting magic bytes.
// The multer fileFilter only checks the client-supplied Content-Type header,
// which is trivially spoofable. This guards against PDF/EXE smuggling.
function detectMimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp';
  // PDF: "%PDF"
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'application/pdf';
  return null;
}

// ─── POST /api/attachments/upload ────────────────────────────────────────────
router.post(
  '/upload',
  roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']),
  upload.array('files', MAX_FILES),
  async (req: AuthRequest, res: Response) => {
    try {
      const { referenceType, referenceId } = req.body;

      if (!referenceType || !referenceId) {
        return res.status(400).json({ error: 'referenceType dan referenceId wajib diisi.' });
      }

      const ALLOWED_REF_TYPES = ['payment', 'journal', 'purchase_invoice', 'sales_invoice', 'sales_order', 'delivery_order', 'goods_receipt'];
      if (!ALLOWED_REF_TYPES.includes(referenceType)) {
        return res.status(400).json({
          error: `referenceType harus salah satu dari: ${ALLOWED_REF_TYPES.join(', ')}.`,
        });
      }

      // StaffProduksi boleh upload lampiran untuk dokumen yang mereka pegang
      // fisik: invoice pembelian, Surat Jalan, dan STT (incl. bukti jembatan
      // timbang). Tidak boleh untuk payment/journal/sales_invoice murni.
      if (req.user?.role === 'StaffProduksi'
          && !['purchase_invoice', 'sales_invoice', 'sales_order', 'delivery_order', 'goods_receipt'].includes(referenceType)) {
        return res.status(403).json({ error: 'Akses ditolak untuk tipe referensi ini.' });
      }

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

// ─── GET /api/attachments/file/:id — serve file (auth-gated) ─────────────────
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

    // Role-based access: StaffProduksi only sees invoice attachments, mirroring
    // the upload gate. Other roles already have read access via their normal
    // navigation, so the UUID-guess attack surface is reduced to admin/account.
    const role = req.user?.role;
    if (role === 'StaffProduksi' &&
        !['purchase_invoice', 'sales_invoice', 'delivery_order', 'goods_receipt'].includes(attachment.referenceType)) {
      return res.status(403).json({ error: 'Akses ditolak untuk file ini.' });
    }

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

// ─── GET /api/attachments/invoice/:type/:id/related ─────────────────────────
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

// ─── GET /api/attachments/:referenceType/:referenceId ────────────────────────
router.get('/:referenceType/:referenceId', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi', 'Viewer']), async (req: AuthRequest, res: Response) => {
  try {
    const referenceType = req.params.referenceType as string;
    const referenceId = req.params.referenceId as string;
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

// ─── DELETE /api/attachments/:id ─────────────────────────────────────────────
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const attachment = await prisma.transactionAttachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Lampiran tidak ditemukan.' });
    }

    // Only Admin, Accountant, or uploader can delete
    const isOwner = attachment.uploadedBy === req.user!.userId;
    const isPrivileged = ['Admin', 'Accountant'].includes(req.user!.role);
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ error: 'Tidak memiliki akses untuk menghapus lampiran ini.' });
    }

    // Delete file first, then DB record
    await deleteAttachment(attachment.filePath);
    await prisma.transactionAttachment.delete({ where: { id } });

    return res.json({ message: 'Lampiran berhasil dihapus.' });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /attachments/:id', 'Gagal menghapus lampiran.');
  }
});

// ─── POST /api/attachments/counts — batch count for list indicators ──────────
router.post('/counts', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi', 'Viewer']), async (req: AuthRequest, res: Response) => {
  try {
    const { referenceType, referenceIds } = req.body;
    if (!referenceType || !Array.isArray(referenceIds) || referenceIds.length === 0) {
      return res.json({});
    }

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
