// Tentukan rute tujuan saat sebuah notifikasi di-klik, ROLE-AWARE.
//
// Approval: Admin/Accountant bisa buka halaman terpusat /approvals; StaffProduksi
// (pengaju) tidak punya akses /approvals → diarahkan ke tab approval di modulnya
// (Invoice Pembelian → /purchase, Data Produksi → /inventory).
//
// Tipe GA/EAM (WO, permintaan material, kalibrasi, dokumen, sewa) diarahkan ke
// modul /ga/*. Backend belum generate tipe-tipe ini — mapping disiapkan
// supaya klik notifikasi langsung ke halaman yang benar saat generator ada.
// `low_stock` tetap ke /inventory: generator backend membaca inventory_items.

export interface NotifItem {
  type: string;
  metadata?: any;
}

export function notificationLink(n: NotifItem, role: string | undefined): string | null {
  const meta = n.metadata ?? {};
  if (meta.link) return meta.link; // override eksplisit

  switch (n.type) {
    case 'approval_pending':
    case 'approval_approved':
    case 'approval_rejected':
    case 'approval_revision': {
      if (role === 'Admin' || role === 'Accountant') return '/approvals';
      // Pengaju non-admin → ke modul (tab approval ada di sana).
      return meta.documentType === 'ProductionRun' ? '/inventory' : '/purchase';
    }
    case 'invoice_overdue':
      return meta.invoiceType === 'purchase' ? '/purchase' : '/sales';
    case 'low_stock':
      return '/inventory';
    case 'quotation_expiring':
      return '/quotations';
    case 'payment_request_pending':
    case 'payment_request_approved':
    case 'payment_request_rejected':
    case 'payment_request_revision':
    case 'payment_request_paid':
    case 'payment_request_cancelled':
    case 'payment_request_settlement_due':
      return meta.paymentRequestId ? `/payment-requests/${encodeURIComponent(meta.paymentRequestId)}` : '/payment-requests';
    case 'guarantee_due':
      return '/project-guarantees';
    case 'po_overdue':
      return meta.purchaseOrderId ? `/purchase-orders?po=${encodeURIComponent(meta.purchaseOrderId)}` : '/purchase-orders';

    // GA / EAM
    case 'wo_overdue':
    case 'wo_assigned':
    case 'wo_completed':
      return '/ga/maintenance';
    case 'mr_pending':
    case 'mr_approved':
    case 'mr_rejected':
      return '/ga/material-requests';
    case 'calibration_due':
      return '/ga/equipment';
    case 'document_expiring':
      return '/ga/documents';
    case 'rental_expiring':
      return '/ga/building';
    default:
      return null;
  }
}

export function currentUserRole(): string | undefined {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch { return undefined; }
}
