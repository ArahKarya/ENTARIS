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

type Tx = Prisma.TransactionClient;

export const GATED_DOCUMENT_TYPES = ['PurchaseInvoice', 'ProductionRun'] as const;
export type GatedDocumentType = (typeof GATED_DOCUMENT_TYPES)[number];

const GATED_LABELS: Record<GatedDocumentType, string> = {
  PurchaseInvoice: 'Invoice Pembelian',
  ProductionRun: 'Data Produksi',
};

/**
 * Apakah role ini perlu approval? Admin bebas; selain itu di-gate.
 */
export function needsApproval(role: string): boolean {
  return role !== 'Admin';
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
