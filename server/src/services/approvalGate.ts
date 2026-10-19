// Approval gate for roles without the `approval.bypass` capability. Effects (GL/stock/WAC)
// happen only on approve: the payload is stored in ApprovalRequest and submitted then.

import type { Prisma } from '@prisma/client';
import { hasCap } from './permissionService';

type Tx = Prisma.TransactionClient;

export const GATED_DOCUMENT_TYPES = [
  'PurchaseInvoice', 'ProductionRun', 'SalesReturn', 'DeliveryOrder',
  // Mutasi dokumen yang sudah ada (lihat approvalEditRequests.ts).
  'ProductionRunEdit', 'PurchaseInvoiceRevisePrice',
] as const;
export type GatedDocumentType = (typeof GATED_DOCUMENT_TYPES)[number];

const GATED_LABELS: Record<GatedDocumentType, string> = {
  PurchaseInvoice: 'Invoice Pembelian',
  ProductionRun: 'Data Produksi',
  SalesReturn: 'Retur Penjualan',
  DeliveryOrder: 'Surat Jalan',
  ProductionRunEdit: 'Edit Data Produksi',
  PurchaseInvoiceRevisePrice: 'Revisi Harga Invoice Pembelian',
};

/**
 * Apakah role ini perlu approval? Role dgn capability 'approval.bypass'
 * (default: Admin/super) langsung diproses; selain itu masuk antrian.
 */
export async function needsApproval(roleKey: string): Promise<boolean> {
  return !(await hasCap(roleKey, 'approval.bypass'));
}

/** Approvals page URL for notifications, from APP_BASE_URL; null when unset (notification goes out without a link). */
export function approvalsLink(requestId?: string): string | null {
  const base = (process.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base) return null;
  return requestId ? `${base}/approvals?request=${requestId}` : `${base}/approvals`;
}

/**
 * Buat antrian approval (payload disimpan, dokumen belum dibuat).
 * Dipanggil dari route POST PI/Produksi saat requester bukan Admin.
 */
export async function queueApproval(
  tx: Tx,
  params: {
    documentType: GatedDocumentType;
    payload: unknown;     // body submit asli (akan dieksekusi saat approve)
    amount: number;       // nilai dokumen utk ditampilkan di antrian
    requestedBy: string;
    label?: string;       // ringkasan utk document_number sementara
  },
) {
  return tx.approvalRequest.create({
    data: {
      documentType: params.documentType,
      documentId: null,
      documentNumber: params.label ?? `(menunggu approval) ${GATED_LABELS[params.documentType]}`,
      amount: params.amount,
      payload: params.payload as Prisma.InputJsonValue,
      requestedBy: params.requestedBy,
      status: 'Pending',
    },
  });
}

export { GATED_LABELS };
