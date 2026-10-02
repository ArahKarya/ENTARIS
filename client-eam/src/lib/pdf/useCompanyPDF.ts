import { useQuery } from '@tanstack/react-query';
import api from '../api';

export interface InvoiceFormatSettings {
  sales?: {
    bankAccounts?: string;
    footerNote?: string;
    showSignature?: boolean;
    signatureLabels?: string[];
  };
  purchase?: {
    footerNote?: string;
    showSignature?: boolean;
    signatureLabels?: string[];
  };
}

export interface CompanyPDF {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  logoUrl: string | null;
  invoiceSettings: InvoiceFormatSettings | null;
}

const FALLBACK: CompanyPDF = {
  name: 'Perusahaan',
  address: null,
  phone: null,
  email: null,
  taxId: null,
  logoUrl: null,
  invoiceSettings: null,
};

/**
 * Returns company info suitable for use in PDF headers.
 * Falls back to a default object if settings have not been configured yet.
 */
export function useCompanyPDF(): CompanyPDF {
  const { data } = useQuery({
    queryKey: ['company-settings-pdf'],
    queryFn: async () => {
      const r = await api.get('/settings/company');
      return r.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data) return FALLBACK;

  return {
    name:    data.companyName  || FALLBACK.name,
    address: data.address      || null,
    phone:   data.phone        || null,
    email:   data.email        || null,
    taxId:   data.taxId        || null,
    logoUrl: data.logoUrl      || null,
    invoiceSettings: data.invoiceSettings || null,
  };
}
