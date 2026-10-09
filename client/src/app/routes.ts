/**
 * Route registry: the single source of truth for every protected page in
 * App.tsx. Sidebar, Topbar breadcrumbs, document title and the command palette
 * all read from here, so a page has one label everywhere.
 *
 * - URLs are unchanged (labels only). App.tsx still owns <Route> elements.
 * - `module` mirrors the RBAC module used by <PermRoute> and the old sidebar:
 *   an item shows when the user can 'view' that module; no module = always.
 * - Pages that are not in the sidebar (`nav: false`) name a `parent`; their
 *   active nav item and breadcrumb trail come from that parent.
 */
import type { ComponentType } from 'react';
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building,
  Building2,
  Car,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Database,
  FileBarChart,
  FileSignature,
  FileText,
  FolderCog,
  Gauge,
  HeartPulse,
  Inbox,
  Landmark,
  LayoutDashboard,
  Network,
  Package,
  PackageCheck,
  PackageSearch,
  Receipt,
  ReceiptText,
  Repeat,
  Scale,
  ScanLine,
  ScrollText,
  ServerCog,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Undo2,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  Bell,
  ArrowLeftRight,
  Wallet2,
  HandCoins,
  NotebookPen,
} from 'lucide-react';
import { AiraIcon } from '@/components/shell/AiraIcon';

export interface RouteIconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export type RouteIcon = ComponentType<RouteIconProps>;

export type SectionId =
  | 'sales'
  | 'purchasing'
  | 'cash'
  | 'inventory'
  | 'accounting'
  | 'assets'
  | 'reports'
  | 'master'
  | 'system';

export interface NavSectionMeta {
  id: SectionId;
  label: string;
  icon: RouteIcon;
}

export interface RouteEntry {
  /** Exact path as declared in App.tsx. */
  path: string;
  /** Full Indonesian label: nav item, breadcrumb, document title. */
  label: string;
  /** Abbreviation shown as a chip next to the label (SO, PO, STT/BPB …). */
  shortLabel?: string;
  /** Sidebar section; null = top-level (above the sections). */
  section: SectionId | null;
  icon: RouteIcon;
  /** RBAC module checked with can(module, 'view'). Omit = everyone. */
  module?: string;
  /** Extra search terms (old labels, English names, abbreviations). */
  keywords?: string[];
  /** Path of the parent entry (breadcrumbs; active nav item for hidden pages). */
  parent?: string;
  /** false = page exists but has no sidebar item. Default true. */
  nav?: boolean;
}

export interface Crumb {
  label: string;
  href?: string;
}

export interface NavSection {
  /** 'main' is the unlabeled top block (Dasbor, Asisten AIRA). */
  id: SectionId | 'main';
  /** Section label/icon; absent for 'main'. */
  label?: string;
  icon?: RouteIcon;
  items: RouteEntry[];
}

export const NAV_SECTIONS: readonly NavSectionMeta[] = [
  { id: 'sales', label: 'Penjualan', icon: ShoppingCart },
  { id: 'purchasing', label: 'Pembelian', icon: Package },
  { id: 'cash', label: 'Kas & Bank', icon: CreditCard },
  { id: 'inventory', label: 'Persediaan & Produksi', icon: Warehouse },
  { id: 'accounting', label: 'Akuntansi', icon: BookOpen },
  { id: 'assets', label: 'Aset & Pemeliharaan', icon: Boxes },
  { id: 'reports', label: 'Laporan', icon: FileBarChart },
  { id: 'master', label: 'Data Induk', icon: Database },
  { id: 'system', label: 'Sistem', icon: ServerCog },
];

const r = (entry: RouteEntry): RouteEntry => entry;

