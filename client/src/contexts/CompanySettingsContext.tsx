import React, { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface CompanySettings {
  id: string;
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  logoUrlDark: string | null;
  defaultCurrency: string;
  fiscalYearStartMonth?: number;
  onboardedAt?: string | null;
}

const CompanySettingsContext = createContext<CompanySettings | null>(null);

/** Default favicon path (shipped in /public) */
const DEFAULT_FAVICON = '/favicon.png';

export const CompanySettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const res = await api.get('/settings/company');
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ── Favicon ──────────────────────────────────────────────────────────────
  // The tab title is owned by MainLayout (route registry + companyName), so it
  // is not set here: setting it twice made the label flicker or get overwritten.
  const hasCompanyData = Boolean(data);
  useEffect(() => {
    if (!hasCompanyData) return;

    // Favicon always uses the static app icon (not company logo)
    const link: HTMLLinkElement =
      document.querySelector('link[rel="icon"]') ||
      (() => {
        const el = document.createElement('link');
        el.rel = 'icon';
        document.head.appendChild(el);
        return el;
      })();

    link.href = DEFAULT_FAVICON;
    link.type = 'image/png';
  }, [hasCompanyData]);

  return (
    <CompanySettingsContext.Provider value={data ?? null}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => useContext(CompanySettingsContext);
