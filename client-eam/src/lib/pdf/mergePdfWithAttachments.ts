// Client-side PDF merge: invoice PDF + list of attachments (PDF/JPG/PNG/WebP)
// into a single downloadable PDF.
//
// Flow:
//   1. Caller provides the invoice PDF as a Blob (from @react-pdf/renderer pdf(...).toBlob()).
//   2. For each attachment URL:
//      - fetch as ArrayBuffer
//      - if PDF: copyPages into merged doc
//      - if image: embed and add a page sized to the image (portrait A4 fit)
//   3. Return a single merged Blob ready for saveAs / URL.createObjectURL.

import { PDFDocument, PageSizes } from 'pdf-lib';

export interface AttachmentRef {
  id: string;
  fileName: string;
  mimeType: string;
  fetchUrl: string; // endpoint to fetch the binary (must include auth/JWT headers via caller)
}

export interface MergeOptions {
  fetchBinary: (url: string) => Promise<ArrayBuffer>;
}

const A4 = PageSizes.A4; // [595.28, 841.89]
const MARGIN = 24;

export async function mergeInvoicePdfWithAttachments(
  invoicePdfBlob: Blob,
  attachments: AttachmentRef[],
  opts: MergeOptions,
): Promise<Blob> {
  const invoiceBytes = await invoicePdfBlob.arrayBuffer();
  const merged = await PDFDocument.load(invoiceBytes);
  const failures: string[] = [];

  for (const att of attachments) {
    try {
      const bytes = await opts.fetchBinary(att.fetchUrl);
      const mime = att.mimeType.toLowerCase();

      if (mime === 'application/pdf') {
        const attDoc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(attDoc, attDoc.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        continue;
      }

      // Image: JPG/PNG/WebP. pdf-lib supports JPG + PNG natively.
      // WebP is uploaded → server compresses images to WebP. pdf-lib does NOT
      // support WebP directly, so we render via canvas → PNG on the fly.
      let pngBytes: ArrayBuffer | Uint8Array = bytes;
      let embedAsJpg = mime === 'image/jpeg';

      if (mime === 'image/webp' || mime === 'image/png' || mime === 'image/jpeg') {
        if (mime === 'image/webp') {
          // Convert WebP → PNG via <canvas>
          pngBytes = await webpToPng(bytes);
          embedAsJpg = false;
        }
      } else {
        // Unsupported mime: skip
        continue;
      }

      const img = embedAsJpg
        ? await merged.embedJpg(pngBytes)
        : await merged.embedPng(pngBytes);

      // Fit to A4 with margins, preserving aspect ratio
      const page = merged.addPage(A4);
      const maxW = A4[0] - MARGIN * 2;
      const maxH = A4[1] - MARGIN * 2;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      page.drawImage(img, {
        x: (A4[0] - drawW) / 2,
        y: (A4[1] - drawH) / 2,
        width: drawW,
        height: drawH,
      });
    } catch (err) {
      console.warn(`Gagal merge lampiran ${att.fileName}:`, err);
      failures.push(`${att.fileName}: ${(err as Error)?.message || 'unknown'}`);
    }
  }

  if (failures.length === attachments.length && attachments.length > 0) {
    throw new Error(`Semua lampiran gagal di-merge:\n${failures.join('\n')}`);
  }
  if (failures.length > 0) {
    console.error('Sebagian lampiran gagal:', failures);
  }

  const out = await merged.save();
  return new Blob([out as unknown as BlobPart], { type: 'application/pdf' });
}

async function webpToPng(webpBytes: ArrayBuffer): Promise<Uint8Array> {
  const blob = new Blob([webpBytes as unknown as BlobPart], { type: 'image/webp' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('HTMLImageElement decode failed'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context tidak tersedia');
    ctx.drawImage(img, 0, 0);
    const pngBlob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });
    return new Uint8Array(await pngBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
