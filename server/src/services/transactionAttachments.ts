// Lampiran dokumen transaksi (tabel transaction_attachments): logika bersama untuk jalur multipart (UI)
// dan jalur JSON (MCP: base64 / salin dari lampiran chat). Satu pintu validasi supaya aturan tidak bercabang.
import type { TransactionAttachment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { BusinessError } from '../utils/errors';
import { detectMimeFromMagicBytes, saveAttachment } from '../utils/fileStorage';
import type { AttachmentRefType } from './attachmentAccess';
import { cleanFileName, type IncomingPrFile } from './paymentRequestAttachments';

export const TX_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const TX_MAX_FILES_PER_DOCUMENT = 5;

export type IncomingTxFile = IncomingPrFile;

/** Pesan 404 per jenis dokumen; kunci = referenceType. */
const NOT_FOUND: Record<AttachmentRefType, string> = {
  payment: 'Transaksi pembayaran tidak ditemukan.',
  journal: 'Jurnal tidak ditemukan.',
  purchase_invoice: 'Invoice pembelian tidak ditemukan.',
  sales_invoice: 'Invoice penjualan tidak ditemukan.',
  sales_order: 'Pesanan (SO) tidak ditemukan.',
  delivery_order: 'Surat Jalan tidak ditemukan.',
  goods_receipt: 'STT/BPB tidak ditemukan.',
  quotation: 'Penawaran tidak ditemukan.',
  proforma_invoice: 'Proforma Invoice tidak ditemukan.',
  purchase_order: 'Pesanan pembelian (PO) tidak ditemukan.',
  sales_return: 'Retur penjualan tidak ditemukan.',
  stock_transfer: 'Transfer stok tidak ditemukan.',
  stock_opname: 'Stok opname tidak ditemukan.',
  production_run: 'Produksi tidak ditemukan.',
  fixed_asset: 'Aset tetap tidak ditemukan.',
  approval_request: 'Pengajuan tidak ditemukan.',
};

/** Apakah dokumen induk ada. approval_request punya aturan status sendiri (lihat assertApprovalRequestOpen). */
export async function referenceExists(referenceType: AttachmentRefType, id: string): Promise<boolean> {
  const where = { where: { id }, select: { id: true } } as const;
  switch (referenceType) {
    case 'payment': return !!(await prisma.payment.findUnique(where));
    case 'journal': return !!(await prisma.journalEntry.findUnique(where));
    case 'purchase_invoice': return !!(await prisma.purchaseInvoice.findUnique(where));
    case 'sales_invoice': return !!(await prisma.salesInvoice.findUnique(where));
    case 'sales_order': return !!(await prisma.salesOrder.findUnique(where));
    case 'delivery_order': return !!(await prisma.deliveryOrder.findUnique(where));
    case 'goods_receipt': return !!(await prisma.goodsReceipt.findUnique(where));
    case 'quotation': return !!(await prisma.quotation.findUnique(where));
    case 'proforma_invoice': return !!(await prisma.proformaInvoice.findUnique(where));
    case 'purchase_order': return !!(await prisma.purchaseOrder.findUnique(where));
    case 'sales_return': return !!(await prisma.salesReturn.findUnique(where));
    case 'stock_transfer': return !!(await prisma.stockTransfer.findUnique(where));
    case 'stock_opname': return !!(await prisma.stockOpname.findUnique(where));
    case 'production_run': return !!(await prisma.productionRun.findUnique(where));
    case 'fixed_asset': return !!(await prisma.fixedAsset.findUnique(where));
    case 'approval_request': return !!(await prisma.approvalRequest.findUnique(where));
  }
}

export type ReferenceCheck = { ok: true } | { ok: false; status: 400 | 404; error: string };

/** Cek dokumen induk ada; untuk approval_request juga pastikan masih bisa diputuskan/direvisi. */
export async function checkReference(referenceType: AttachmentRefType, id: string): Promise<ReferenceCheck> {
  if (referenceType === 'approval_request') {
    const ar = await prisma.approvalRequest.findUnique({ where: { id }, select: { status: true } });
    if (!ar) return { ok: false, status: 404, error: NOT_FOUND.approval_request };
    if (!['Pending', 'NeedsRevision'].includes(ar.status)) {
      return { ok: false, status: 400, error: 'Pengajuan sudah diproses; lampirkan ke dokumennya.' };
    }
    return { ok: true };
  }
  if (!(await referenceExists(referenceType, id))) return { ok: false, status: 404, error: NOT_FOUND[referenceType] };
  return { ok: true };
}

/** Validasi (jumlah, kosong, ukuran, jenis via magic byte) lalu simpan. Tidak menyimpan apa pun bila ada yang gagal. */
export async function addTransactionAttachments(
  referenceType: AttachmentRefType,
  referenceId: string,
  uploadedBy: string,
  files: IncomingTxFile[],
): Promise<TransactionAttachment[]> {
  if (files.length === 0) throw new BusinessError('Tidak ada file yang diupload.');
  const existing = await prisma.transactionAttachment.count({ where: { referenceType, referenceId } });
  if (existing + files.length > TX_MAX_FILES_PER_DOCUMENT) {
    throw new BusinessError(`Maksimal ${TX_MAX_FILES_PER_DOCUMENT} file per transaksi. Saat ini sudah ada ${existing} file.`);
  }
  for (const f of files) {
    if (f.buffer.length === 0) throw new BusinessError(`File "${f.originalname}" kosong.`);
    if (f.buffer.length > TX_MAX_FILE_SIZE) throw new BusinessError('Ukuran file maksimal 5 MB.');
    const detected = detectMimeFromMagicBytes(f.buffer);
    if (!detected) throw new BusinessError(`File "${f.originalname}" tidak dikenali sebagai JPG/PNG/WebP/PDF (magic-byte mismatch).`);
    if (detected !== f.mimetype) {
      throw new BusinessError(`File "${f.originalname}" Content-Type (${f.mimetype}) tidak cocok dengan isi file (${detected}).`);
    }
  }
  const out: TransactionAttachment[] = [];
  for (const f of files) {
    const saved = await saveAttachment(f.buffer, f.originalname, f.mimetype);
    out.push(
      await prisma.transactionAttachment.create({
        data: {
          referenceType,
          referenceId,
          fileName: cleanFileName(f.originalname),
          storedName: saved.storedName,
          mimeType: saved.mimeType,
          fileSize: saved.fileSize,
          filePath: saved.filePath,
          uploadedBy,
        },
      }),
    );
  }
  return out;
}
