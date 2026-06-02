// Tentukan rute tujuan saat sebuah notifikasi di-klik, ROLE-AWARE.
//
// Approval: Admin/Accountant bisa buka halaman terpusat /approvals; StaffProduksi
// (pengaju) tidak punya akses /approvals → diarahkan ke tab approval di modulnya
// (Invoice Pembelian → /purchase, Data Produksi → /inventory).

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
    default:
      return null;
  }
}

export function currentUserRole(): string | undefined {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch { return undefined; }
}
