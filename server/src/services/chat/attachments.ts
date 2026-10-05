// Lampiran panel chat: pakai penyimpanan privat yang sudah ada (utils/fileStorage.ts, batas 10 MB,
// JPG/PNG/WebP/PDF + cek magic byte) dan teruskan ke engine sebagai bagian konten gaya OpenAI.

import fs from 'node:fs/promises';
import { detectMimeFromMagicBytes, getFullPath, saveAttachment } from '../../utils/fileStorage';
import type { ContentPart } from './engineClient';
import type { EngineConfig } from './config';

export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class ChatInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ChatInputError';
  }
}

export interface IncomingFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface SavedAttachment {
  fileName: string;
  mimeType: string;
  size: number;
  filePath: string;
}

/** Nama berkas aman untuk disimpan/ditampilkan (tanpa path, kontrol, panjang terbatas). */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'lampiran';
  // eslint-disable-next-line no-control-regex -- membuang karakter kontrol dari nama berkas
  const clean = base.replace(/[\u0000-\u001f]/g, '').trim();
  return (clean || 'lampiran').slice(0, 120);
}

/** Validasi + simpan. Jenis ditentukan dari magic byte, bukan header klien. */
export async function saveChatFile(file: IncomingFile, cfg: Pick<EngineConfig, 'acceptPdf'>): Promise<SavedAttachment> {
  if (file.buffer.length === 0) throw new ChatInputError('empty_file', 'Berkas lampiran kosong.');
  if (file.buffer.length > CHAT_ATTACHMENT_MAX_BYTES) throw new ChatInputError('file_too_large', 'Lampiran melebihi 10 MB.', 413);
  const real = detectMimeFromMagicBytes(file.buffer);
  if (!real) throw new ChatInputError('file_type', 'Jenis lampiran tidak didukung. Gunakan JPG, PNG, atau WebP.', 415);
  if (real === 'application/pdf' && !cfg.acceptPdf) {
    throw new ChatInputError('pdf_unsupported', 'Engine AIRA saat ini hanya membaca gambar (JPG/PNG/WebP). Foto atau tangkapan layar halaman PDF lalu kirim sebagai gambar.', 415);
  }
  const saved = await saveAttachment(file.buffer, file.originalname, real);
  return { fileName: safeFileName(file.originalname), mimeType: saved.mimeType, size: saved.fileSize, filePath: saved.filePath };
}

/** Bagian konten OpenAI untuk lampiran tersimpan (gambar → data URL; PDF → bagian `file` bila diizinkan). */
export async function attachmentContentPart(att: SavedAttachment, cfg: Pick<EngineConfig, 'acceptPdf'>): Promise<ContentPart> {
  const bytes = await fs.readFile(getFullPath(att.filePath));
  const b64 = bytes.toString('base64');
  if (IMAGE_MIMES.has(att.mimeType)) return { type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${b64}` } };
  if (att.mimeType === 'application/pdf' && cfg.acceptPdf) return { type: 'file', file: { filename: att.fileName, file_data: `data:application/pdf;base64,${b64}` } };
  throw new ChatInputError('file_type', 'Jenis lampiran tidak dapat diteruskan ke engine AIRA.', 415);
}
