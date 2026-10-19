import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { logger } from '../lib/logger';

// Docker (NODE_ENV=production) keeps the volume at /app/uploads/attachments; local
// development has no /app, so it falls back to server/uploads/attachments (gitignored).
const UPLOAD_BASE =
  process.env.UPLOAD_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/app/uploads/attachments'
    : path.resolve(process.cwd(), 'uploads/attachments'));
const MAX_IMAGE_WIDTH = 1920;
const IMAGE_QUALITY = 80;

interface SaveResult {
  storedName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

function getSubDir(): string {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function saveAttachment(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<SaveResult> {
  const uuid = crypto.randomUUID();
  const subDir = getSubDir();
  const dirPath = path.join(UPLOAD_BASE, subDir);
  await fs.mkdir(dirPath, { recursive: true });

  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType);

  if (isImage) {
    try {
      // Dynamic import sharp (may not be available in dev)
      const sharp = (await import('sharp')).default;
      const compressed = await sharp(buffer)
        .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
        .webp({ quality: IMAGE_QUALITY })
        .toBuffer();

      const storedName = `${uuid}.webp`;
      const filePath = path.join(subDir, storedName);
      await fs.writeFile(path.join(UPLOAD_BASE, filePath), compressed);

      return {
        storedName,
        filePath,
        fileSize: compressed.length,
        mimeType: 'image/webp',
      };
    } catch (err) {
      // Fallback: save original if sharp fails
      logger.warn({ err }, 'Sharp compression failed, saving original');
    }
  }

  // PDF or fallback: save as-is
  const ext = mimeType === 'application/pdf' ? 'pdf' : path.extname(originalName).slice(1) || 'bin';
  const storedName = `${uuid}.${ext}`;
  const filePath = path.join(subDir, storedName);
  await fs.writeFile(path.join(UPLOAD_BASE, filePath), buffer);

  return { storedName, filePath, fileSize: buffer.length, mimeType };
}

export async function deleteAttachment(filePath: string): Promise<void> {
  const fullPath = path.join(UPLOAD_BASE, filePath);
  try {
    await fs.unlink(fullPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      logger.error({ err, filePath }, 'Failed to delete attachment file');
      throw err;
    }
  }
}

export function getFullPath(filePath: string): string {
  return path.join(UPLOAD_BASE, filePath);
}

/** Attachment types accepted for transaction / payment request attachments. */
export const ATTACHMENT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/**
 * Verify file content matches the claimed MIME by inspecting magic bytes.
 * The multer fileFilter only checks the client-supplied Content-Type header,
 * which is trivially spoofable. This guards against PDF/EXE smuggling.
 */
export function detectMimeFromMagicBytes(buf: Buffer): string | null {
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

/** RFC 6266 Content-Disposition value for a download (ASCII fallback + UTF-8 name). */
export function contentDisposition(fileName: string, inline: boolean): string {
  if (inline) return 'inline';
  const safeAscii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_');
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
