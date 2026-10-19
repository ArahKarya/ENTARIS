// Approval decisions shared by routes/approvals.ts and the Telegram buttons, so both paths
// stay consistent and idempotent.

import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { submitPurchaseInvoiceInTx } from './purchaseInvoiceSubmit';
import { submitProductionRunInTx } from './productionRunSubmit';
import { submitSalesReturnInTx } from './salesReturnSubmit';
import { submitDeliveryOrderInTx } from './deliveryOrderSubmit';
import { applyPurchaseOrderApprovalDecisionInTx } from './purchaseOrderSubmit';
import { CreatePurchaseInvoiceSchema, CreateProductionRunSchema, CreateSalesReturnSchema, CreateDeliveryOrderSchema, UpdateProductionRunSchema, RevisePurchaseInvoiceSchema } from '../utils/schemas';
import { notifyUsers } from './notificationService';
import { editProductionRunInTx } from './productionRunEdit';
import { revisePurchaseInvoiceInTx } from './purchaseInvoiceRevise';
import { markDraftPostedByApproval, returnDraftToEditable } from './productionRunDraft';
import { isEditDocumentType, splitStoredPayload } from './approvalEditRequests';
import { isAiToolDocumentType } from '../mcp/constants';

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
 * Never throws. Idempotent: only Pending requests are processed. Approve runs the stored
 * submit payload (effects happen only now); revise requires `note`. The requester is notified.
 */
export async function decideApproval(input: DecideApprovalInput): Promise<DecideApprovalResult> {
  const { requestId, action, actorUserId } = input;
  const note = (input.note ?? '').trim();
  try {
    const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
    if (!request) return { ok: false, error: 'Pengajuan tidak ditemukan.' };
    if (request.status !== 'Pending') return { ok: false, error: 'Pengajuan sudah diproses.' };

    if (action === 'approve' && isAiToolDocumentType(request.documentType)) {
      // Permintaan agen (MCP): jalankan panggilan tersimpan sebagai aktor asli lewat handler internal.
      const { approveQueuedToolCall } = await import('../mcp/approve');
      return approveQueuedToolCall(request, actorUserId, note);
    }

    if (action === 'approve') {
      let createdDoc: { id: string; number: string } | null = null;

      // PO: status-based pending (documentId set, no payload) → Draft → Submitted.
      if (request.documentType === 'PurchaseOrder' && request.documentId) {
        const poId = request.documentId;
        createdDoc = await prisma.$transaction(async (tx) => {
          const po = await applyPurchaseOrderApprovalDecisionInTx(tx, poId, 'approve', note);
          return { id: po.id, number: po.poNumber };
        });
      } else if (request.payload != null) {
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
            // Draft tertaut (bila ada) → Posted; antrian lama tanpa draft = no-op.
            await markDraftPostedByApproval(tx, request.id, { id: run.id, number: run.runNumber }, actorUserId);
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
          if (request.documentType === 'ProductionRunEdit' || request.documentType === 'PurchaseInvoiceRevisePrice') {
            // Mutasi dokumen existing: payload = body asli + snapshot `_before` (dibuang).
            const targetId = request.documentId;
            if (!targetId) throw new Error('Pengajuan tidak memiliki dokumen target.');
            const { body } = splitStoredPayload(request.payload);
            if (request.documentType === 'ProductionRunEdit') {
              const parsed = UpdateProductionRunSchema.safeParse(body);
              if (!parsed.success) throw new Error('Payload edit produksi tidak valid: ' + parsed.error.issues[0]?.message);
              const run = await editProductionRunInTx(tx, targetId, parsed.data, creator);
              if (!run) throw new Error('Gagal mengedit data produksi.');
              return { id: run.id, number: run.runNumber };
            }
            const parsed = RevisePurchaseInvoiceSchema.safeParse(body);
            if (!parsed.success) throw new Error('Payload revisi harga tidak valid: ' + parsed.error.issues[0]?.message);
            const inv = await revisePurchaseInvoiceInTx(tx, { invoiceId: targetId, lines: parsed.data.lines, reason: parsed.data.reason }, creator);
            if (!inv) throw new Error('Gagal merevisi harga invoice.');
            return { id: inv.id, number: inv.invoiceNumber };
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
        message: createdDoc && isEditDocumentType(request.documentType)
          ? `Pengajuan disetujui. Perubahan pada ${createdDoc.number} telah diterapkan.`
          : createdDoc
          ? `Pengajuan disetujui. Dokumen ${createdDoc.number} telah dibuat.`
          : 'Pengajuan Anda telah disetujui.',
        metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType, documentId: createdDoc?.id },
      });
      logger.info({ requestId: request.id, documentType: request.documentType, createdDoc, approvedBy: actorUserId }, 'Approval approved + document executed');
      return { ok: true, status: 'Approved', docNumber: createdDoc?.number, documentType: request.documentType };
    }

    if (request.documentType === 'PurchaseOrder' && request.documentId && (action === 'reject' || note)) {
      // Reject / minta-revisi: PO kembali ke Draf (bisa diedit & diajukan ulang).
      await applyPurchaseOrderApprovalDecisionInTx(prisma, request.documentId, action, note);
    }

    // Data Produksi dari draft: reject / revisi mengembalikan draft ke Draft
    // (dengan catatan) supaya bisa diperbaiki & diposting ulang.
    let draftReturned = false;
    if (request.documentType === 'ProductionRun' && (action === 'reject' || action === 'revise')) {
      if (action === 'revise' && !note) return { ok: false, error: 'Alasan revisi wajib diisi.' };
      draftReturned = await returnDraftToEditable(
        prisma, request.id, note, action === 'reject' ? 'Ditolak' : 'Perlu revisi',
      );
    }

    if (action === 'reject' || (action === 'revise' && draftReturned)) {
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
        message: draftReturned
          ? `Pengajuan ${action === 'revise' ? 'perlu revisi' : 'ditolak'}: ${note || '-'}. Draft dikembalikan. Perbaiki lalu posting ulang.`
          : `Pengajuan ditolak: ${note || '-'}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: request.documentType },
      });
      logger.info({ requestId: request.id, by: actorUserId }, 'Approval rejected');
      return { ok: true, status: 'Rejected', documentType: request.documentType };
    }

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
