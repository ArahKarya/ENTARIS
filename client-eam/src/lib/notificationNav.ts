// Tentukan rute tujuan saat sebuah notifikasi di-klik, dalam konteks EAM
// (bukan ERP finance). EAM cuma punya modul GA/aset — tidak ada
// /approvals, /purchase, /sales, /quotations, /project-guarantees seperti
// ERP. Backend belum pernah generate notifikasi GA (low stock/WO
// overdue/MR pending) sampai saat ini, jadi mapping ini defensif untuk
// saat fitur itu ada nanti, plus tetap fallback aman untuk notifikasi
// finance lama (kalau ada baris lawas ikut ke-load, klik-nya diam saja
// alih-alih redirect ke rute yang 404 di EAM).

export interface NotifItem {
  type: string;
  metadata?: any;
}

export function notificationLink(n: NotifItem, _role: string | undefined): string | null {
  const meta = n.metadata ?? {};
  if (meta.link) return meta.link; // override eksplisit dari backend

  switch (n.type) {
    // GA / EAM — belum pernah di-generate backend, disiapkan untuk saat ada
    case 'low_stock':
      return '/ga/inventory';
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

    // Notifikasi finance ERP lama (kalau baris lama ikut ke-load di sini) —
    // tidak ada rute yang sesuai di EAM, jangan redirect ke 404.
    case 'approval_pending':
    case 'approval_approved':
    case 'approval_rejected':
    case 'approval_revision':
    case 'invoice_overdue':
    case 'quotation_expiring':
    case 'guarantee_due':
      return null;

    default:
      return null;
  }
}

export function currentUserRole(): string | undefined {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch { return undefined; }
}
