// Lampiran Pengajuan Pembayaran: logika bersama untuk jalur multipart (UI), jalur base64 (MCP), dan
// jalur salin-dari-lampiran-chat (MCP). Satu pintu validasi supaya aturan tidak bercabang.

import fs from 'node:fs/promises';
import type { PaymentRequestAttachment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { BusinessError } from '../utils/errors';
import { ATTACHMENT_MIME, detectMimeFromMagicBytes, getFullPath, saveAttachment } from '../utils/fileStorage';

export const PR_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const PR_MAX_FILES_PER_REQUEST = 10;

export type AttachmentScope = 'REQUEST' | 'SETTLEMENT';

export interface IncomingPrFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

/** Nama berkas aman: tanpa path & karakter kontrol, panjang terbatas. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'lampiran';
  // eslint-disable-next-line no-control-regex -- membuang karakter kontrol dari nama berkas
  const clean = base.replace(/[\u0000-\u001f]/g, '').trim();
  return (clean || 'lampiran').slice(0, 255);
}

/**
 * Validasi (jumlah, ukuran, jenis via magic byte) lalu simpan. Pemanggil sudah memeriksa hak akses &
 * status editable. Melempar BusinessError (400) bila ada yang tidak valid; tidak menyimpan apa pun bila gagal.
 */
export async function addPaymentRequestAttachments(
  paymentRequestId: string,
  scope: AttachmentScope,
  uploadedBy: string,
  files: IncomingPrFile[],
): Promise<PaymentRequestAttachment[]> {
  if (files.length === 0) throw new BusinessError('Tidak ada file yang diupload.');
  const existing = await prisma.paymentRequestAttachment.count({ where: { paymentRequestId, scope } });
  if (existing + files.length > PR_MAX_FILES_PER_REQUEST) {
    throw new BusinessError(`Maksimal ${PR_MAX_FILES_PER_REQUEST} lampiran per pengajuan.`);
  }
  for (const f of files) {
    if (f.buffer.length === 0) throw new BusinessError(`File "${f.originalname}" kosong.`);
    if (f.buffer.length > PR_MAX_FILE_SIZE) throw new BusinessError('Ukuran file maksimal 5 MB.');
    const detected = detectMimeFromMagicBytes(f.buffer);
    if (!detected || detected !== f.mimetype) {
      throw new BusinessError(`File "${f.originalname}" tidak dikenali sebagai JPG/PNG/WebP/PDF.`);
    }
  }
  const created: PaymentRequestAttachment[] = [];
  for (const f of files) {
    const saved = await saveAttachment(f.buffer, f.originalname, f.mimetype);
    created.push(
      await prisma.paymentRequestAttachment.create({
        data: {
          paymentRequestId,
          fileName: cleanFileName(f.originalname),
          storedName: saved.storedName,
          mimeType: saved.mimeType,
          fileSize: saved.fileSize,
          filePath: saved.filePath,
          uploadedBy,
          scope,
        },
      }),
    );
  }
  return created;
}

/** Berkas dari isi base64 (jalur MCP). Jenis ditentukan dari magic byte; mimeType klien hanya petunjuk. */
export function fileFromBase64(fileName: string, contentBase64: string, mimeType?: string | null): IncomingPrFile {
  const raw = contentBase64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (!raw || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) throw new BusinessError('contentBase64 bukan base64 yang valid.');
  const buffer = Buffer.from(raw, 'base64');
  const detected = detectMimeFromMagicBytes(buffer);
  if (!detected || !ATTACHMENT_MIME.includes(detected)) {
    throw new BusinessError(`File "${fileName}" tidak dikenali sebagai JPG/PNG/WebP/PDF.`);
  }
  if (mimeType && mimeType !== detected) {
    throw new BusinessError(`mimeType "${mimeType}" tidak cocok dengan isi berkas (terdeteksi ${detected}).`);
  }
  return { buffer, originalname: fileName, mimetype: detected };
}

/**
 * Berkas dari lampiran panel chat milik pengguna ini. Tanpa `chatAttachmentId`, dipakai lampiran pada
 * giliran chat yang sedang berjalan (`ref` = `sessionId:turnId` dari actor assertion MCP). Sesi harus milik
 * pengguna yang sama; berkas disalin (siklus hidup lepas dari sesi chat).
 */
export async function fileFromChat(userId: string, opts: { chatAttachmentId?: string | null; ref?: string | null }): Promise<IncomingPrFile> {
  let att: { fileName: string; mimeType: string; filePath: string } | null = null;
  if (opts.chatAttachmentId) {
    const row = await prisma.chatAttachment.findUnique({
      where: { id: opts.chatAttachmentId },
      select: { fileName: true, mimeType: true, filePath: true, message: { select: { session: { select: { userId: true } } } } },
    });
    if (!row || row.message.session.userId !== userId) throw new BusinessError('Lampiran chat tidak ditemukan.');
    att = row;
  } else {
    const [sessionId, turnId] = (opts.ref ?? '').split(':');
    if (!sessionId || !turnId) {
      throw new BusinessError('Tidak ada konteks chat. Sertakan chatAttachmentId atau kirim berkas lewat panel chat Entaris.');
    }
    const msgs = await prisma.chatMessage.findMany({
      where: { sessionId, turnId, role: 'user', session: { userId } },
      orderBy: { seq: 'desc' },
      select: { attachments: { orderBy: { createdAt: 'asc' }, select: { fileName: true, mimeType: true, filePath: true } } },
    });
    att = msgs.flatMap((m) => m.attachments)[0] ?? null;
    if (!att) throw new BusinessError('Tidak ada lampiran pada pesan chat ini. Kirim berkas (JPG/PNG/WebP/PDF) di panel chat terlebih dahulu.');
  }
  const buffer = await fs.readFile(getFullPath(att.filePath)).catch(() => {
    throw new BusinessError('Berkas lampiran chat sudah tidak tersedia.');
  });
  return { buffer, originalname: att.fileName, mimetype: att.mimeType };
}
