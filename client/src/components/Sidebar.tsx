import React, { useMemo } from 'react';
import {
  LayoutDashboard,
  Receipt,
  ShoppingCart,
  Users,
  FileBarChart,
  Settings,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Package,
  Network,
  Warehouse,
  Shield,
  ScrollText,
  Repeat,
  Scale,
  Wallet,
  X,
  ClipboardCheck,
  HeartPulse,
  Building2,
  ShieldCheck,
  FileSignature,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { useTheme } from '../contexts/ThemeContext';
import { APP_VERSION } from '../lib/version';

type NavItem = { icon: React.FC<any>; label: string; href: string; roles?: string[] };

const allNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/' },
  { icon: Network, label: 'Bagan Akun', href: '/coa', roles: ['Admin', 'Accountant', 'Viewer'] },
  { icon: Receipt, label: 'Buku Besar', href: '/gl', roles: ['Admin', 'Accountant', 'Viewer'] },
  { icon: FileSignature, label: 'Penawaran', href: '/quotations', roles: ['Admin', 'Accountant', 'Viewer'] },
  { icon: ShoppingCart, label: 'Penjualan', href: '/sales', roles: ['Admin', 'Accountant', 'Viewer'] },
  { icon: Package, label: 'Pembelian', href: '/purchase', roles: ['Admin', 'Accountant', 'StaffProduksi'] },
  { icon: Warehouse, label: 'Stok & Gudang', href: '/inventory' },
  { icon: ClipboardCheck, label: 'Stok Opname', href: '/stock-opname', roles: ['Admin', 'Accountant'] },
  { icon: CreditCard, label: 'Bank & Kas', href: '/payments', roles: ['Admin', 'Accountant', 'Viewer'] },
  { icon: Wallet, label: 'Uang Muka Vendor', href: '/vendor-deposits', roles: ['Admin', 'Accountant', 'StaffProduksi'] },
  { icon: Wallet, label: 'Uang Muka Pelanggan', href: '/customer-deposits', roles: ['Admin', 'Accountant'] },
  { icon: Scale, label: 'Rekonsiliasi Bank', href: '/reconciliation', roles: ['Admin', 'Accountant'] },
  { icon: Users, label: 'Pelanggan & Vendor', href: '/parties', roles: ['Admin', 'Accountant', 'StaffProduksi'] },
  { icon: Repeat, label: 'Transaksi Berulang', href: '/recurring', roles: ['Admin', 'Accountant'] },
  { icon: Building2, label: 'Aset Tetap', href: '/fixed-assets', roles: ['Admin', 'Accountant'] },
  { icon: FileBarChart, label: 'Laporan Keuangan', href: '/reports', roles: ['Admin', 'Accountant', 'Viewer'] },
  { icon: ShieldCheck, label: 'Approval', href: '/approvals', roles: ['Admin', 'Accountant'] },
  { icon: Settings, label: 'Pengaturan', href: '/settings', roles: ['Admin'] },
  { icon: Shield, label: 'Manajemen User', href: '/users', roles: ['Admin'] },
  { icon: ScrollText, label: 'Jejak Audit', href: '/audit', roles: ['Admin'] },
  { icon: HeartPulse, label: 'Health Check', href: '/health-check', roles: ['Admin'] },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const location = useLocation();
  const settings = useCompanySettings();
  const { resolvedTheme } = useTheme();

  // Pick the right logo variant per theme, with sensible fallbacks so the sidebar
  // logo stays visible in both modes. Default static icon ships as white, so it
  // needs inversion only on light backgrounds.
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

  const navItems = useMemo(() => {
    const role = user?.role;
    return allNavItems.filter((item) => !item.roles || item.roles.includes(role));
  }, [user?.role]);

  const handleNavClick = () => {
    // Auto-close sidebar on mobile when a nav item is clicked
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const sidebarContent = (
    <aside
      data-no-print
      className={cn(
        'h-screen border-r transition-all duration-300 flex flex-col z-50 flex-shrink-0',
        // On mobile (inside drawer), always show full width
        mobileOpen ? 'w-[260px]' : (isCollapsed ? 'w-[60px]' : 'w-[220px]')
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
              {settings?.companyName || 'Keuangan'}
            </span>
          </div>
        )}
        {isCollapsed && !mobileOpen && (
          <div className="w-8 h-8 flex items-center justify-center mx-auto overflow-hidden">
            <img src="/pwa-192x192.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
        )}

        {/* On mobile: show close button. On desktop: show collapse toggle */}
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
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href));
          const showLabel = mobileOpen || !isCollapsed;
          return (
            <Link
              key={item.label}
              to={item.href}
              title={!showLabel ? item.label : undefined}
              onClick={handleNavClick}
              className={cn(
                'flex items-center gap-3 px-3 py-2 my-0.5 rounded-md text-sm transition-colors duration-150',
                isActive
                  ? 'font-semibold'
                  : 'font-medium hover:brightness-105'
              )}
              style={
                isActive
                  ? { backgroundColor: 'var(--sidebar-accent)', color: 'var(--sidebar-primary)' }
                  : { color: 'var(--sidebar-foreground)' }
              }
            >
              <item.icon
                size={18}
                className={cn('flex-shrink-0', isActive ? '' : 'opacity-60')}
                style={isActive ? { color: 'var(--sidebar-primary)' } : undefined}
              />
              {showLabel && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
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
