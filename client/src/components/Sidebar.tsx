import React, { useEffect, useMemo, useState } from 'react';
import {
  Boxes, FileText, Wrench, Car, Building2 as Building2Ga, ScanLine, FolderCog,
  Bell,
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  Users,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CreditCard,
  Package,
  Network,
  Warehouse,
  Shield,
  ScrollText,
  Repeat,
  Landmark,
  Scale,
  Truck,
  Wallet,
  Undo2,
  X,
  ClipboardCheck,
  HeartPulse,
  Building2,
  ShieldCheck,
  FileSignature,
  ClipboardList,
  Inbox,
  BookOpen,
  ServerCog,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { can } from '../lib/permissions';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { APP_VERSION } from '../lib/version';

interface NavItem {
  icon: React.FC<any>;
  label: string;
  href?: string;
  // Modul RBAC: item tampil bila user punya izin 'view'. Tanpa module = selalu tampil.
  module?: string;
  children?: NavItem[];
}

// ─── Module / submodule structure (Opsi A — by business function) ──────────
// Parent without href is a pure group toggle. With href, parent is both link
// and group — we treat it as group only (children take precedence).
const allNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Bell, label: 'Notifikasi', href: '/notifications' },

  {
    icon: ShoppingCart,
    label: 'Penjualan',
    children: [
      { icon: Inbox, label: 'Inquiry', href: '/inquiries', module: 'quotation' },
      { icon: FileSignature, label: 'Penawaran', href: '/quotations', module: 'quotation' },
      { icon: ClipboardList, label: 'Pesanan (SO)', href: '/sales-orders', module: 'sales_order' },
      { icon: Truck, label: 'Surat Jalan', href: '/delivery-orders', module: 'delivery_order' },
      { icon: Receipt, label: 'Invoice Penjualan', href: '/sales', module: 'sales_invoice' },
      { icon: Undo2, label: 'Retur Penjualan', href: '/sales-returns', module: 'sales_return' },
      { icon: Wallet, label: 'Uang Muka Pelanggan', href: '/customer-deposits', module: 'customer_deposit' },
    ],
  },

  {
    icon: Package,
    label: 'Pembelian',
    children: [
      { icon: Receipt, label: 'Purchase Order (PO)', href: '/purchase-orders', module: 'purchase_order' },
      { icon: Receipt, label: 'BPB / STT (Penerimaan)', href: '/goods-receipts', module: 'goods_receipt' },
      { icon: Receipt, label: 'Invoice Pembelian', href: '/purchase', module: 'purchase_invoice' },
      { icon: Wallet, label: 'Uang Muka Vendor', href: '/vendor-deposits', module: 'vendor_deposit' },
    ],
  },

  {
    icon: Warehouse,
    label: 'Stok & Produksi',
    children: [
      { icon: Warehouse, label: 'Stok & Gudang', href: '/inventory', module: 'inventory' },
      { icon: LayoutDashboard, label: 'Dashboard Per Gudang', href: '/warehouse-stock', module: 'inventory' },
      { icon: ClipboardCheck, label: 'Stok Opname', href: '/stock-opname', module: 'stock_opname' },
      { icon: Repeat, label: 'Transfer Stok', href: '/stock-transfers', module: 'stock_transfer' },
      { icon: Building2, label: 'Daftar Gudang', href: '/warehouses', module: 'warehouse' },
    ],
  },

  {
    icon: CreditCard,
    label: 'Bank & Kas',
    children: [
      { icon: CreditCard, label: 'Transaksi Bank/Kas', href: '/payments', module: 'payment' },
      { icon: Scale, label: 'Rekonsiliasi Bank', href: '/reconciliation', module: 'reconciliation' },
      { icon: Repeat, label: 'Transaksi Berulang', href: '/recurring', module: 'recurring' },
      { icon: Landmark, label: 'Uang Jaminan Proyek', href: '/project-guarantees', module: 'project_guarantee' },
    ],
  },

  {
    icon: BookOpen,
    label: 'Akuntansi',
    children: [
      { icon: Network, label: 'Bagan Akun', href: '/coa', module: 'coa' },
      { icon: Receipt, label: 'Buku Besar', href: '/gl', module: 'journal' },
      { icon: Building2, label: 'Aset Tetap', href: '/fixed-assets', module: 'fixed_assets' },
      { icon: ShieldCheck, label: 'Approval', href: '/approvals', module: 'approvals' },
    ],
  },

  {
    icon: Boxes,
    label: 'EAM — Manajemen Aset',
    children: [
      { icon: Boxes, label: 'Aset', href: '/ga/assets', module: 'ga_assets' },
      { icon: Car, label: 'Kendaraan', href: '/ga/vehicle', module: 'ga_vehicle' },
      { icon: Building2Ga, label: 'Gedung & Sewa', href: '/ga/building', module: 'ga_building' },
      { icon: ScanLine, label: 'Equipment & Kalibrasi', href: '/ga/equipment', module: 'ga_equipment' },
      { icon: Wrench, label: 'Maintenance / WO', href: '/ga/maintenance', module: 'ga_maintenance' },
      { icon: ClipboardList, label: 'Inventaris', href: '/ga/inventory', module: 'ga_inventory' },
      { icon: FileText, label: 'Dokumen & Sertifikat', href: '/ga/documents', module: 'ga_documents' },
      { icon: FolderCog, label: 'Master Data', href: '/ga/master', module: 'ga_master' },
    ],
  },

  { icon: FileBarChart, label: 'Laporan', href: '/reports', module: 'reports' },

  {
    icon: Users,
    label: 'Master Data',
    children: [
      { icon: Users, label: 'Pelanggan & Vendor', href: '/parties', module: 'parties' },
    ],
  },

  {
    icon: ServerCog,
    label: 'Sistem',
    children: [
      { icon: Settings, label: 'Pengaturan', href: '/settings', module: 'settings' },
      { icon: Shield, label: 'Manajemen User', href: '/users', module: 'users' },
      { icon: ScrollText, label: 'Jejak Audit', href: '/audit', module: 'audit' },
      { icon: HeartPulse, label: 'Health Check', href: '/health-check', module: 'audit' },
    ],
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const EXPANDED_KEY = 'sidebar.expandedGroups';

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveExpanded(s: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded());
  const location = useLocation();
  const settings = useCompanySettings();
  const { resolvedTheme } = useTheme();

  const customLogo = resolvedTheme === 'dark'
    ? (settings?.logoUrlDark || settings?.logoUrl || null)
    : (settings?.logoUrl || settings?.logoUrlDark || null);
  const sidebarLogoSrc = customLogo || '/pwa-192x192.png';
  const needsInvert = !customLogo && resolvedTheme !== 'dark';

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  // Filter nav items by izin modul. Sembunyikan grup bila tak ada anak yang tampil.
  const navItems = useMemo<NavItem[]>(() => {
    const filterByPerm = (items: NavItem[]): NavItem[] =>
      items
        .filter((it) => !it.module || can(it.module, 'view'))
        .map((it) => {
          if (!it.children) return it;
          const visibleChildren = filterByPerm(it.children);
          if (visibleChildren.length === 0) return null;
          return { ...it, children: visibleChildren };
        })
        .filter((it): it is NavItem => it !== null);
    return filterByPerm(allNavItems);
  }, []);

  // Auto-expand the group whose child URL matches current location.
  useEffect(() => {
    const path = location.pathname;
    const groupOfActive = navItems.find((g) =>
      g.children?.some((c) => c.href && (c.href === '/' ? path === '/' : path.startsWith(c.href))),
    );
    if (groupOfActive && !expanded.has(groupOfActive.label)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(groupOfActive.label);
        saveExpanded(next);
        return next;
      });
    }
    // Intentionally no `expanded` in deps — only react to location changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navItems]);

  const toggleGroup = (label: string) => {
    // When sidebar is collapsed in desktop mode, open it before expanding a group
    if (isCollapsed && !mobileOpen) setIsCollapsed(false);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      saveExpanded(next);
      return next;
    });
  };

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose();
  };

  const isLinkActive = (href: string): boolean =>
    href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  const groupHasActive = (item: NavItem): boolean =>
    !!item.children?.some((c) => c.href && isLinkActive(c.href));

  const showLabels = mobileOpen || !isCollapsed;

  const renderLink = (item: NavItem, indented: boolean) => {
    if (!item.href) return null;
    const isActive = isLinkActive(item.href);
    return (
      <Link
        key={item.label + item.href}
        to={item.href}
        title={!showLabels ? item.label : undefined}
        onClick={handleNavClick}
        className={cn(
          'flex items-center gap-3 px-3 py-2 my-0.5 rounded-md text-sm transition-colors duration-150',
          indented && showLabels && 'pl-9',
          isActive ? 'font-semibold' : 'font-medium hover:brightness-105',
        )}
        style={
          isActive
            ? { backgroundColor: 'var(--sidebar-accent)', color: 'var(--sidebar-primary)' }
            : { color: 'var(--sidebar-foreground)' }
        }
      >
        <item.icon
          size={indented ? 14 : 18}
          className={cn('flex-shrink-0', isActive ? '' : 'opacity-60')}
          style={isActive ? { color: 'var(--sidebar-primary)' } : undefined}
        />
        {showLabels && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  const renderGroup = (item: NavItem) => {
    const isOpen = expanded.has(item.label);
    const hasActive = groupHasActive(item);
    return (
      <div key={item.label}>
        <button
          type="button"
          onClick={() => toggleGroup(item.label)}
          title={!showLabels ? item.label : undefined}
          aria-expanded={isOpen}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2 my-0.5 rounded-md text-sm transition-colors duration-150 text-left',
            hasActive ? 'font-semibold' : 'font-medium hover:brightness-105',
          )}
          style={
            hasActive
              ? { color: 'var(--sidebar-primary)' }
              : { color: 'var(--sidebar-foreground)' }
          }
        >
          <item.icon
            size={18}
            className={cn('flex-shrink-0', hasActive ? '' : 'opacity-60')}
            style={hasActive ? { color: 'var(--sidebar-primary)' } : undefined}
          />
          {showLabels && (
            <>
              <span className="truncate flex-1">{item.label}</span>
              <ChevronDown
                size={14}
                className={cn('flex-shrink-0 opacity-60 transition-transform', isOpen && 'rotate-180')}
              />
            </>
          )}
        </button>
        {isOpen && showLabels && item.children?.map((child) => renderLink(child, true))}
      </div>
    );
  };

  const sidebarContent = (
    <aside
      data-no-print
      className={cn(
        'h-screen border-r transition-all duration-300 flex flex-col z-50 flex-shrink-0',
        mobileOpen ? 'w-[260px]' : (isCollapsed ? 'w-[60px]' : 'w-[240px]'),
      )}
      style={{
        backgroundColor: 'var(--sidebar)',
        borderColor: 'var(--sidebar-border)',
        color: 'var(--sidebar-foreground)',
      }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center justify-between px-3 border-b" style={{ borderColor: 'var(--sidebar-border)' }}>
        {(!isCollapsed || mobileOpen) && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img src={sidebarLogoSrc} alt="Logo" className={`w-full h-full object-contain ${needsInvert ? 'invert' : ''}`} />
            </div>
            <span className="text-sm font-bold tracking-tight truncate" style={{ color: 'var(--color-text-primary)' }}>
              {settings?.companyName || 'ERP PMD'}
            </span>
          </div>
        )}
        {isCollapsed && !mobileOpen && (
          <div className="w-8 h-8 flex items-center justify-center mx-auto overflow-hidden">
            <img src="/pwa-192x192.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
        )}

        {mobileOpen ? (
          <button
            onClick={onMobileClose}
            aria-label="Tutup menu"
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-auto flex-shrink-0"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Buka sidebar' : 'Tutup sidebar'}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ml-auto flex-shrink-0 hidden lg:block"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {navItems.map((item) => (item.children ? renderGroup(item) : renderLink(item, false)))}
      </nav>

      {/* Version */}
      {(mobileOpen || !isCollapsed) && (
        <div className="px-4 pb-1">
          <span className="text-xs font-mono tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
            v{APP_VERSION}
          </span>
        </div>
      )}

      {/* User */}
      <div className="border-t p-3" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div className={cn('flex items-center gap-2 p-2 rounded-md', !mobileOpen && isCollapsed && 'justify-center')}>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-xs flex-shrink-0"
            style={{ backgroundColor: 'var(--sidebar-accent)', color: 'var(--sidebar-primary)' }}
          >
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          {(mobileOpen || !isCollapsed) && (
            <div className="overflow-hidden">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--sidebar-foreground)' }}>{user?.fullName || 'User'}</p>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--muted-foreground)' }}>{user?.role || 'Admin'}</p>
            </div>
          )}
        </div>
        {(mobileOpen || !isCollapsed) && (
          <p
            className="text-[10px] text-center mt-2 leading-tight"
            style={{ color: 'var(--muted-foreground)' }}
          >
            © {new Date().getFullYear()} Arah Karya
            <br />
            <span className="opacity-70">by Yayang Setya Nugroho</span>
          </p>
        )}
      </div>
    </aside>
  );

  return sidebarContent;
};
