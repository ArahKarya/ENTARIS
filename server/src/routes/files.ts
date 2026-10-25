// Unduh berkas lewat tiket bertanda tangan (dipakai agen MCP). Dipasang SEBELUM authMiddleware karena
// agen tidak membawa cookie sesi; otorisasi = tiket (pengguna + objek + kedaluwarsa + sekali pakai) DAN
// pemeriksaan ACL pengguna ulang pada saat unduh.
import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getFullPath, contentDisposition } from '../utils/fileStorage';
import { checkAttachmentAccess, isAttachmentRefType } from '../services/attachmentAccess';
import { consumeJti, fileTicketSecret, verifyFileTicket } from '../services/fileTicket';
import { resolveDocumentPdf } from '../services/documentPdf';

const router = Router();

const deny = (res: Response, status: number, error: string) => res.status(status).json({ error });

router.get('/dl/:ticket', async (req: Request, res: Response) => {
  try {
    const p = verifyFileTicket(fileTicketSecret(), String(req.params.ticket));
    if (!p) return deny(res, 401, 'Tautan unduh tidak valid atau sudah kedaluwarsa.');

    const user = await prisma.user.findUnique({ where: { id: p.uid }, select: { id: true, role: true, isActive: true } });
    if (!user || !user.isActive) return deny(res, 403, 'Akses ditolak.');
    const actor = { userId: user.id, role: user.role };

    if (p.kind === 'attachment') {
      const att = await prisma.transactionAttachment.findUnique({ where: { id: p.ref } });
      if (!att) return deny(res, 404, 'Lampiran tidak ditemukan.');
      if (!isAttachmentRefType(att.referenceType)) return deny(res, 403, 'Akses ditolak.');
      const access = await checkAttachmentAccess(actor, att.referenceType, att.referenceId, 'view');
      if (!access.ok) return deny(res, access.status, access.error);
      // Sekali pakai: dikonsumsi setelah semua pemeriksaan lolos agar unduhan gagal bisa diulang.
      if (!consumeJti(p.jti, p.exp)) return deny(res, 410, 'Tautan unduh sudah dipakai.');
      res.setHeader('Content-Type', att.mimeType);
      res.setHeader('Content-Disposition', contentDisposition(att.fileName, false));
      res.setHeader('Cache-Control', 'private, no-store');
      // Path ditetapkan server (bukan input pengguna); izinkan dotfiles agar folder data berawalan titik tetap terbaca.
      return res.sendFile(getFullPath(att.filePath), { dotfiles: 'allow' });
    }

    // document-pdf
    const pdf = await resolveDocumentPdf(actor, p.ref);
    if (!pdf.ok) return deny(res, pdf.status, pdf.error);
    if (!consumeJti(p.jti, p.exp)) return deny(res, 410, 'Tautan unduh sudah dipakai.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(pdf.fileName, false));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(pdf.buffer);
  } catch (error) {
    logger.error({ error }, 'GET /files/dl error');
    return deny(res, 500, 'Gagal mengunduh berkas.');
  }
});

export default router;
