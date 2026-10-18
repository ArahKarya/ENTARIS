/**
 * Route registry: single source of page labels for the sidebar, breadcrumbs, document title
 * and command palette. App.tsx still owns the <Route> elements.
 * - Labels are stored as `shell:nav.*` keys; `label` is a getter that translates on every read,
 *   so callers that render during a language change get the new text.
 * - `module` is the RBAC module checked by <PermRoute>: the item shows with 'view'; no module = always.
 * - Pages with `nav: false` name a `parent` that supplies their active nav item and breadcrumb.
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
import i18n from '@/i18n';
import { LOCALE } from '@/lib/format';
import type shellId from '@/locales/id/shell.json';

type NavKeys = (typeof shellId)['nav'];
/** `shell:nav.*` key of a page label. */
export type NavLabelKey = `nav.${Exclude<keyof NavKeys, 'sections'>}`;
/** `shell:nav.sections.*` key of a section label. */
export type SectionLabelKey = `nav.sections.${keyof NavKeys['sections']}`;

/** Translate a nav key in the current (or given) UI language. */
export function navLabel(key: NavLabelKey | SectionLabelKey, lng?: string): string {
  return i18n.t(key, { ns: 'shell', lng });
}

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
  labelKey: SectionLabelKey;
  /** Translated label (getter: follows the UI language). */
  readonly label: string;
  icon: RouteIcon;
}

