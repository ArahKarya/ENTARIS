// Approval gate: tahan dokumen tertentu sampai disetujui Admin/manajer.
//
// Kebijakan (2026-06-02, dikonfirmasi user):
//   - Berlaku untuk SEMUA role KECUALI Admin.
//   - Efek dokumen (GL/stok/WAC) terjadi SETELAH approve, bukan sebelum.
//     Maka dokumen TIDAK dibuat saat submit — payload disimpan di
//     ApprovalRequest, lalu dieksekusi via submit asli saat approve.
//
// Document type yang di-gate: 'PurchaseInvoice', 'ProductionRun'.

import type { Prisma } from '@prisma/client';
import { hasCap } from './permissionService';

type Tx = Prisma.TransactionClient;

export const GATED_DOCUMENT_TYPES = ['PurchaseInvoice', 'ProductionRun', 'SalesReturn'] as const;
export type GatedDocumentType = (typeof GATED_DOCUMENT_TYPES)[number];

const GATED_LABELS: Record<GatedDocumentType, string> = {
  PurchaseInvoice: 'Invoice Pembelian',
  ProductionRun: 'Data Produksi',
  SalesReturn: 'Retur Penjualan',
};

/**
 * Apakah role ini perlu approval? Role dgn capability 'approval.bypass'
 * (default: Admin/super) langsung diproses; selain itu masuk antrian.
 */
export async function needsApproval(roleKey: string): Promise<boolean> {
  return !(await hasCap(roleKey, 'approval.bypass'));
}

/**
 * Link ke halaman approval di aplikasi (utk disisipkan ke notifikasi).
 * Sumber: env APP_BASE_URL (mis. https://erp.panganmasadepan.com). Bila tidak
 * di-set → null (notifikasi tetap terkirim tanpa link). Telegram meng-auto-link
 * URL polos sehingga bisa langsung diklik.
 */
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
