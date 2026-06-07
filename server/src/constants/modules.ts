// Taksonomi RBAC: sumber kebenaran tunggal untuk modul, capability, role bawaan,
// dan matriks izin default (no-regression). Dipakai oleh rbacSeed, permissionService,
// route /api/roles/catalog. Versi client menyalin daftar `module`/`group` dari
// /api/roles/catalog (jangan hardcode ulang di client).

export type PermAction = 'view' | 'edit';

/** Modul = kolom matriks izin (role × modul → view/edit). Dikelompokkan utk UI. */
export interface ModuleDef {
  key: string;
  label: string;
  group: string;
}

export const MODULES: ModuleDef[] = [
  // PENJUALAN
  { key: 'sales_order', label: 'Pesanan Penjualan (SO)', group: 'Penjualan' },
  { key: 'delivery_order', label: 'Surat Jalan (DO)', group: 'Penjualan' },
  { key: 'sales_invoice', label: 'Invoice Penjualan', group: 'Penjualan' },
  { key: 'quotation', label: 'Penawaran & Inquiry', group: 'Penjualan' },
  { key: 'sales_return', label: 'Retur Penjualan', group: 'Penjualan' },
  { key: 'customer_deposit', label: 'Uang Muka Pelanggan', group: 'Penjualan' },
  // PEMBELIAN
  { key: 'purchase_order', label: 'Pesanan Pembelian (PO)', group: 'Pembelian' },
  { key: 'goods_receipt', label: 'Penerimaan Barang (BPB/STT)', group: 'Pembelian' },
  { key: 'purchase_invoice', label: 'Invoice Pembelian', group: 'Pembelian' },
  { key: 'vendor_deposit', label: 'Uang Muka Vendor', group: 'Pembelian' },
  // STOK & PRODUKSI
  { key: 'inventory', label: 'Stok & Gudang', group: 'Stok & Produksi' },
  { key: 'stock_transfer', label: 'Transfer Stok', group: 'Stok & Produksi' },
  { key: 'stock_opname', label: 'Stok Opname', group: 'Stok & Produksi' },
  { key: 'production', label: 'Produksi', group: 'Stok & Produksi' },
  { key: 'warehouse', label: 'Daftar Gudang', group: 'Stok & Produksi' },
  // BANK & KAS
  { key: 'payment', label: 'Transaksi Bank/Kas', group: 'Bank & Kas' },
  { key: 'reconciliation', label: 'Rekonsiliasi Bank', group: 'Bank & Kas' },
  { key: 'recurring', label: 'Transaksi Berulang', group: 'Bank & Kas' },
  { key: 'project_guarantee', label: 'Uang Jaminan Proyek', group: 'Bank & Kas' },
  // AKUNTANSI
  { key: 'coa', label: 'Bagan Akun (COA)', group: 'Akuntansi' },
  { key: 'journal', label: 'Buku Besar / Jurnal', group: 'Akuntansi' },
  { key: 'fixed_assets', label: 'Aset Tetap', group: 'Akuntansi' },
  { key: 'approvals', label: 'Approval (pengajuan)', group: 'Akuntansi' },
  // LAPORAN
  { key: 'reports', label: 'Laporan', group: 'Laporan' },
  // MASTER DATA
  { key: 'parties', label: 'Pelanggan & Vendor', group: 'Master Data' },
  // SISTEM
  { key: 'settings', label: 'Pengaturan', group: 'Sistem' },
  { key: 'users', label: 'Manajemen User', group: 'Sistem' },
  { key: 'audit', label: 'Jejak Audit & Sistem', group: 'Sistem' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Capability = hak sensitif di luar view/edit (default hanya super-admin/Admin). */
export interface CapabilityDef {
  key: string;
  label: string;
}

export const CAPABILITIES: CapabilityDef[] = [
  { key: 'doc.cancel', label: 'Batalkan / finalisasi dokumen (cancel, hapus posting, finalize opname, tutup buku)' },
  { key: 'approval.decide', label: 'Putuskan pengajuan (setujui/tolak/minta revisi) + kelola aturan approval' },
  { key: 'approval.bypass', label: 'Lewati antrian approval (pengajuan langsung diproses)' },
  { key: 'approval.view_all', label: 'Lihat semua pengajuan (bukan hanya milik sendiri)' },
  { key: 'inventory.negative_stock', label: 'Bypass validasi stok minus' },
  { key: 'rbac.manage', label: 'Kelola Role & Hak Akses' },
];

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key);

/** Role bawaan (key = nilai User.role lama, JANGAN diubah agar data lama valid). */
export interface BuiltinRoleDef {
  key: string;
  name: string;
  description: string;
  isSuperAdmin: boolean;
}

export const BUILTIN_ROLES: BuiltinRoleDef[] = [
  { key: 'Admin', name: 'Admin', description: 'Akses penuh sistem (super-admin, tidak bisa dibatasi).', isSuperAdmin: true },
  { key: 'Accountant', name: 'Akuntan / Keuangan', description: 'Operasional keuangan, penjualan, pembelian, stok.', isSuperAdmin: false },
  { key: 'StaffProduksi', name: 'Staff Produksi', description: 'Operasional pembelian, stok, produksi, surat jalan.', isSuperAdmin: false },
  { key: 'Viewer', name: 'Viewer', description: 'Hanya melihat (read-only).', isSuperAdmin: false },
];

/**
 * Matriks izin default per role bawaan (mereproduksi akses saat ini = no-regression).
 * Admin = super-admin (lolos semua), tidak perlu dicantum. Nilai: 'edit' = view+edit,
 * 'view' = view saja. Capabilities default: hanya Admin (via super-admin) — role lain
 * tidak punya cap (sesuai perilaku lama: cancel/approve/bypass hanya Admin).
 */
export const DEFAULT_MATRIX: Record<string, Record<string, PermAction>> = {
  Accountant: {
    sales_order: 'edit', delivery_order: 'edit', sales_invoice: 'edit', quotation: 'edit',
    sales_return: 'edit', customer_deposit: 'edit',
    purchase_order: 'edit', goods_receipt: 'edit', purchase_invoice: 'edit', vendor_deposit: 'edit',
    inventory: 'edit', stock_transfer: 'edit', stock_opname: 'edit', production: 'edit', warehouse: 'edit',
    payment: 'edit', reconciliation: 'edit', recurring: 'edit', project_guarantee: 'edit',
    coa: 'view', journal: 'edit', fixed_assets: 'edit', approvals: 'edit',
    reports: 'view', parties: 'edit',
  },
  StaffProduksi: {
    sales_order: 'edit', delivery_order: 'edit', sales_return: 'edit',
    purchase_order: 'edit', goods_receipt: 'edit', purchase_invoice: 'edit', vendor_deposit: 'view',
    inventory: 'edit', stock_transfer: 'edit', production: 'edit', warehouse: 'view',
    approvals: 'edit', parties: 'edit',
  },
  Viewer: {
    sales_order: 'view', delivery_order: 'view', sales_invoice: 'view', quotation: 'view',
    purchase_order: 'view', goods_receipt: 'view',
    inventory: 'view', payment: 'view', project_guarantee: 'view',
    coa: 'view', journal: 'view', fixed_assets: 'view', reports: 'view',
  },
};

/**
 * Modul yang ditambahkan SETELAH rilis RBAC awal. ensureRbacSeed mem-backfill
 * izin DEFAULT_MATRIX modul ini ke role sistem yang sudah ada di DB production
 * — one-shot per key (hanya bila belum ada satupun RolePermission utk modul
 * tsb), supaya izin yang sengaja dicabut Admin tidak dihidupkan kembali tiap boot.
 */
export const BACKFILL_MODULES: string[] = ['project_guarantee'];

/** Capabilities default per role bawaan non-super (kosong = sama seperti sekarang). */
export const DEFAULT_CAPS: Record<string, string[]> = {
  Accountant: [],
  StaffProduksi: [],
  Viewer: [],
};
