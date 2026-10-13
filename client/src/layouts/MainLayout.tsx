import { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sidebar } from '../components/Sidebar';
import { NotificationBell } from '../components/NotificationBell';
import { useHotkey } from '../hooks/useHotkeys';
import { useReturnFocus } from '../hooks/useReturnFocus';
import { CommandPalette } from '../components/CommandPalette';
import { ShortcutHelp } from '../components/ShortcutHelp';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { TelegramLinkDialog } from '../components/aira/TelegramLinkDialog';
import { chatKeys, fetchHealth } from '../components/aira/chatApi';
import { useQuery } from '@tanstack/react-query';
import OnboardingWizard from '../components/OnboardingWizard';
import { useCompanySettings } from '../contexts/CompanySettingsContext';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../components/ui/sheet';
import { Topbar } from '../components/shell/Topbar';
import { UserMenu } from '../components/shell/UserMenu';
import { AboutDialog } from '../components/shell/AboutDialog';
import { breadcrumbsFor, documentTitleFor } from '../app/routes';
import { getStoredUser } from '../lib/permissions';
import { tenantName } from '../components/auth/login-helpers';
import api from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { DummyDataBanner } from '@/components/shell/DummyDataBanner';

export const MainLayout = () => {
  const { t, i18n } = useTranslation('shell');
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useCompanySettings();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isTelegramLinkOpen, setIsTelegramLinkOpen] = useState(false);
  // Same query as the chat page; the menu item only appears when the bot could be used.
  const airaHealth = useQuery({
    queryKey: chatKeys.health,
    queryFn: fetchHealth,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const airaAvailable = !!airaHealth.data?.configured && airaHealth.data.agenticEnabled !== false;
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  // OnboardingWizard gates itself (admin + server onboardedAt); the legacy
  // localStorage flag only short-circuits the mount.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return localStorage.getItem('onboardingDone') !== 'true'; } catch { return true; }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // The drawer opens from the hamburger without a Sheet.Trigger: return focus there.
  const drawerFocus = useReturnFocus();

  // Close mobile menu on route change (e.g. browser back while the drawer is open)
  const [menuPath, setMenuPath] = useState(location.pathname);
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname);
    setMobileMenuOpen(false);
  }

  // Browser tab title comes from the route registry (the only place that sets it
  // for protected pages): "<Halaman> · <Perusahaan|Entaris>".
  // The seed placeholder ("Nama Perusahaan Anda") counts as no company name.
  const companyName = tenantName(settings?.companyName);
  // The label is translated on read, so the title also follows a language change.
  const language = i18n.language;
  useEffect(() => {
    document.title = documentTitleFor(location.pathname, companyName);
  }, [location.pathname, companyName, language]);

  useHotkey('mod+k', () => setIsSearchOpen(true));
  useHotkey('?', () => setIsShortcutHelpOpen(true), !isSearchOpen && !isShortcutHelpOpen);

  // Read once per mount; ProtectedRoute refreshes the stored user before this renders.
  const user = useMemo(() => getStoredUser(), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- labels are translated on read; recompute on language change
  const breadcrumbs = useMemo(() => breadcrumbsFor(location.pathname), [location.pathname, language]);

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('user');
    queryClient.clear();
    navigate('/login');
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      {/* Skip nav link (ACC-05) */}
      <a
        href="#main-content"
        className="skip-to-content"
      >
        {t('layout.skipToContent')}
      </a>

      {/* Desktop Sidebar (hidden on mobile) */}
      <div className="hidden h-full shrink-0 lg:block">
        <Sidebar />
      </div>

      {/* Mobile Sidebar Drawer: Radix dialog gives focus trap, Esc and scroll lock */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent
          side="left"
          className="w-[280px] max-w-[85vw] p-0 sm:max-w-[280px] lg:hidden"
          onOpenAutoFocus={drawerFocus.capture}
          onCloseAutoFocus={drawerFocus.onCloseAutoFocus}
        >
          <SheetTitle className="sr-only">{t('layout.mobileMenuTitle')}</SheetTitle>
          <SheetDescription className="sr-only">{t('layout.mobileMenuDescription')}</SheetDescription>
          <Sidebar mobile onNavigate={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Landmarks: <header> (topbar) is a sibling of <main> so it stays a banner. */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden main-content">
        <Topbar
          breadcrumbs={breadcrumbs}
          onOpenMenu={() => setMobileMenuOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          notifications={<NotificationBell />}
          userMenu={
            <UserMenu
              user={user}
              companyName={companyName}
              onChangePassword={() => setIsPasswordModalOpen(true)}
              onLinkTelegram={airaAvailable ? () => setIsTelegramLinkOpen(true) : undefined}
              onOpenShortcuts={() => setIsShortcutHelpOpen(true)}
              onOpenAbout={() => setIsAboutOpen(true)}
              onLogout={handleLogout}
            />
          }
        />

        {/* Content */}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-background focus:outline-none">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            <DummyDataBanner />
            <Outlet />
          </div>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Shortcut Help */}
      <ShortcutHelp isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />

      {/* Change Password Modal */}
      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />
      <TelegramLinkDialog isOpen={isTelegramLinkOpen} onClose={() => setIsTelegramLinkOpen(false)} />

      {/* About (version + credits live here, not in the chrome) */}
      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />

      {/* Onboarding Wizard */}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
};