export const ROUTES: readonly RouteEntry[] = [
  // Top-level
  r({ path: '/', label: 'Dasbor', section: null, icon: LayoutDashboard, keywords: ['dashboard', 'beranda', 'home', 'ringkasan'] }),
  r({ path: '/aira', label: 'Asisten AIRA', section: null, icon: AiraIcon, keywords: ['aira', 'ai', 'agen', 'tanya', 'chat', 'asisten'] }),
  // Every logged-in user files payment requests (no module gate); finance tabs are gated in the page.
  r({ path: '/payment-requests', label: 'Pengajuan Pembayaran', section: null, icon: HandCoins, keywords: ['pengajuan', 'payment request', 'reimbursement', 'reimburse', 'uang muka', 'kasbon', 'perjalanan dinas', 'klaim', 'tagihan eam', 'tagihan aset', 'tagihan ga', 'pajak kendaraan', 'stnk', 'biaya aset', 'posting'] }),
  r({ path: '/payment-requests/new', label: 'Buat Pengajuan', section: null, icon: HandCoins, parent: '/payment-requests', nav: false, keywords: ['ajukan', 'pengajuan baru', 'reimburse'] }),
  r({ path: '/payment-requests/:id', label: 'Detail Pengajuan', section: null, icon: HandCoins, parent: '/payment-requests', nav: false }),
  r({ path: '/payment-requests/:id/edit', label: 'Ubah Pengajuan', section: null, icon: HandCoins, parent: '/payment-requests', nav: false }),
  r({ path: '/payment-requests/:id/settlement', label: 'Pertanggungjawaban Uang Muka', section: null, icon: HandCoins, parent: '/payment-requests', nav: false, keywords: ['pertanggungjawaban', 'laporan uang muka', 'settlement'] }),
  r({ path: '/notifications', label: 'Notifikasi', section: null, icon: Bell, nav: false, keywords: ['pemberitahuan', 'notification', 'peringatan'] }),

  // Penjualan
  r({ path: '/inquiries', label: 'Pertanyaan Pelanggan', section: 'sales', icon: Inbox, module: 'quotation', keywords: ['inquiry', 'permintaan', 'tanya harga', 'prospek'] }),
  r({ path: '/quotations', label: 'Penawaran', section: 'sales', icon: FileSignature, module: 'quotation', keywords: ['quotation', 'sq', 'penawaran harga'] }),
  r({ path: '/sales-orders', label: 'Pesanan Penjualan', shortLabel: 'SO', section: 'sales', icon: ClipboardList, module: 'sales_order', keywords: ['so', 'sales order', 'pesanan'] }),
  r({ path: '/delivery-orders', label: 'Surat Jalan', shortLabel: 'DO', section: 'sales', icon: Truck, module: 'delivery_order', keywords: ['do', 'delivery order', 'pengiriman'] }),
  r({ path: '/sales', label: 'Faktur Penjualan', section: 'sales', icon: Receipt, module: 'sales_invoice', keywords: ['invoice penjualan', 'sales invoice', 'tagihan pelanggan', 'piutang'] }),
  r({ path: '/sales-returns', label: 'Retur Penjualan', section: 'sales', icon: Undo2, module: 'sales_return', keywords: ['retur', 'sales return', 'pengembalian'] }),
  r({ path: '/customer-deposits', label: 'Uang Muka Pelanggan', section: 'sales', icon: Wallet, module: 'customer_deposit', keywords: ['dp', 'deposit pelanggan', 'down payment', 'customer deposit'] }),

  // Pembelian
  r({ path: '/purchase-orders', label: 'Pesanan Pembelian', shortLabel: 'PO', section: 'purchasing', icon: ClipboardList, module: 'purchase_order', keywords: ['po', 'purchase order'] }),
  r({ path: '/goods-receipts', label: 'Penerimaan Barang', shortLabel: 'STT', section: 'purchasing', icon: PackageCheck, module: 'goods_receipt', keywords: ['bpb', 'stt', 'goods receipt', 'terima barang'] }),
  r({ path: '/purchase', label: 'Faktur Pembelian', section: 'purchasing', icon: ReceiptText, module: 'purchase_invoice', keywords: ['invoice pembelian', 'purchase invoice', 'tagihan vendor', 'hutang'] }),
  r({ path: '/vendor-deposits', label: 'Uang Muka Vendor', section: 'purchasing', icon: Wallet2, module: 'vendor_deposit', keywords: ['dp vendor', 'deposit vendor', 'vendor deposit'] }),

  // Kas & Bank
  r({ path: '/payments', label: 'Transaksi Kas & Bank', section: 'cash', icon: CreditCard, module: 'payment', keywords: ['pembayaran', 'payment', 'kas', 'bank', 'penerimaan', 'pengeluaran'] }),
  r({ path: '/cash-book-drafts', label: 'Draft Buku Kas', section: 'cash', icon: NotebookPen, module: 'journal', keywords: ['buku kas', 'nota', 'kas harian', 'petty cash', 'kas kecil', 'struk', 'catatan kas', 'draft kas', 'kasbon', 'dkb', 'foto nota', 'aira'] }),
  r({ path: '/cash-book-drafts/:id', label: 'Tinjau Draft Buku Kas', section: 'cash', icon: NotebookPen, module: 'journal', parent: '/cash-book-drafts', nav: false, keywords: ['tinjau draft kas', 'posting buku kas'] }),
  r({ path: '/reconciliation', label: 'Rekonsiliasi Bank', section: 'cash', icon: Scale, module: 'reconciliation', keywords: ['rekonsiliasi', 'reconciliation', 'rekening koran'] }),
  r({ path: '/recurring', label: 'Transaksi Berulang', section: 'cash', icon: Repeat, module: 'recurring', keywords: ['recurring', 'berulang', 'rutin'] }),
  r({ path: '/project-guarantees', label: 'Uang Jaminan Proyek', section: 'cash', icon: Landmark, module: 'project_guarantee', keywords: ['jaminan', 'guarantee', 'retensi'] }),

  // Persediaan & Produksi
  r({ path: '/inventory', label: 'Stok & Produksi', section: 'inventory', icon: Warehouse, module: 'inventory', keywords: ['stok', 'inventory', 'persediaan', 'produksi', 'barang', 'gudang'] }),
  r({ path: '/warehouse-stock', label: 'Stok per Gudang', section: 'inventory', icon: LayoutDashboard, module: 'inventory', keywords: ['dashboard gudang', 'stok gudang', 'warehouse stock'] }),
  r({ path: '/stock-opname', label: 'Stok Opname', section: 'inventory', icon: ClipboardCheck, module: 'stock_opname', keywords: ['opname', 'hitung fisik', 'stock opname'] }),
  r({ path: '/stock-transfers', label: 'Transfer Stok', section: 'inventory', icon: ArrowLeftRight, module: 'stock_transfer', keywords: ['mutasi', 'pindah gudang', 'stock transfer'] }),
  r({ path: '/warehouses', label: 'Daftar Gudang', section: 'inventory', icon: Building2, module: 'warehouse', keywords: ['gudang', 'warehouse', 'lokasi'] }),

  // Akuntansi
  r({ path: '/coa', label: 'Bagan Akun', section: 'accounting', icon: Network, module: 'coa', keywords: ['coa', 'chart of accounts', 'akun', 'perkiraan'] }),
  r({ path: '/gl', label: 'Jurnal Umum', section: 'accounting', icon: BookOpen, module: 'journal', keywords: ['buku besar', 'general ledger', 'gl', 'jurnal', 'journal'] }),
  r({ path: '/fixed-assets', label: 'Aset Tetap', section: 'accounting', icon: Building, module: 'fixed_assets', keywords: ['fixed asset', 'penyusutan', 'depresiasi'] }),
  r({ path: '/approvals', label: 'Persetujuan', section: 'accounting', icon: ShieldCheck, module: 'approvals', keywords: ['approval', 'otorisasi', 'setuju'] }),

  // Aset & Pemeliharaan (GA/EAM)
  r({ path: '/ga', label: 'Ringkasan', section: 'assets', icon: Gauge, module: 'ga_assets', keywords: ['dasbor aset', 'dashboard aset', 'ringkasan aset', 'ringkasan pemeliharaan', 'eam', 'ga', 'overview'] }),
  r({ path: '/ga/assets', label: 'Daftar Aset', section: 'assets', icon: Boxes, module: 'ga_assets', keywords: ['aset', 'asset', 'ga', 'eam'] }),
  r({ path: '/ga/vehicle', label: 'Kendaraan', section: 'assets', icon: Car, module: 'ga_vehicle', keywords: ['armada', 'vehicle', 'mobil', 'truk'] }),
  r({ path: '/ga/vehicle/report', label: 'Laporan Armada', section: 'assets', icon: BarChart3, module: 'ga_vehicle', parent: '/ga/vehicle', keywords: ['report armada', 'fleet report', 'kendaraan'] }),
  r({ path: '/ga/building', label: 'Gedung & Sewa', section: 'assets', icon: Building2, module: 'ga_building', keywords: ['gedung', 'sewa', 'building', 'properti'] }),
  r({ path: '/ga/equipment', label: 'Peralatan & Kalibrasi', section: 'assets', icon: ScanLine, module: 'ga_equipment', keywords: ['equipment', 'kalibrasi', 'alat ukur'] }),
  r({ path: '/ga/maintenance', label: 'Pemeliharaan', shortLabel: 'WO', section: 'assets', icon: Wrench, module: 'ga_maintenance', keywords: ['maintenance', 'wo', 'work order', 'perintah kerja', 'perbaikan'] }),
  r({ path: '/ga/material-requests', label: 'Permintaan Barang', shortLabel: 'MR', section: 'assets', icon: PackageSearch, module: 'ga_material_request', keywords: ['mr', 'material request', 'permintaan'] }),
  r({ path: '/ga/inventory', label: 'Inventaris Kantor', section: 'assets', icon: ClipboardList, module: 'ga_inventory', keywords: ['inventaris', 'inventory ga', 'atk'] }),
  r({ path: '/ga/documents', label: 'Dokumen & Sertifikat', section: 'assets', icon: FileText, module: 'ga_documents', keywords: ['dokumen', 'sertifikat', 'izin', 'legalitas'] }),
  r({ path: '/ga/master', label: 'Data Induk Aset', section: 'assets', icon: FolderCog, module: 'ga_master', keywords: ['master data ga', 'kategori aset', 'lokasi'] }),

  // Laporan
  r({ path: '/reports', label: 'Semua Laporan', section: 'reports', icon: FileBarChart, module: 'reports', keywords: ['laporan', 'report', 'laporan keuangan'] }),
  ...(
    [
      ['/reports/daily', 'Laporan Harian', ['harian', 'daily']],
      ['/reports/trial-balance', 'Neraca Saldo', ['trial balance', 'saldo']],
      ['/reports/profit-loss', 'Laba Rugi', ['profit loss', 'p&l', 'pl', 'rugi laba']],
      ['/reports/balance-sheet', 'Neraca', ['balance sheet', 'posisi keuangan']],
      ['/reports/cash-flow', 'Arus Kas', ['cash flow']],
      ['/reports/aging-ar', 'Umur Piutang', ['aging ar', 'aging piutang', 'piutang']],
      ['/reports/aging-ap', 'Umur Utang', ['aging ap', 'aging hutang', 'hutang', 'utang']],
      ['/reports/tax', 'Laporan Pajak', ['pajak', 'ppn', 'pph', 'tax']],
      ['/reports/ledger-book', 'Buku Besar', ['ledger', 'buku besar', 'mutasi akun']],
      ['/reports/hpp', 'HPP per Produk', ['hpp', 'harga pokok', 'cogs']],
      ['/reports/profitability-per-sku', 'Profitabilitas per SKU', ['profitability', 'margin', 'sku']],
      ['/reports/production-cost-summary', 'Modal Produksi per Periode', ['biaya produksi', 'rendemen', 'production cost']],
      ['/reports/oee', 'Laporan OEE', ['oee', 'efektivitas mesin', 'downtime']],
      ['/reports/payable-schedule', 'Jadwal Utang', ['jadwal hutang', 'payable']],
      ['/reports/receivable-schedule', 'Jadwal Piutang', ['receivable', 'penagihan']],
      ['/reports/po-outstanding', 'PO Outstanding', ['po outstanding', 'sisa po', 'pesanan pembelian', 'po terlambat']],
      ['/reports/supplier-performance', 'Kinerja Pemasok', ['kinerja pemasok', 'supplier performance', 'vendor', 'lead time', 'fill rate']],
    ] as const
  ).map(([path, label, keywords]) =>
    r({ path, label, section: 'reports', icon: FileBarChart, module: 'reports', parent: '/reports', nav: false, keywords: [...keywords] }),
  ),

  // Data Induk
  r({ path: '/parties', label: 'Pelanggan & Vendor', section: 'master', icon: Users, module: 'parties', keywords: ['mitra', 'customer', 'supplier', 'pemasok', 'kontak', 'party'] }),

  // Sistem
  r({ path: '/settings', label: 'Pengaturan', section: 'system', icon: Settings, module: 'settings', keywords: ['settings', 'konfigurasi', 'perusahaan'] }),
  r({ path: '/users', label: 'Manajemen Pengguna', section: 'system', icon: Shield, module: 'users', keywords: ['user', 'pengguna', 'akun', 'peran', 'role'] }),
  r({ path: '/audit', label: 'Jejak Audit', section: 'system', icon: ScrollText, module: 'audit', keywords: ['audit trail', 'log', 'riwayat'] }),
  r({ path: '/health-check', label: 'Pemeriksaan Sistem', section: 'system', icon: HeartPulse, module: 'audit', keywords: ['health check', 'kesehatan data', 'integritas'] }),
];

