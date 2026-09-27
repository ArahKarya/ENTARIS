// Logika keputusan approval (approve / reject / minta-revisi) yang dipakai
// BERSAMA oleh route web (routes/approvals.ts) dan handler tombol Telegram
// (telegramService.pollTelegramUpdates). Sumber kebenaran tunggal supaya kedua
// jalur konsisten & idempoten (cek status Pending).

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { submitPurchaseInvoiceInTx } from './purchaseInvoiceSubmit';
import { submitProductionRunInTx } from './productionRunSubmit';
import { submitSalesReturnInTx } from './salesReturnSubmit';
import { submitDeliveryOrderInTx } from './deliveryOrderSubmit';
import { CreatePurchaseInvoiceSchema, CreateProductionRunSchema, CreateSalesReturnSchema, CreateDeliveryOrderSchema } from '../utils/schemas';
import { notifyUsers } from './notificationService';

export type ApprovalAction = 'approve' | 'reject' | 'revise';

export interface DecideApprovalInput {
  requestId: string;
  action: ApprovalAction;
  actorUserId: string;
  note?: string;
}

export interface DecideApprovalResult {
  ok: boolean;
  status?: 'Approved' | 'Rejected' | 'NeedsRevision';
  docNumber?: string;
  documentType?: string;
  error?: string;
}

/**
 * Eksekusi keputusan approval. Never-throw → selalu return {ok,...}.
 * - approve: eksekusi submit dokumen dari payload (gate approve-before-effect),
 *   tandai Approved, notifikasi pengaju.
 * - reject: tandai Rejected, notifikasi pengaju.
 * - revise: wajib `note`, tandai NeedsRevision (reversible), notifikasi pengaju.
 * Idempoten: hanya memproses request berstatus Pending.
 */
export async function decideApproval(input: DecideApprovalInput): Promise<DecideApprovalResult> {
  const { requestId, action, actorUserId } = input;
  const note = (input.note ?? '').trim();
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!request) return { ok: false, error: 'Pengajuan tidak ditemukan.' };
    if (request.status !== 'Pending') return { ok: false, error: 'Pengajuan sudah diproses.' };

    if (action === 'approve') {
      let createdDoc: { id: string; number: string } | null = null;

      if (request.payload != null) {
        const creator = request.requestedBy;
        createdDoc = await prisma.$transaction(async (tx) => {
          if (request.documentType === 'PurchaseInvoice') {
            const parsed = CreatePurchaseInvoiceSchema.safeParse(request.payload);
            if (!parsed.success) throw new Error('Payload invoice tidak valid: ' + parsed.error.issues[0]?.message);
            const inv = await submitPurchaseInvoiceInTx(tx, parsed.data as any, creator);
            return { id: inv.id, number: inv.invoiceNumber };
          }
          if (request.documentType === 'ProductionRun') {
            const parsed = CreateProductionRunSchema.safeParse(request.payload);
            if (!parsed.success) throw new Error('Payload produksi tidak valid: ' + parsed.error.issues[0]?.message);
            const run = await submitProductionRunInTx(tx, parsed.data as any, creator);
            if (!run) throw new Error('Gagal membuat data produksi.');
            return { id: run.id, number: run.runNumber };
          }
          if (request.documentType === 'SalesReturn') {
            const parsed = CreateSalesReturnSchema.safeParse(request.payload);
            if (!parsed.success) throw new Error('Payload retur tidak valid: ' + parsed.error.issues[0]?.message);
            const ret = await submitSalesReturnInTx(tx, parsed.data as any, creator);
            if (!ret) throw new Error('Gagal membuat retur penjualan.');
            return { id: ret.id, number: ret.returnNumber };
          }
          if (request.documentType === 'DeliveryOrder') {
            const parsed = CreateDeliveryOrderSchema.safeParse(request.payload);
            if (!parsed.success) throw new Error('Payload surat jalan tidak valid: ' + parsed.error.issues[0]?.message);
            // Disetujui = eksekusi dgn bypass stok minus (itu alasan masuk antrian).
            const doDoc = await submitDeliveryOrderInTx(tx, { ...parsed.data, allowNegativeStock: true } as any, creator);
            if (!doDoc) throw new Error('Gagal membuat surat jalan.');
            return { id: doDoc.id, number: doDoc.doNumber };
          }
          throw new Error('Tipe dokumen tidak didukung untuk eksekusi: ' + request.documentType);
        }, { timeout: 30000 });
      }

      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: 'Approved',
          approvedBy: actorUserId,
          ...(note ? { notes: note } : {}),
          decidedAt: new Date(),
          ...(createdDoc ? { documentId: createdDoc.id, documentNumber: createdDoc.number } : {}),
        },
      });

      // Lampiran yang diunggah saat pengajuan → pindah ke dokumen yang baru dibuat.
      if (createdDoc && request.documentType === 'PurchaseInvoice') {
        try {
          const moved = await prisma.transactionAttachment.updateMany({
            where: { referenceType: 'approval_request', referenceId: request.id },
            data: { referenceType: 'purchase_invoice', referenceId: createdDoc.id },
          });
          if (moved.count > 0) logger.info({ requestId: request.id, docId: createdDoc.id, n: moved.count }, 'Approval attachments moved to document');
        } catch (e) {
          logger.error(e, 'Gagal memindahkan lampiran pengajuan ke dokumen');
        }
      }

      await notifyUsers(prisma, {
        userIds: [request.requestedBy],
        type: 'approval_approved',
        title: 'Pengajuan Anda disetujui',
        message: createdDoc
          ? `Pengajuan disetujui — dokumen ${createdDoc.number} telah dibuat.`
          : 'Pengajuan Anda telah disetujui.',
        metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType, documentId: createdDoc?.id },
      });
      logger.info({ requestId: request.id, documentType: request.documentType, createdDoc, approvedBy: actorUserId }, 'Approval approved + document executed');
      return { ok: true, status: 'Approved', docNumber: createdDoc?.number, documentType: request.documentType };
    }

    if (action === 'reject') {
      await prisma.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: 'Rejected',
          rejectedBy: actorUserId,
          ...(note ? { notes: note } : {}),
          decidedAt: new Date(),
        },
      });
      await notifyUsers(prisma, {
        userIds: [request.requestedBy],
        type: 'approval_rejected',
        title: 'Pengajuan ditolak',
        message: `Pengajuan ditolak: ${note || '-'}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType },
      });
      logger.info({ requestId: request.id, by: actorUserId }, 'Approval rejected');
      return { ok: true, status: 'Rejected', documentType: request.documentType };
    }

    // revise
    if (!note) return { ok: false, error: 'Alasan revisi wajib diisi.' };
    await prisma.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: 'NeedsRevision',
        rejectedBy: actorUserId, // reuse kolom utk catat siapa minta revisi
        notes: note,
        decidedAt: new Date(),
      },
    });
    await notifyUsers(prisma, {
      userIds: [request.requestedBy],
      type: 'approval_revision',
      title: 'Pengajuan perlu revisi',
      message: `Pengajuan perlu revisi: ${note}`,
      metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType },
    });
    logger.info({ requestId: request.id, by: actorUserId }, 'Approval request-revision');
    return { ok: true, status: 'NeedsRevision', documentType: request.documentType };
  } catch (error: any) {
    logger.error({ err: error, requestId, action }, 'decideApproval error');
    return { ok: false, error: error?.message || 'Gagal memproses keputusan approval.' };
  }
}
