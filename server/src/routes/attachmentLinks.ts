import { Router, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { AuthRequest } from '../middleware/auth';
import { handleRouteError } from '../utils/errors';
import { checkAttachmentAccess, isAttachmentRefType } from '../services/attachmentAccess';
import { can } from '../services/permissionService';
import { isPdfKind, PDF_DOCS } from '../services/documentPdf';
import { buildDownloadUrl, FILE_TICKET_TTL_SEC, fileTicketSecret, signFileTicket } from '../services/fileTicket';

const router = Router();
const actorOf = (req: AuthRequest) => (req.user ? { userId: req.user.userId, role: req.user.role } : undefined);

const attachmentLinkSchema = z.object({ attachmentId: z.string().uuid('attachmentId harus UUID.') });

// POST /api/attachments/download-link — tiket unduh isi lampiran (ACL `view` dokumen induk).
router.post('/download-link', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = attachmentLinkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' });
    const att = await prisma.transactionAttachment.findUnique({ where: { id: parsed.data.attachmentId } });
    if (!att) return res.status(404).json({ error: 'Lampiran tidak ditemukan.' });
    if (!isAttachmentRefType(att.referenceType)) return res.status(400).json({ error: 'Jenis dokumen lampiran tidak dikenal.' });
    const access = await checkAttachmentAccess(actorOf(req), att.referenceType, att.referenceId, 'view');
    if (!access.ok) return res.status(access.status).json({ error: access.error });

    const ticket = signFileTicket(fileTicketSecret(), { uid: req.user!.userId, kind: 'attachment', ref: att.id, fn: att.fileName });
    const { url, absolute } = buildDownloadUrl(ticket);
    return res.json({
      url,
      fileName: att.fileName,
      mimeType: att.mimeType,
      size: att.fileSize,
      expiresInSeconds: FILE_TICKET_TTL_SEC,
      oneTimeUse: true,
      ...(absolute ? {} : { warning: 'PUBLIC_BASE_URL belum diatur: url relatif, tambahkan alamat publik aplikasi di depannya.' }),
    });
  } catch (error) {
    return handleRouteError(res, error, 'POST /attachments/download-link', 'Gagal membuat tautan unduh.');
  }
});

const pdfLinkSchema = z.object({
  docType: z.string().min(1).max(40),
  docId: z.string().min(1).max(100),
});

// Modul RBAC per jenis PDF (view). Pemeriksaan penuh tetap terjadi lagi saat unduh (GET detail atas nama pengguna).
const PDF_MODULE: Record<string, string> = {
  quotation: 'quotation',
  proforma_invoice: 'proforma_invoice',
  sales_order: 'sales_order',
  purchase_order: 'purchase_order',
  delivery_order: 'delivery_order',
  goods_receipt: 'goods_receipt',
  stock_transfer: 'stock_transfer',
  stock_opname: 'stock_opname',
  production_run: 'production',
  sales_invoice: 'sales_invoice',
  purchase_invoice: 'purchase_invoice',
  report_profit_loss: 'reports',
  report_balance_sheet: 'reports',
  report_trial_balance: 'reports',
  report_cash_flow: 'reports',
  report_aging: 'reports',
  report_daily: 'reports',
};

// POST /api/attachments/pdf-link — tiket unduh PDF dokumen (dirender server dengan templat yang sama dengan UI).
router.post('/pdf-link', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = pdfLinkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' });
    const { docType, docId } = parsed.data;
    if (!isPdfKind(docType)) {
      return res.status(400).json({ error: `docType harus salah satu dari: ${Object.keys(PDF_DOCS).join(', ')}.` });
    }
    if (!req.user || !(await can(req.user.role, PDF_MODULE[docType], 'view'))) {
      return res.status(403).json({ error: 'Akses ditolak: Tidak memiliki izin.' });
    }
    if (!PDF_DOCS[docType].path(encodeURIComponent(docId))) {
      return res.status(400).json({ error: `docId tidak valid untuk ${docType}. ${PDF_DOCS[docType].hint ?? ''}`.trim() });
    }
    const label = PDF_DOCS[docType].label.replace(/\s+/g, '-');
    const suffix = docType.startsWith('report_') ? docId.replace(/\.\./g, '-sd-') : docId.slice(0, 8);
    const fn = `${label}-${suffix}.pdf`;
    const ticket = signFileTicket(fileTicketSecret(), { uid: req.user.userId, kind: 'document-pdf', ref: `${docType}:${docId}`, fn });
    const { url, absolute } = buildDownloadUrl(ticket);
    return res.json({
      url,
      docType,
      docId,
      mimeType: 'application/pdf',
      expiresInSeconds: FILE_TICKET_TTL_SEC,
      oneTimeUse: true,
      ...(absolute ? {} : { warning: 'PUBLIC_BASE_URL belum diatur: url relatif, tambahkan alamat publik aplikasi di depannya.' }),
    });
  } catch (error) {
    return handleRouteError(res, error, 'POST /attachments/pdf-link', 'Gagal membuat tautan PDF.');
  }
});

export default router;
