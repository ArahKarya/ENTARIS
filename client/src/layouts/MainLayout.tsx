import { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { LogOut, Search, Keyboard, KeyRound, Menu, Sun, Moon, Monitor } from 'lucide-react';
import { NotificationBell } from '../components/NotificationBell';
import { useHotkey } from '../hooks/useHotkeys';
import { CommandPalette } from '../components/CommandPalette';
import { ShortcutHelp } from '../components/ShortcutHelp';
import ChangePasswordModal from '../components/ChangePasswordModal';
import OnboardingWizard from '../components/OnboardingWizard';
import { useTheme } from '../contexts/ThemeContext';
import api from '../lib/api';

const routeNames: Record<string, string> = {
  '': 'Dashboard',
  'coa': 'Bagan Akun',
  'gl': 'Buku Besar',
  'sales': 'Penjualan',
  'quotations': 'Penawaran',
  'purchase': 'Pembelian',
  'payments': 'Bank & Kas',
  'parties': 'Pelanggan & Vendor',
  'reports': 'Laporan Keuangan',
  'inventory': 'Stok & Gudang',
  'reconciliation': 'Rekonsiliasi Bank',
  'settings': 'Pengaturan',
  'users': 'Manajemen User',
  'audit': 'Jejak Audit',
  'notifications': 'Notifikasi',
  'recurring': 'Transaksi Berulang',
};

export const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem('onboardingDone');
    if (done !== 'true') {
      setShowOnboarding(true);
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Update browser tab title to current page so tab list & history are useful
  useEffect(() => {
    const segment = location.pathname.split('/').filter(Boolean)[0] || '';
    const name = routeNames[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
    document.title = name ? `${name} — Simple ERP` : 'Simple ERP';
  }, [location.pathname]);

  useHotkey('mod+k', () => setIsSearchOpen(true));
  useHotkey('?', () => setIsShortcutHelpOpen(true), !isSearchOpen && !isShortcutHelpOpen);

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null');
  } catch {}

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('user');
    navigate('/login');
  };

  const cycleTheme = () => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
    setTheme(next);
  };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'system' ? Monitor : Sun;
  const themeTitle = theme === 'dark' ? 'Tema: Gelap (klik untuk Sistem)' : theme === 'system' ? 'Tema: Sistem (klik untuk Terang)' : 'Tema: Terang (klik untuk Gelap)';

  const segment = location.pathname.split('/').filter(Boolean)[0] || '';
  const pageName = routeNames[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Skip nav link (ACC-05) */}
      <a
        href="#main-content"
        className="skip-to-content"
      >
        Langsung ke konten utama
      </a>

      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out">
            <Sidebar mobileOpen={true} onMobileClose={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden main-content">
        {/* Header */}
        <header
          className="h-14 border-b border-border bg-card flex items-center px-3 lg:px-6 justify-between shrink-0"
          data-no-print
        >
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {/* Hamburger menu button - only on mobile */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-1.5 -ml-1 mr-1 rounded-md transition-colors hover:bg-accent text-muted-foreground lg:hidden"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="hidden sm:inline">Finance</span>
            <span className="hidden sm:inline opacity-50">/</span>
            <span className="font-medium text-foreground">{pageName}</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-1.5 rounded-md transition-colors hover:bg-accent text-muted-foreground"
              title="Pencarian (Ctrl+K)"
              aria-label="Buka pencarian"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={cycleTheme}
              className="p-1.5 rounded-md transition-colors hover:bg-accent text-muted-foreground"
              title={themeTitle}
              aria-label="Ganti tema"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsShortcutHelpOpen(true)}
              className="hidden sm:block p-1.5 rounded-md transition-colors hover:bg-accent text-muted-foreground"
              title="Pintasan Keyboard (?)"
              aria-label="Lihat pintasan keyboard"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <NotificationBell />
            <div className="flex items-center gap-2 sm:gap-2.5 pl-1.5 sm:pl-2 ml-0.5 sm:ml-1 border-l border-border">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-xs"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--primary)' }}
              >
                {user?.fullName?.charAt(0) || 'U'}
              </div>
              <div className="hidden md:block">
                <p className="text-xs font-semibold leading-none text-foreground">{user?.fullName || 'User'}</p>
                <p className="text-[10px] mt-1 uppercase tracking-wider text-muted-foreground">{user?.role || 'Role'}</p>
              </div>
            </div>
            <button
              onClick={() => setIsPasswordModalOpen(true)}
              aria-label="Ganti Password"
              className="hidden sm:block p-1.5 rounded-md transition-colors hover:bg-accent text-muted-foreground"
              title="Ganti Password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              aria-label="Logout"
              className="p-1.5 rounded-md transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div id="main-content" className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-background">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Shortcut Help */}
      <ShortcutHelp isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />

      {/* Change Password Modal */}
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

      {/* Onboarding Wizard */}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
};