export interface RouteEntry {
  /** Exact path as declared in App.tsx. */
  path: string;
  /** Label key (`shell:nav.*`): nav item, breadcrumb, document title. */
  labelKey: NavLabelKey;
  /** Translated label (getter: follows the UI language). */
  readonly label: string;
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

type SectionInput = Omit<NavSectionMeta, 'label'>;
type RouteInput = Omit<RouteEntry, 'label'>;

const section = (input: SectionInput): NavSectionMeta => ({
  ...input,
  get label() {
    return navLabel(input.labelKey);
  },
});

const r = (input: RouteInput): RouteEntry => ({
  ...input,
  get label() {
    return navLabel(input.labelKey);
  },
});

export const NAV_SECTIONS: readonly NavSectionMeta[] = [
  section({ id: 'sales', labelKey: 'nav.sections.sales', icon: ShoppingCart }),
  section({ id: 'purchasing', labelKey: 'nav.sections.purchasing', icon: Package }),
  section({ id: 'cash', labelKey: 'nav.sections.cash', icon: CreditCard }),
  section({ id: 'inventory', labelKey: 'nav.sections.inventory', icon: Warehouse }),
  section({ id: 'accounting', labelKey: 'nav.sections.accounting', icon: BookOpen }),
  section({ id: 'assets', labelKey: 'nav.sections.assets', icon: Boxes }),
  section({ id: 'reports', labelKey: 'nav.sections.reports', icon: FileBarChart }),
  section({ id: 'master', labelKey: 'nav.sections.master', icon: Database }),
  section({ id: 'system', labelKey: 'nav.sections.system', icon: ServerCog }),
];

export const ROUTES: readonly RouteEntry[] = [
  // Top-level
  r({ path: '/', labelKey: 'nav.dashboard', section: null, icon: LayoutDashboard, keywords: ['dashboard', 'beranda', 'home', 'ringkasan'] }),
  r({ path: '/aira', labelKey: 'nav.aira', section: null, icon: AiraIcon, keywords: ['aira', 'ai', 'agen', 'tanya', 'chat', 'asisten'] }),
  // Every logged-in user files payment requests (no module gate); finance tabs are gated in the page.
  r({ path: '/payment-requests', labelKey: 'nav.paymentRequests', section: null, icon: HandCoins, keywords: ['pengajuan', 'payment request', 'reimbursement', 'reimburse', 'uang muka', 'kasbon', 'perjalanan dinas', 'klaim', 'tagihan eam', 'tagihan aset', 'tagihan ga', 'pajak kendaraan', 'stnk', 'biaya aset', 'posting'] }),
  r({ path: '/payment-requests/new', labelKey: 'nav.paymentRequestNew', section: null, icon: HandCoins, parent: '/payment-requests', nav: false, keywords: ['ajukan', 'pengajuan baru', 'reimburse'] }),
  r({ path: '/payment-requests/:id', labelKey: 'nav.paymentRequestDetail', section: null, icon: HandCoins, parent: '/payment-requests', nav: false }),
  r({ path: '/payment-requests/:id/edit', labelKey: 'nav.paymentRequestEdit', section: null, icon: HandCoins, parent: '/payment-requests', nav: false }),
  r({ path: '/payment-requests/:id/settlement', labelKey: 'nav.paymentRequestSettlement', section: null, icon: HandCoins, parent: '/payment-requests', nav: false, keywords: ['pertanggungjawaban', 'laporan uang muka', 'settlement'] }),
  r({ path: '/notifications', labelKey: 'nav.notifications', section: null, icon: Bell, nav: false, keywords: ['pemberitahuan', 'notification', 'peringatan'] }),

  // Penjualan
  r({ path: '/inquiries', labelKey: 'nav.inquiries', section: 'sales', icon: Inbox, module: 'quotation', keywords: ['inquiry', 'pertanyaan pelanggan', 'permintaan', 'tanya harga', 'prospek'] }),
  r({ path: '/quotations', labelKey: 'nav.quotations', section: 'sales', icon: FileSignature, module: 'quotation', keywords: ['quotation', 'sq', 'penawaran harga'] }),
  r({ path: '/sales-orders', labelKey: 'nav.salesOrders', shortLabel: 'SO', section: 'sales', icon: ClipboardList, module: 'sales_order', keywords: ['so', 'sales order', 'pesanan penjualan', 'pesanan'] }),
  r({ path: '/delivery-orders', labelKey: 'nav.deliveryOrders', shortLabel: 'DO', section: 'sales', icon: Truck, module: 'delivery_order', keywords: ['do', 'delivery order', 'pengiriman'] }),
  r({ path: '/sales', labelKey: 'nav.salesInvoices', section: 'sales', icon: Receipt, module: 'sales_invoice', keywords: ['faktur penjualan', 'invoice penjualan', 'sales invoice', 'tagihan pelanggan', 'tagihan customer', 'piutang'] }),
  r({ path: '/sales-returns', labelKey: 'nav.salesReturns', section: 'sales', icon: Undo2, module: 'sales_return', keywords: ['retur', 'sales return', 'pengembalian'] }),
  r({ path: '/customer-deposits', labelKey: 'nav.customerDeposits', section: 'sales', icon: Wallet, module: 'customer_deposit', keywords: ['dp', 'deposit pelanggan', 'uang muka pelanggan', 'down payment', 'customer deposit'] }),

  // Pembelian
  r({ path: '/purchase-orders', labelKey: 'nav.purchaseOrders', shortLabel: 'PO', section: 'purchasing', icon: ClipboardList, module: 'purchase_order', keywords: ['po', 'purchase order', 'pesanan pembelian'] }),
  r({ path: '/goods-receipts', labelKey: 'nav.goodsReceipts', shortLabel: 'STT', section: 'purchasing', icon: PackageCheck, module: 'goods_receipt', keywords: ['bpb', 'stt', 'goods receipt', 'terima barang'] }),
  r({ path: '/purchase', labelKey: 'nav.purchaseInvoices', section: 'purchasing', icon: ReceiptText, module: 'purchase_invoice', keywords: ['faktur pembelian', 'invoice pembelian', 'purchase invoice', 'tagihan vendor', 'tagihan supplier', 'hutang'] }),
  r({ path: '/vendor-deposits', labelKey: 'nav.supplierDeposits', section: 'purchasing', icon: Wallet2, module: 'vendor_deposit', keywords: ['dp vendor', 'deposit vendor', 'uang muka vendor', 'uang muka pemasok', 'vendor deposit', 'supplier deposit'] }),

  // Kas & Bank
  r({ path: '/payments', labelKey: 'nav.payments', section: 'cash', icon: CreditCard, module: 'payment', keywords: ['pembayaran', 'payment', 'kas', 'bank', 'penerimaan', 'pengeluaran'] }),
  r({ path: '/cash-book-drafts', labelKey: 'nav.cashBookDrafts', section: 'cash', icon: NotebookPen, module: 'journal', keywords: ['buku kas', 'nota', 'kas harian', 'petty cash', 'kas kecil', 'struk', 'catatan kas', 'draft kas', 'kasbon', 'dkb', 'foto nota', 'aira'] }),
  r({ path: '/cash-book-drafts/:id', labelKey: 'nav.cashBookDraftReview', section: 'cash', icon: NotebookPen, module: 'journal', parent: '/cash-book-drafts', nav: false, keywords: ['tinjau draft kas', 'posting buku kas'] }),
  r({ path: '/reconciliation', labelKey: 'nav.reconciliation', section: 'cash', icon: Scale, module: 'reconciliation', keywords: ['rekonsiliasi', 'reconciliation', 'rekening koran'] }),
  r({ path: '/recurring', labelKey: 'nav.recurring', section: 'cash', icon: Repeat, module: 'recurring', keywords: ['recurring', 'berulang', 'rutin'] }),
  r({ path: '/project-guarantees', labelKey: 'nav.projectGuarantees', section: 'cash', icon: Landmark, module: 'project_guarantee', keywords: ['jaminan', 'guarantee', 'retensi'] }),

  // Persediaan & Produksi
  r({ path: '/inventory', labelKey: 'nav.inventory', section: 'inventory', icon: Warehouse, module: 'inventory', keywords: ['stok', 'inventory', 'persediaan', 'produksi', 'barang', 'gudang'] }),
  r({ path: '/warehouse-stock', labelKey: 'nav.warehouseStock', section: 'inventory', icon: LayoutDashboard, module: 'inventory', keywords: ['dashboard gudang', 'stok gudang', 'warehouse stock'] }),
  r({ path: '/stock-opname', labelKey: 'nav.stockOpname', section: 'inventory', icon: ClipboardCheck, module: 'stock_opname', keywords: ['opname', 'hitung fisik', 'stock opname'] }),
  r({ path: '/stock-transfers', labelKey: 'nav.stockTransfers', section: 'inventory', icon: ArrowLeftRight, module: 'stock_transfer', keywords: ['mutasi', 'pindah gudang', 'stock transfer'] }),
  r({ path: '/warehouses', labelKey: 'nav.warehouses', section: 'inventory', icon: Building2, module: 'warehouse', keywords: ['gudang', 'warehouse', 'lokasi'] }),

  // Akuntansi
  r({ path: '/coa', labelKey: 'nav.coa', section: 'accounting', icon: Network, module: 'coa', keywords: ['coa', 'chart of accounts', 'akun', 'perkiraan'] }),
  r({ path: '/gl', labelKey: 'nav.generalJournal', section: 'accounting', icon: BookOpen, module: 'journal', keywords: ['buku besar', 'general ledger', 'gl', 'jurnal', 'journal'] }),
  r({ path: '/fixed-assets', labelKey: 'nav.fixedAssets', section: 'accounting', icon: Building, module: 'fixed_assets', keywords: ['fixed asset', 'penyusutan', 'depresiasi'] }),
  r({ path: '/approvals', labelKey: 'nav.approvals', section: 'accounting', icon: ShieldCheck, module: 'approvals', keywords: ['approval', 'otorisasi', 'setuju'] }),

  // Aset & Pemeliharaan (GA/EAM)
  r({ path: '/ga', labelKey: 'nav.gaOverview', section: 'assets', icon: Gauge, module: 'ga_assets', keywords: ['dasbor aset', 'dashboard aset', 'ringkasan aset', 'ringkasan pemeliharaan', 'eam', 'ga', 'overview'] }),
  r({ path: '/ga/assets', labelKey: 'nav.gaAssets', section: 'assets', icon: Boxes, module: 'ga_assets', keywords: ['aset', 'asset', 'ga', 'eam'] }),
  r({ path: '/ga/vehicle', labelKey: 'nav.gaVehicles', section: 'assets', icon: Car, module: 'ga_vehicle', keywords: ['armada', 'vehicle', 'mobil', 'truk'] }),
  r({ path: '/ga/vehicle/report', labelKey: 'nav.gaFleetReport', section: 'assets', icon: BarChart3, module: 'ga_vehicle', parent: '/ga/vehicle', keywords: ['report armada', 'fleet report', 'kendaraan'] }),
  r({ path: '/ga/building', labelKey: 'nav.gaBuildings', section: 'assets', icon: Building2, module: 'ga_building', keywords: ['gedung', 'sewa', 'building', 'properti'] }),
  r({ path: '/ga/equipment', labelKey: 'nav.gaEquipment', section: 'assets', icon: ScanLine, module: 'ga_equipment', keywords: ['equipment', 'kalibrasi', 'alat ukur'] }),
  r({ path: '/ga/maintenance', labelKey: 'nav.gaMaintenance', shortLabel: 'WO', section: 'assets', icon: Wrench, module: 'ga_maintenance', keywords: ['maintenance', 'wo', 'work order', 'perintah kerja', 'perbaikan'] }),
  r({ path: '/ga/material-requests', labelKey: 'nav.gaMaterialRequests', shortLabel: 'MR', section: 'assets', icon: PackageSearch, module: 'ga_material_request', keywords: ['mr', 'material request', 'permintaan'] }),
  r({ path: '/ga/inventory', labelKey: 'nav.gaInventory', section: 'assets', icon: ClipboardList, module: 'ga_inventory', keywords: ['inventaris', 'inventory ga', 'atk'] }),
  r({ path: '/ga/documents', labelKey: 'nav.gaDocuments', section: 'assets', icon: FileText, module: 'ga_documents', keywords: ['dokumen', 'sertifikat', 'izin', 'legalitas'] }),
  r({ path: '/ga/master', labelKey: 'nav.gaMaster', section: 'assets', icon: FolderCog, module: 'ga_master', keywords: ['master data ga', 'kategori aset', 'lokasi'] }),

  // Laporan
  r({ path: '/reports', labelKey: 'nav.reports', section: 'reports', icon: FileBarChart, module: 'reports', keywords: ['laporan', 'report', 'laporan keuangan'] }),
  ...(
    [
      ['/reports/daily', 'nav.reportDaily', ['harian', 'daily']],
      ['/reports/trial-balance', 'nav.reportTrialBalance', ['trial balance', 'saldo']],
      ['/reports/profit-loss', 'nav.reportProfitLoss', ['profit loss', 'p&l', 'pl', 'rugi laba']],
      ['/reports/balance-sheet', 'nav.reportBalanceSheet', ['balance sheet', 'posisi keuangan']],
      ['/reports/cash-flow', 'nav.reportCashFlow', ['cash flow']],
      ['/reports/aging-ar', 'nav.reportAgingAr', ['aging ar', 'aging piutang', 'piutang']],
      ['/reports/aging-ap', 'nav.reportAgingAp', ['aging ap', 'aging hutang', 'hutang', 'utang']],
      ['/reports/tax', 'nav.reportTax', ['pajak', 'ppn', 'pph', 'tax']],
      ['/reports/ledger-book', 'nav.reportLedgerBook', ['ledger', 'buku besar', 'mutasi akun']],
      ['/reports/hpp', 'nav.reportCogs', ['hpp', 'harga pokok', 'cogs']],
      ['/reports/profitability-per-sku', 'nav.reportProfitabilitySku', ['profitability', 'margin', 'sku']],
      ['/reports/production-cost-summary', 'nav.reportProductionCost', ['biaya produksi', 'yield', 'production cost']],
      ['/reports/oee', 'nav.reportOee', ['oee', 'efektivitas mesin', 'downtime']],
      ['/reports/payable-schedule', 'nav.reportPayableSchedule', ['jadwal hutang', 'payable']],
      ['/reports/receivable-schedule', 'nav.reportReceivableSchedule', ['receivable', 'penagihan']],
      ['/reports/po-outstanding', 'nav.reportPoOutstanding', ['po outstanding', 'sisa po', 'pesanan pembelian', 'po terlambat']],
      ['/reports/supplier-performance', 'nav.reportSupplierPerformance', ['kinerja pemasok', 'supplier performance', 'vendor', 'pemasok', 'lead time', 'fill rate']],
    ] as const
  ).map(([path, labelKey, keywords]) =>
    r({ path, labelKey, section: 'reports', icon: FileBarChart, module: 'reports', parent: '/reports', nav: false, keywords: [...keywords] }),
  ),

  // Data Induk
  r({ path: '/parties', labelKey: 'nav.parties', section: 'master', icon: Users, module: 'parties', keywords: ['mitra', 'customer', 'supplier', 'pelanggan', 'vendor', 'pemasok', 'kontak', 'party'] }),

  // Sistem
  r({ path: '/settings', labelKey: 'nav.settings', section: 'system', icon: Settings, module: 'settings', keywords: ['settings', 'konfigurasi', 'perusahaan'] }),
  r({ path: '/users', labelKey: 'nav.users', section: 'system', icon: Shield, module: 'users', keywords: ['user', 'pengguna', 'akun', 'peran', 'role'] }),
  r({ path: '/audit', labelKey: 'nav.audit', section: 'system', icon: ScrollText, module: 'audit', keywords: ['audit trail', 'log', 'riwayat'] }),
  r({ path: '/health-check', labelKey: 'nav.healthCheck', section: 'system', icon: HeartPulse, module: 'audit', keywords: ['health check', 'kesehatan data', 'integritas'] }),
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
  const sectionMeta = getSection(chain[0].section);
  if (sectionMeta) crumbs.push({ label: sectionMeta.label });
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

/** Browser tab title: "Sales Order · PT Contoh" (company name optional). */
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
    id: s.id,
    icon: s.icon,
    // Getter, not a copy: a memoized model keeps following the UI language.
    get label() {
      return s.label;
    },
    items: visible.filter((e) => e.section === s.id),
  }));
  return [main, ...sections].filter((s) => s.items.length > 0);
}

/** Every page the user may open (including nav-hidden ones), for search. */
export function accessibleRoutes(canView: CanView): RouteEntry[] {
  return ROUTES.filter((e) => allowed(e, canView));
}

const fold = (s: string) => s.toLocaleLowerCase(LOCALE).normalize('NFD').replace(/[̀-ͯ]/g, '');

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
    const sectionLabel = fold(getSection(entry.section)?.label ?? '');
    // Keywords plus the label in every UI language, so "sales invoice" finds the page in either language.
    const keys = [...(entry.keywords ?? []), navLabel(entry.labelKey, 'id'), navLabel(entry.labelKey, 'en')].map(fold);
    let score = 0;
    if (label === q || short === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.split(/\s+/).some((w) => w.startsWith(q))) score = 60;
    else if (keys.some((k) => k === q)) score = 55;
    else if (label.includes(q)) score = 40;
    else if (keys.some((k) => k.includes(q))) score = 30;
    else if (sectionLabel.includes(q)) score = 10;
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label, LOCALE))
    .slice(0, limit)
    .map((s) => s.entry);
}
