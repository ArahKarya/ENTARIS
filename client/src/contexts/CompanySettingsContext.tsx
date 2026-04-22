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

  // ── Dynamic favicon & title ──────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;

    // Update page title
    if (data.companyName) {
      document.title = `Keuangan - ${data.companyName}`;
    }

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
  }, [data?.companyName]);

  return (
    <CompanySettingsContext.Provider value={data ?? null}>
      {children}
    </CompanySettingsContext.Provider>
  );
};

export const useCompanySettings = () => useContext(CompanySettingsContext);