/** Fallback when a path is unknown (App.tsx redirects those to "/"). */
export const APP_TITLE = 'Entaris';

const BY_PATH = new Map(ROUTES.map((e) => [e.path, e]));
const SECTION_BY_ID = new Map(NAV_SECTIONS.map((s) => [s.id, s]));

/** Strip query/hash and a trailing slash: "/sales/?x=1" → "/sales". */
export function normalizePath(pathname: string): string {
  const bare = pathname.split(/[?#]/)[0] || '/';
  const trimmed = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
  return trimmed || '/';
}

export function getRoute(path: string): RouteEntry | undefined {
  return BY_PATH.get(path);
}

export function getSection(id: SectionId | null | undefined): NavSectionMeta | undefined {
  return id ? SECTION_BY_ID.get(id) : undefined;
}

/**
 * Registry entry for a URL: exact match, else the longest entry path that is a
 * whole-segment prefix ("/ga/vehicle/123" → "/ga/vehicle"). "/sales-orders"
 * never matches "/sales" and "/" only matches itself.
 */
export function matchRoute(pathname: string): RouteEntry | undefined {
  const path = normalizePath(pathname);
  const exact = BY_PATH.get(path);
  if (exact) return exact;
  let best: RouteEntry | undefined;
  for (const entry of ROUTES) {
    if (entry.path === '/') continue;
    if (path.startsWith(`${entry.path}/`) && (!best || entry.path.length > best.path.length)) best = entry;
  }
  return best;
}

export const isNavVisible = (entry: RouteEntry): boolean => entry.nav !== false;

/** Path of the sidebar item to highlight for a URL (nearest nav-visible ancestor). */
export function activeNavPath(pathname: string): string | undefined {
  let entry = matchRoute(pathname);
  const seen = new Set<string>();
  while (entry && !isNavVisible(entry) && entry.parent && !seen.has(entry.path)) {
    seen.add(entry.path);
    entry = BY_PATH.get(entry.parent);
  }
  return entry && isNavVisible(entry) ? entry.path : undefined;
}

/** Ancestor chain, root first, ending with the entry itself. */
function lineage(entry: RouteEntry): RouteEntry[] {
  const chain: RouteEntry[] = [entry];
  const seen = new Set([entry.path]);
  let cur = entry;
  while (cur.parent && !seen.has(cur.parent)) {
    const parent = BY_PATH.get(cur.parent);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parent.path);
    cur = parent;
  }
  return chain;
}

/**
 * Breadcrumb trail: Seksi / induk… / halaman. The section has no link (it is a
 * sidebar group, not a page); ancestors link; the last crumb is the page.
 */
export function breadcrumbsFor(pathname: string): Crumb[] {
  const entry = matchRoute(pathname);
  if (!entry) return [];
  const chain = lineage(entry);
  const crumbs: Crumb[] = [];
  const section = getSection(chain[0].section);
  if (section) crumbs.push({ label: section.label });
  chain.forEach((e, i) => {
    const last = i === chain.length - 1;
    crumbs.push(last ? { label: e.label } : { label: e.label, href: e.path });
  });
  return crumbs;
}

/** Page label for a URL (falls back to the app name). */
export function routeLabel(pathname: string): string {
  return matchRoute(pathname)?.label ?? APP_TITLE;
}

/** Browser tab title: "Pesanan Penjualan · PT Contoh" (company name optional). */
export function documentTitleFor(pathname: string, companyName?: string | null): string {
  const label = matchRoute(pathname)?.label;
  const org = companyName?.trim() || APP_TITLE;
  return label ? `${label} · ${org}` : org;
}

export type CanView = (module: string) => boolean;

const allowed = (entry: RouteEntry, canView: CanView) => !entry.module || canView(entry.module);

/**
 * Sidebar model filtered by permission. First block is the unlabeled 'main'
 * section; sections with no visible item are dropped.
 */
export function navSections(canView: CanView): NavSection[] {
  const visible = ROUTES.filter((e) => isNavVisible(e) && allowed(e, canView));
  const main: NavSection = { id: 'main', items: visible.filter((e) => e.section === null) };
  const sections: NavSection[] = NAV_SECTIONS.map((s) => ({
    ...s,
    items: visible.filter((e) => e.section === s.id),
  }));
  return [main, ...sections].filter((s) => s.items.length > 0);
}

/** Every page the user may open (including nav-hidden ones), for search. */
export function accessibleRoutes(canView: CanView): RouteEntry[] {
  return ROUTES.filter((e) => allowed(e, canView));
}

const fold = (s: string) => s.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Page search for the command palette. Matches label, short label, section
 * label and keywords; label hits rank above keyword hits.
 */
export function searchRoutes(query: string, canView: CanView, limit = 8): RouteEntry[] {
  const q = fold(query.trim());
  const pool = accessibleRoutes(canView);
  if (!q) return pool.filter(isNavVisible).slice(0, limit);
  const scored: { entry: RouteEntry; score: number }[] = [];
  for (const entry of pool) {
    const label = fold(entry.label);
    const short = fold(entry.shortLabel ?? '');
    const section = fold(getSection(entry.section)?.label ?? '');
    const keys = (entry.keywords ?? []).map(fold);
    let score = 0;
    if (label === q || short === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
    else if (keys.some((k) => k === q)) score = 55;
    else if (label.includes(q)) score = 40;
    else if (keys.some((k) => k.includes(q))) score = 30;
    else if (section.includes(q)) score = 10;
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label, 'id-ID'))
    .slice(0, limit)
    .map((s) => s.entry);
}
